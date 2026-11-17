# Payments — WaafiPay mobile wallets

> **Soo koobid (Somali):** Macmiilku wuxuu geliyaa lambarkiisa; nidaamku wuxuu ka garanayaa
> wallet-ka (EVC Plus, ZAAD, SAHAL…) horgalaha lambarka, kadibna wuxuu WaafiPay u dirayaa codsi
> lacag-bixin. Macmiilku wuxuu telefoonkiisa ku ansixiyaa PIN-ka (ilaa 5 daqiiqo). Marka la
> ansixiyo, dalabka waxaa loo calaamadeeyaa "la bixiyay" kaydkana waa laga jaraa. Lacagta waxaa
> la celin karaa 24 saac gudahood oo keliya. Haddii WaafiPay aysan jawaab soo celin (`UNKNOWN`),
> lacag-bixintu waxay ahaanaysaa "sugaysa" 6 daqiiqo — ha isku dayin mar kale; shaqaalaha ayaa
> WaafiPay portal-ka ka hubinaya kadibna gacan ku xaqiijinaya (`confirm`). Furayaasha (API keys) waxay ku jiraan Supabase
> secrets — weligood frontend-ka ha la gelin.

## Flow

```
Browser / POS ──POST waafi-pay {action:"purchase", order_id, phone}──▶ Edge Function
   1. verify JWT, load caller profile (must be active)
   2. caller = order.user_id  OR  has_permission('payments.initiate')
   3. normalise phone → 2526XXXXXXXX, detect wallet from wallet_prefixes
      (staff may override `wallet`; customers may not)
   4. start_payment(p_stale_after => '6 minutes') — SQL, row-locked: expires stale
      attempts (> 6 min → payment failed/TIMEOUT, orders.payment_status = failed),
      rejects paid/cancelled orders and in-flight attempts, inserts payments
      row (status pending, amount = orders.total), orders.payment_status = pending
   5. WaafiPay API_PURCHASE (synchronous, payer enters PIN; abort after 120 s)
   6a. APPROVED → payment approved + transaction ids, mark_order_paid() (stock −),
       audit 'payment.approved'. If params.txAmount differs from the payment amount
       by > 0.009 it is still recorded as paid (money was taken) but the order gets
       needs_review = true, review_reason 'AMOUNT_MISMATCH: expected X got Y'
       (audit 'order.needs_review').
   6b. explicit gateway answer (decline, 5306 cancelled, 5309 timeout) → payment
       failed/cancelled, orders.payment_status = failed, audit 'payment.failed'
   6c. NO answer (120 s abort, transport error, unreadable body) → code UNKNOWN:
       payment stays `pending` with response_code 'UNKNOWN', order stays pending,
       retries are blocked until the attempt goes stale (6 min), audit 'payment.unknown'.
       Staff then reconcile with action `confirm` (below) or let it expire.
   ◀── PayResponse { ok, status, payment_id, wallet, code, message (so), message_en, order }
```

Success requires **`responseCode == "2001"` AND `params.state == "APPROVED"`**. A 2001 without an
approved state is treated as declined. The `payments` table is published to Realtime, so checkout/POS
screens can also follow status changes live (`subscribeToOrderPayments`).

Other actions:

| Action    | Permission          | Behaviour |
|-----------|---------------------|-----------|
| `cash`    | `payments.initiate` | Records provider `cash`, wallet `CASH`, status approved, `mark_order_paid`. |
| `confirm` | `payments.refund`   | Manual reconciliation after checking the WaafiPay portal. Body `{ order_id, payment_id, transaction_id, reason? }`; `transaction_id` required, ≤ 64 chars `[A-Za-z0-9._-]`. Payment must be a WaafiPay payment of that order in status `pending`/`initiated`/`failed`; order must not be paid/refunded/cancelled; no other approved or in-flight payment for the order; transaction id not used by another payment. Sets payment `approved`, `response_code 'MANUAL'`, `response_msg 'Confirmed manually by <name>: <reason>'`, calls `mark_order_paid`, audit `payment.manual_confirm`. |
| `reverse` | `payments.refund`   | Approved payment only. WaafiPay: `API_REVERSAL` with the `transactionId` (≤ 24 h, before settlement). Cash: recorded only. Then payment → `reversed`, `refund_order()` sets order `refunded` and restocks items. `reason` is required. |

### Response codes

| code | HTTP | meaning |
|------|------|---------|
| — (ok) | 200 | approved / cash recorded / reversed / manually confirmed |
| `DECLINED` | 200 | gateway declined (WaafiPay `responseMsg` appended, e.g. insufficient balance) |
| `CANCELLED` | 200 | payer cancelled (5306) — payment row status `cancelled` |
| `TIMEOUT` | 200 | WaafiPay answered 5309: payer did not approve within WaafiPay's 5-minute window — final, retry allowed |
| `UNKNOWN` | 200 | no answer from WaafiPay (abort after 120 s, transport error, unreadable body). `status:"pending"`; do **not** retry for 6 min; staff verify in the portal and `confirm` |
| `GATEWAY_ERROR` | 200 | reversal transport error |
| `INVALID_PHONE` | 400 | not a valid Somali mobile number |
| `BAD_REQUEST` | 400 | malformed body, missing reversal reason, invalid wallet override, invalid `transaction_id` |
| `UNAUTHORIZED` | 401 | missing/invalid session |
| `FORBIDDEN` | 403 | not the order owner and no `payments.initiate`; wallet override by a customer; `confirm`/`reverse` without `payments.refund` |
| `NOT_FOUND` | 404 | order / payment not found |
| `ORDER_NOT_PAYABLE` | 409 | order already paid, refunded or cancelled; `confirm` on a non-confirmable payment, an order with another approved payment, or a reused transaction id |
| `PAYMENT_IN_PROGRESS` | 409 | another attempt for this order started < 6 min ago (also: `confirm` while another attempt is in flight) |
| `NOT_REVERSIBLE` | 409 | payment not approved, older than 24 h, or order not paid |
| `WALLET_NOT_DETECTED` | 422 | no active prefix matches the number |
| `NOT_CONFIGURED` | 503 | live mode without WaafiPay credentials |

Every body has the PayResponse shape (`ok:false, status:"failed"` for errors) and always carries
both `message` (Somali) and `message_en`, so `payOrder()` never throws.

**Timing.** WaafiPay holds API_PURCHASE open while the payer has up to **5 minutes** to approve
(then answers 5309). The edge function aborts its HTTP call after **120 s** (Supabase edge request
limits), so a slow approval can surface as `UNKNOWN`. Our stale window is **6 minutes**
(`PAYMENT_STALE_MINUTES`, SQL `start_payment`/`cancel_order`): after that no late approval can
arrive, so the attempt is expired (payment failed/TIMEOUT, order payment_status failed) and a new
attempt is allowed. A late approval that WaafiPay did process is reconciled with `confirm`.

## Secrets

Set with `supabase secrets set` (or `scripts/deploy-supabase.sh`, which reads them from your env):

| Secret | Value |
|--------|-------|
| `WAAFI_MERCHANT_UID` | Merchant UID (e.g. `M0910xxx`) |
| `WAAFI_API_USER_ID` | API user id |
| `WAAFI_API_KEY` | API key — never logged, stripped from stored responses |
| `WAAFI_ENV` | `sandbox` (default) → `https://sandbox.waafipay.com/asm`, `production` → `https://api.waafipay.net/asm` |
| `WAAFI_BASE_URL` | optional https override of the endpoint above (invalid/non-https ⇒ `NOT_CONFIGURED`) |
| `WAAFI_MODE` | `live` (default) or `mock` |
| `ALLOWED_ORIGINS` | optional comma-separated CORS allow-list (default `*`) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
Phone numbers are masked in logs (`25261****678`); `payments.raw_response` is stored without
credentials and with `accountNo` masked.

## Mock mode (no WaafiPay account needed)

`supabase secrets set WAAFI_MODE=mock` — the function behaves exactly like live mode (DB writes,
stock, audit, Realtime) but the gateway is simulated after ~2 s:

| Number ends with | Result |
|------------------|--------|
| `0000` | declined (`DECLINED`, "insufficient balance") |
| `9999` | timed out (`TIMEOUT`, as WaafiPay code 5309) |
| anything else | approved (transaction id `MOCK…`) |

Reversals always succeed in mock mode. **Never leave mock mode on in production.**

## Sandbox testing

> The default sandbox host `https://sandbox.waafipay.com/asm` is the one documented at
> docs.waafipay.com (API introduction). **Confirm the sandbox host with WaafiPay** when you receive
> your credentials; if they give you a different URL, set `WAAFI_BASE_URL` instead of changing code.

1. Get sandbox credentials from WaafiPay, set `WAAFI_ENV=sandbox`, `WAAFI_MODE=live` plus the three keys.
2. Deploy (`scripts/deploy-supabase.sh`), place an order, pay with your sandbox test wallet number.
3. Approve the push/USSD prompt on the phone; the request returns when the payer acts (or after 120 s).
4. Check `payments` (status, `response_code`, `response_msg`) and `audit_log` for the trail.
5. Switch to production: `WAAFI_ENV=production` with production credentials.

## Wallet prefixes

Detection uses `public.wallet_prefixes` (admin-editable in Settings; longest active prefix wins).
Seeded defaults — **verify with your WaafiPay account manager**:

| Prefix (after 252) | Wallet | Operator |
|--------------------|--------|----------|
| `61` | EVC Plus | Hormuud |
| `77` | EVC Plus | Hormuud |
| `63` | ZAAD | Telesom |
| `90` | SAHAL | Golis |

Other wallets (`WAAFI`, `JEEB`, `EDAHAB`) can be added as prefixes; whether WaafiPay accepts them
via `MWALLET_ACCOUNT` depends on your merchant contract. Staff with `payments.initiate` can override
the detected wallet; the override is only recorded — WaafiPay routes by the number itself.

## Manual confirmation & review flags

- **UNKNOWN payments.** Open the order in admin, look up the payment's `reference_id` (or payer
  number/time) in the WaafiPay merchant portal. If the portal shows it approved, call
  `waafi-pay {action:"confirm", order_id, payment_id, transaction_id, reason}` with the portal's
  transaction id — this works while the payment is still `pending` and also after it expired to
  `failed`. If the portal shows nothing/declined, do nothing: it expires after 6 minutes and the
  customer can pay again.
- **`orders.needs_review` / `review_reason`.** Set when WaafiPay's `txAmount` does not match the
  amount we requested (`AMOUNT_MISMATCH: expected X got Y`). The order is still paid; staff should
  compare with the portal and reverse/adjust as needed, then clear the flag.

## Reversals

- WaafiPay only reverses within **24 h** and **before settlement**; after that, refund manually
  through the WaafiPay portal and record it here as needed.
- The function enforces the 24 h window client-side and surfaces WaafiPay's rejection message.
- Successful reversal: payment `reversed`, order `payment_status=refunded`, `status=refunded`,
  items restocked (`refund_order`, idempotent). Cash reversals skip the gateway.

## Database objects (migrations `20261117000002_payments.sql`, `20261117000008_review_fixes.sql`)

- `start_payment(...)` — atomic double-charge guard + payment insert (service role only);
  the edge function passes `p_stale_after => '6 minutes'`.
- `orders.needs_review boolean`, `orders.review_reason text` — set on amount mismatch.
- `refund_order(order_id)` — refund + restock (service role only).
- Index `payments_order_status_idx`.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `NOT_CONFIGURED` | Missing `WAAFI_*` secrets in live mode. Set them or use `WAAFI_MODE=mock`. |
| `WALLET_NOT_DETECTED` | Prefix missing/inactive in `wallet_prefixes`; add it in Settings. |
| `PAYMENT_IN_PROGRESS` | A request is still waiting for the payer (or ended `UNKNOWN`). Wait up to 6 min; it then expires automatically. |
| `UNKNOWN` | WaafiPay did not answer within 120 s; the payer **may** have been charged. Check the WaafiPay portal using the `reference_id`; if approved use `confirm`, otherwise wait 6 min and retry. |
| `TIMEOUT` | WaafiPay reported 5309: the payer did not approve in time. Nothing was charged; retry. |
| `DECLINED (…)` | Read the gateway text: insufficient balance, wrong PIN, account blocked, etc. |
| Payment approved but order not paid | See `audit_log` action `payment.mark_paid_failed`; run `select mark_order_paid('<order id>')` as service role. |
| 401 from the function | The browser sent no/expired session; sign in again. Both functions use `verify_jwt = true`. |
| Edge logs | `supabase functions logs waafi-pay` (phone numbers are masked). |
