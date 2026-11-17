# Payments — WaafiPay mobile wallets

> **Soo koobid (Somali):** Macmiilku wuxuu geliyaa lambarkiisa; nidaamku wuxuu ka garanayaa
> wallet-ka (EVC Plus, ZAAD, SAHAL…) horgalaha lambarka, kadibna wuxuu WaafiPay u dirayaa codsi
> lacag-bixin. Macmiilku wuxuu telefoonkiisa ku ansixiyaa PIN-ka (ilaa 5 daqiiqo). Marka la
> ansixiyo, dalabka waxaa loo calaamadeeyaa "la bixiyay" kaydkana waa laga jaraa. Lacagta waxaa
> la celin karaa 24 saac gudahood oo keliya. Furayaasha (API keys) waxay ku jiraan Supabase
> secrets — weligood frontend-ka ha la gelin.

## Flow

```
Browser / POS ──POST waafi-pay {action:"purchase", order_id, phone}──▶ Edge Function
   1. verify JWT, load caller profile (must be active)
   2. caller = order.user_id  OR  has_permission('payments.initiate')
   3. normalise phone → 2526XXXXXXXX, detect wallet from wallet_prefixes
      (staff may override `wallet`; customers may not)
   4. start_payment()  — SQL, row-locked: expires stale attempts (>3 min),
      rejects paid/cancelled orders and in-flight attempts, inserts payments
      row (status pending, amount = orders.total), orders.payment_status = pending
   5. WaafiPay API_PURCHASE (synchronous, payer enters PIN; abort after 120 s)
   6a. APPROVED → payment approved + transaction ids, mark_order_paid() (stock −),
       audit 'payment.approved'
   6b. otherwise → payment failed/cancelled, orders.payment_status = failed,
       audit 'payment.failed'
   ◀── PayResponse { ok, status, payment_id, wallet, code, message (so), message_en, order }
```

Success requires **`responseCode == "2001"` AND `params.state == "APPROVED"`**. A 2001 without an
approved state is treated as declined. The `payments` table is published to Realtime, so checkout/POS
screens can also follow status changes live (`subscribeToOrderPayments`).

Other actions:

| Action    | Permission          | Behaviour |
|-----------|---------------------|-----------|
| `cash`    | `payments.initiate` | Records provider `cash`, wallet `CASH`, status approved, `mark_order_paid`. |
| `reverse` | `payments.refund`   | Approved payment only. WaafiPay: `API_REVERSAL` with the `transactionId` (≤ 24 h, before settlement). Cash: recorded only. Then payment → `reversed`, `refund_order()` sets order `refunded` and restocks items. `reason` is required. |

### Response codes

| code | HTTP | meaning |
|------|------|---------|
| — (ok) | 200 | approved / cash recorded / reversed |
| `DECLINED` | 200 | gateway declined (WaafiPay `responseMsg` appended, e.g. insufficient balance) |
| `CANCELLED` | 200 | payer cancelled (5306) — payment row status `cancelled` |
| `TIMEOUT` | 200 | payer did not act within 5 min (5309) **or** no gateway reply within 120 s |
| `GATEWAY_ERROR` | 200 | transport error / unparsable response |
| `INVALID_PHONE` | 400 | not a valid Somali mobile number |
| `BAD_REQUEST` | 400 | malformed body, missing reversal reason, invalid wallet override |
| `UNAUTHORIZED` | 401 | missing/invalid session |
| `FORBIDDEN` | 403 | not the order owner and no `payments.initiate`; wallet override by a customer |
| `NOT_FOUND` | 404 | order / payment not found |
| `ORDER_NOT_PAYABLE` | 409 | order already paid, refunded or cancelled |
| `PAYMENT_IN_PROGRESS` | 409 | another attempt for this order started < 3 min ago |
| `NOT_REVERSIBLE` | 409 | payment not approved, older than 24 h, or order not paid |
| `WALLET_NOT_DETECTED` | 422 | no active prefix matches the number |
| `NOT_CONFIGURED` | 503 | live mode without WaafiPay credentials |

Every body has the PayResponse shape (`ok:false, status:"failed"` for errors), so
`payOrder()` never throws.

## Secrets

Set with `supabase secrets set` (or `scripts/deploy-supabase.sh`, which reads them from your env):

| Secret | Value |
|--------|-------|
| `WAAFI_MERCHANT_UID` | Merchant UID (e.g. `M0910xxx`) |
| `WAAFI_API_USER_ID` | API user id |
| `WAAFI_API_KEY` | API key — never logged, stripped from stored responses |
| `WAAFI_ENV` | `sandbox` (default) → `https://sandbox.waafipay.com/asm`, `production` → `https://api.waafipay.net/asm` |
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

## Reversals

- WaafiPay only reverses within **24 h** and **before settlement**; after that, refund manually
  through the WaafiPay portal and record it here as needed.
- The function enforces the 24 h window client-side and surfaces WaafiPay's rejection message.
- Successful reversal: payment `reversed`, order `payment_status=refunded`, `status=refunded`,
  items restocked (`refund_order`, idempotent). Cash reversals skip the gateway.

## Database objects (migration `20261117000002_payments.sql`)

- `start_payment(...)` — atomic double-charge guard + payment insert (service role only).
- `refund_order(order_id)` — refund + restock (service role only).
- Index `payments_order_status_idx`.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `NOT_CONFIGURED` | Missing `WAAFI_*` secrets in live mode. Set them or use `WAAFI_MODE=mock`. |
| `WALLET_NOT_DETECTED` | Prefix missing/inactive in `wallet_prefixes`; add it in Settings. |
| `PAYMENT_IN_PROGRESS` | A request is still waiting for the payer. Wait up to 3 min; it then expires automatically. |
| `TIMEOUT` with "No response from WaafiPay" | Network/gateway did not answer within 120 s; the payer **may** still have been charged. Check the payer's SMS or the WaafiPay portal using the `reference_id` before retrying. |
| `DECLINED (…)` | Read the gateway text: insufficient balance, wrong PIN, account blocked, etc. |
| Payment approved but order not paid | See `audit_log` action `payment.mark_paid_failed`; run `select mark_order_paid('<order id>')` as service role. |
| 401 from the function | The browser sent no/expired session; sign in again. Both functions use `verify_jwt = true`. |
| Edge logs | `supabase functions logs waafi-pay` (phone numbers are masked). |
