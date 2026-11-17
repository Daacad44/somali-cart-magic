// Edge Function: waafi-pay
// POST { action: "purchase", order_id, phone, wallet? }
//      { action: "cash", order_id }
//      { action: "reverse", order_id, payment_id, reason }
//      { action: "confirm", order_id, payment_id, transaction_id, reason? }   (manual reconciliation)
// → PayResponse { ok, status, payment_id, wallet, message, message_en, code, order }
//
// Amounts always come from the database. WaafiPay API_PURCHASE is synchronous:
// the request stays open while the payer approves with their PIN (WaafiPay waits
// up to 5 min; we abort after 120 s). No answer ⇒ code UNKNOWN, payment stays
// `pending` (retries blocked for PAYMENT_STALE_MINUTES) and staff reconcile it
// via `confirm` after checking the WaafiPay portal.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { audit, getCaller, type Caller } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { errorResponse, HttpError, isUuid, json, readJson } from "../_shared/http.ts";
import {
  loadWaafiConfig,
  waafiPurchase,
  waafiReversal,
  WaafiNetworkTimeout,
  type GatewayCall,
} from "../_shared/waafipay.ts";
import {
  amountMismatchReason,
  buildDescription,
  buildReferenceId,
  checkPayability,
  checkReversible,
  classifyPurchaseFailure,
  CONFIRMABLE_STATUSES,
  formatAmount,
  isWallet,
  normalizeTransactionId,
  PAY_MESSAGES,
  PAYMENT_STALE_INTERVAL,
  parsePurchaseResponse,
  parseReversalResponse,
  shortRandom,
  type PayCode,
  type PaymentRowStatus,
  type PurchaseCallResult,
} from "../_shared/waafipay-logic.ts";
import { detectWallet, maskPhone, normalizeSomaliPhone, type Wallet, type WalletPrefix } from "../_shared/wallet.ts";

const FN = "waafi-pay";

// Columns returned to clients (raw_response is intentionally excluded).
const PAYMENT_COLS =
  "id, order_id, provider, wallet, account_no, amount, currency, status, reference_id, request_id, " +
  "transaction_id, issuer_transaction_id, response_code, response_msg, initiated_by, created_at, updated_at";

interface PayBody {
  action?: string;
  order_id?: unknown;
  phone?: unknown;
  wallet?: unknown;
  payment_id?: unknown;
  reason?: unknown;
  transaction_id?: unknown;
}

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  created_by: string | null;
  status: string;
  payment_status: string;
  total: number | string;
  currency: string;
}

interface PaymentRow {
  id: string;
  order_id: string;
  provider: "waafipay" | "cash";
  wallet: Wallet | "CASH" | null;
  account_no: string | null;
  amount: number | string;
  status: PaymentRowStatus;
  reference_id: string;
  transaction_id: string | null;
  created_at: string;
  raw_response: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payError(status: number, code: PayCode, override?: { so: string; en: string }): HttpError {
  const msg = override ?? PAY_MESSAGES[code];
  return new HttpError(status, code, msg.so, { message_en: msg.en, status: "failed" });
}

/** Maps SQL exceptions raised by start_payment/refund_order to PayCodes. */
function mapDbError(err: { message?: string } | null): HttpError | null {
  const m = err?.message ?? "";
  if (m.includes("PAYMENT_IN_PROGRESS")) return payError(409, "PAYMENT_IN_PROGRESS");
  if (m.includes("ORDER_NOT_PAYABLE") || m.includes("ORDER_NOT_PAID")) return payError(409, "ORDER_NOT_PAYABLE");
  if (m.includes("ORDER_NOT_FOUND")) return payError(404, "NOT_FOUND");
  return null;
}

async function loadOrder(admin: SupabaseClient, orderId: string): Promise<OrderRow> {
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, user_id, created_by, status, payment_status, total, currency")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw payError(404, "NOT_FOUND", { so: "Dalabka lama helin.", en: "Order not found." });
  return data as OrderRow;
}

/** Full order with items + payments (no raw gateway responses) for the response. */
async function freshOrder(admin: SupabaseClient, orderId: string): Promise<Record<string, unknown> | undefined> {
  const { data, error } = await admin
    .from("orders")
    .select(`*, customer:customers(id, full_name, phone), items:order_items(*), payments(${PAYMENT_COLS})`)
    .eq("id", orderId)
    .order("created_at", { referencedTable: "payments", ascending: false })
    .maybeSingle();
  if (error) {
    console.error(`[${FN}] reload order failed:`, error.message);
    return undefined;
  }
  return data ?? undefined;
}

async function loadPrefixes(admin: SupabaseClient): Promise<WalletPrefix[]> {
  const { data, error } = await admin.from("wallet_prefixes").select("prefix, wallet, provider_name, is_active").eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as WalletPrefix[];
}

async function startPayment(
  admin: SupabaseClient,
  args: {
    orderId: string;
    provider: "waafipay" | "cash";
    wallet: Wallet | "CASH";
    accountNo: string | null;
    referenceId: string;
    requestId: string;
    initiatedBy: string;
    status: "pending" | "approved";
  },
): Promise<PaymentRow> {
  const { data, error } = await admin.rpc("start_payment", {
    p_order_id: args.orderId,
    p_provider: args.provider,
    p_wallet: args.wallet,
    p_account_no: args.accountNo,
    p_reference_id: args.referenceId,
    p_request_id: args.requestId,
    p_initiated_by: args.initiatedBy,
    p_status: args.status,
    p_stale_after: PAYMENT_STALE_INTERVAL,
  });
  if (error) throw mapDbError(error) ?? error;
  return data as PaymentRow;
}

/** Flags an order for staff review (orders.needs_review / review_reason) and audits it. */
async function flagForReview(
  admin: SupabaseClient,
  orderId: string,
  actorId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin.from("orders").update({ needs_review: true, review_reason: reason }).eq("id", orderId);
  if (error) console.error(`[${FN}] flagging order ${orderId} for review failed:`, error.message);
  await audit(admin, {
    actor_id: actorId,
    action: "order.needs_review",
    entity: "order",
    entity_id: orderId,
    details: { payment_id: paymentId, reason },
  });
}

async function markPaid(admin: SupabaseClient, orderId: string, actorId: string, paymentId: string): Promise<void> {
  const { error } = await admin.rpc("mark_order_paid", { p_order_id: orderId });
  if (error) {
    // Money was taken: never report failure to the payer. Flag it for staff instead.
    console.error(`[${FN}] mark_order_paid failed for ${orderId}:`, error.message);
    await audit(admin, {
      actor_id: actorId,
      action: "payment.mark_paid_failed",
      entity: "order",
      entity_id: orderId,
      details: { payment_id: paymentId, error: error.message },
    });
  }
}

// ---------------------------------------------------------------------------
// purchase
// ---------------------------------------------------------------------------

async function purchase(req: Request, caller: Caller, body: PayBody): Promise<Response> {
  const { admin } = caller;
  if (!isUuid(body.order_id)) throw payError(400, "BAD_REQUEST");
  const order = await loadOrder(admin, body.order_id);

  const isOrderOwner = order.user_id !== null && order.user_id === caller.user.id;
  const isStaffPayer = await caller.can("payments.initiate");
  if (!isOrderOwner && !isStaffPayer) throw payError(403, "FORBIDDEN");

  const cfg = loadWaafiConfig();
  if (!cfg) throw payError(503, "NOT_CONFIGURED");

  const accountNo = normalizeSomaliPhone(typeof body.phone === "string" ? body.phone : null);
  if (!accountNo) throw payError(400, "INVALID_PHONE");

  let wallet: Wallet;
  if (body.wallet !== undefined && body.wallet !== null && body.wallet !== "") {
    if (!isStaffPayer) throw payError(403, "FORBIDDEN");
    if (!isWallet(body.wallet)) throw payError(400, "BAD_REQUEST", { so: "Wallet-ka waa khalad.", en: "Invalid wallet." });
    wallet = body.wallet;
  } else {
    const detected = detectWallet(accountNo, await loadPrefixes(admin));
    if (!detected) throw payError(422, "WALLET_NOT_DETECTED");
    wallet = detected.wallet;
  }

  // Friendly pre-check (start_payment re-checks atomically under a row lock).
  const { data: inflight, error: pErr } = await admin
    .from("payments")
    .select("id, status, created_at")
    .eq("order_id", order.id)
    .in("status", ["initiated", "pending"]);
  if (pErr) throw pErr;
  const pre = checkPayability(order, inflight ?? []);
  if (!pre.ok && pre.code === "ORDER_NOT_PAYABLE") throw payError(409, "ORDER_NOT_PAYABLE");

  const amount = formatAmount(order.total);
  const referenceId = buildReferenceId(order.order_number);
  const requestId = crypto.randomUUID();

  const payment = await startPayment(admin, {
    orderId: order.id,
    provider: "waafipay",
    wallet,
    accountNo,
    referenceId,
    requestId,
    initiatedBy: caller.user.id,
    status: "pending",
  });

  await audit(admin, {
    actor_id: caller.user.id,
    action: "payment.initiated",
    entity: "payment",
    entity_id: payment.id,
    details: { order_id: order.id, wallet, payer: maskPhone(accountNo), amount, mode: cfg.mode, env: cfg.env },
  });

  const { data: settings } = await admin.from("store_settings").select("store_name").eq("id", 1).maybeSingle();

  let call: GatewayCall | null = null;
  let callResult: PurchaseCallResult;
  try {
    call = await waafiPurchase(cfg, {
      requestId,
      accountNo,
      referenceId,
      invoiceId: order.order_number,
      amount,
      currency: order.currency || "USD",
      description: buildDescription(settings?.store_name ?? "Botan E-commerce", order.order_number),
    });
    callResult = { kind: "response", parsed: parsePurchaseResponse(call.raw) };
  } catch (e) {
    callResult = e instanceof WaafiNetworkTimeout
      ? { kind: "network_timeout" }
      : { kind: "transport_error", message: e instanceof Error ? e.message : String(e) };
    console.error(
      `[${FN}] gateway call failed ref=${referenceId}:`,
      callResult.kind === "network_timeout" ? "network timeout" : callResult.message,
    );
  }

  // ---- Approved -----------------------------------------------------------
  const parsed = callResult.kind === "response" ? callResult.parsed : null;
  if (call && parsed?.outcome === "approved") {
    const { error: uErr } = await admin
      .from("payments")
      .update({
        status: "approved",
        transaction_id: parsed.transactionId,
        issuer_transaction_id: parsed.issuerTransactionId,
        response_code: parsed.responseCode,
        response_msg: parsed.responseMsg,
        raw_response: call.safe,
      })
      .eq("id", payment.id);
    if (uErr) console.error(`[${FN}] payment update failed:`, uErr.message);

    // Money was taken: always record + mark paid, even if the amount looks wrong.
    await markPaid(admin, order.id, caller.user.id, payment.id);

    const mismatch = amountMismatchReason(payment.amount ?? amount, parsed.txAmount);
    if (mismatch) {
      console.warn(`[${FN}] ${mismatch} ref=${referenceId}`);
      await flagForReview(admin, order.id, caller.user.id, payment.id, mismatch);
    }
    await audit(admin, {
      actor_id: caller.user.id,
      action: "payment.approved",
      entity: "payment",
      entity_id: payment.id,
      details: {
        order_id: order.id,
        wallet,
        amount,
        transaction_id: parsed.transactionId,
        ...(mismatch ? { tx_amount_mismatch: parsed.txAmount, review_reason: mismatch } : {}),
      },
    });

    return json(req, {
      ok: true,
      status: "approved",
      payment_id: payment.id,
      wallet,
      message: PAY_MESSAGES.APPROVED.so,
      message_en: PAY_MESSAGES.APPROVED.en,
      order: await freshOrder(admin, order.id),
    });
  }

  // ---- Failed / cancelled / unknown ----------------------------------------
  // Only an explicit gateway answer is final; no answer keeps the payment pending (UNKNOWN).
  const outcome = classifyPurchaseFailure(callResult);

  const { error: fErr } = await admin
    .from("payments")
    .update({
      status: outcome.status,
      response_code: outcome.responseCode,
      response_msg: outcome.responseMsg,
      raw_response: call?.safe ?? null,
      transaction_id: parsed?.transactionId ?? null,
    })
    .eq("id", payment.id)
    .in("status", ["initiated", "pending"]);
  if (fErr) console.error(`[${FN}] payment update failed:`, fErr.message);

  if (outcome.orderPaymentStatus === "failed") {
    const { error: oErr } = await admin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id)
      .eq("payment_status", "pending");
    if (oErr) console.error(`[${FN}] order update failed:`, oErr.message);
  }

  await audit(admin, {
    actor_id: caller.user.id,
    action: outcome.code === "UNKNOWN" ? "payment.unknown" : "payment.failed",
    entity: "payment",
    entity_id: payment.id,
    details: {
      order_id: order.id,
      wallet,
      code: outcome.code,
      response_code: outcome.responseCode,
      response_msg: outcome.responseMsg,
    },
  });

  return json(req, {
    ok: false,
    status: outcome.status,
    payment_id: payment.id,
    wallet,
    code: outcome.code,
    message: outcome.message.so,
    message_en: outcome.message.en,
    order: await freshOrder(admin, order.id),
  });
}

// ---------------------------------------------------------------------------
// cash
// ---------------------------------------------------------------------------

async function cash(req: Request, caller: Caller, body: PayBody): Promise<Response> {
  const { admin } = caller;
  if (!(await caller.can("payments.initiate"))) throw payError(403, "FORBIDDEN");
  if (!isUuid(body.order_id)) throw payError(400, "BAD_REQUEST");
  const order = await loadOrder(admin, body.order_id);

  const payment = await startPayment(admin, {
    orderId: order.id,
    provider: "cash",
    wallet: "CASH",
    accountNo: null,
    referenceId: buildReferenceId(order.order_number, `CASH-${shortRandom()}`),
    requestId: crypto.randomUUID(),
    initiatedBy: caller.user.id,
    status: "approved",
  });
  await markPaid(admin, order.id, caller.user.id, payment.id);
  await audit(admin, {
    actor_id: caller.user.id,
    action: "payment.cash",
    entity: "payment",
    entity_id: payment.id,
    details: { order_id: order.id, amount: payment.amount },
  });

  return json(req, {
    ok: true,
    status: "approved",
    payment_id: payment.id,
    wallet: "CASH",
    message: PAY_MESSAGES.CASH_RECORDED.so,
    message_en: PAY_MESSAGES.CASH_RECORDED.en,
    order: await freshOrder(admin, order.id),
  });
}

// ---------------------------------------------------------------------------
// reverse
// ---------------------------------------------------------------------------

async function reverse(req: Request, caller: Caller, body: PayBody): Promise<Response> {
  const { admin } = caller;
  if (!(await caller.can("payments.refund"))) throw payError(403, "FORBIDDEN");
  if (!isUuid(body.order_id) || !isUuid(body.payment_id)) throw payError(400, "BAD_REQUEST");
  const reason = (typeof body.reason === "string" ? body.reason.trim() : "").slice(0, 200);
  if (!reason) {
    throw payError(400, "BAD_REQUEST", { so: "Fadlan qor sababta celinta.", en: "A reversal reason is required." });
  }

  const order = await loadOrder(admin, body.order_id);
  const { data: pData, error: pErr } = await admin
    .from("payments")
    .select("id, order_id, provider, wallet, account_no, amount, status, reference_id, transaction_id, created_at, raw_response")
    .eq("id", body.payment_id)
    .eq("order_id", order.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!pData) throw payError(404, "NOT_FOUND", { so: "Lacag-bixinta lama helin.", en: "Payment not found." });
  const payment = pData as PaymentRow;

  const rev = checkReversible(payment);
  if (!rev.ok) throw payError(409, "NOT_REVERSIBLE");
  if (order.payment_status !== "paid") throw payError(409, "NOT_REVERSIBLE");

  let reversalRaw: Record<string, unknown> | null = null;
  if (payment.provider === "waafipay") {
    const cfg = loadWaafiConfig();
    if (!cfg) throw payError(503, "NOT_CONFIGURED");
    let call: GatewayCall;
    try {
      call = await waafiReversal(cfg, {
        requestId: crypto.randomUUID(),
        transactionId: payment.transaction_id!,
        description: `Reversal ${order.order_number}: ${reason}`,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await audit(admin, {
        actor_id: caller.user.id,
        action: "payment.reverse_failed",
        entity: "payment",
        entity_id: payment.id,
        details: { order_id: order.id, error: m, reason },
      });
      return json(req, {
        ok: false,
        status: payment.status,
        payment_id: payment.id,
        wallet: payment.wallet ?? undefined,
        code: e instanceof WaafiNetworkTimeout ? "UNKNOWN" : "GATEWAY_ERROR",
        message: "Jawaab lagama helin WaafiPay celinta. Hubi WaafiPay portal-ka ka hor intaadan mar kale isku dayin.",
        message_en: `No answer from WaafiPay for the reversal (${m}). Check the WaafiPay portal before retrying.`,
        order: await freshOrder(admin, order.id),
      });
    }
    const parsed = parseReversalResponse(call.raw);
    if (!parsed.ok) {
      await audit(admin, {
        actor_id: caller.user.id,
        action: "payment.reverse_failed",
        entity: "payment",
        entity_id: payment.id,
        details: { order_id: order.id, response_code: parsed.responseCode, response_msg: parsed.responseMsg, reason },
      });
      const gw = parsed.responseMsg ? ` (${parsed.responseMsg})` : "";
      return json(req, {
        ok: false,
        status: payment.status,
        payment_id: payment.id,
        wallet: payment.wallet ?? undefined,
        code: "DECLINED",
        message: `WaafiPay wuu diiday celinta${gw}. Hubi in 24 saac aysan dhaafin.`,
        message_en: `WaafiPay rejected the reversal${gw}. Reversals only work within 24h and before settlement.`,
        order: await freshOrder(admin, order.id),
      });
    }
    reversalRaw = call.safe as Record<string, unknown>;
  }

  const { error: uErr } = await admin
    .from("payments")
    .update({
      status: "reversed",
      raw_response: { ...(payment.raw_response ?? {}), reversal: reversalRaw ?? { provider: payment.provider }, reversal_reason: reason },
    })
    .eq("id", payment.id)
    .eq("status", "approved");
  if (uErr) console.error(`[${FN}] payment reverse update failed:`, uErr.message);

  const { error: rErr } = await admin.rpc("refund_order", { p_order_id: order.id });
  if (rErr) {
    console.error(`[${FN}] refund_order failed for ${order.id}:`, rErr.message);
    await audit(admin, {
      actor_id: caller.user.id,
      action: "payment.refund_order_failed",
      entity: "order",
      entity_id: order.id,
      details: { payment_id: payment.id, error: rErr.message },
    });
  }

  await audit(admin, {
    actor_id: caller.user.id,
    action: "payment.reversed",
    entity: "payment",
    entity_id: payment.id,
    details: { order_id: order.id, provider: payment.provider, amount: payment.amount, reason },
  });

  return json(req, {
    ok: true,
    status: "reversed",
    payment_id: payment.id,
    wallet: payment.wallet ?? undefined,
    message: PAY_MESSAGES.REVERSED.so,
    message_en: PAY_MESSAGES.REVERSED.en,
    order: await freshOrder(admin, order.id),
  });
}

// ---------------------------------------------------------------------------
// confirm (manual reconciliation after checking the WaafiPay portal)
// ---------------------------------------------------------------------------

async function confirm(req: Request, caller: Caller, body: PayBody): Promise<Response> {
  const { admin } = caller;
  if (!(await caller.can("payments.refund"))) throw payError(403, "FORBIDDEN");
  if (!isUuid(body.order_id) || !isUuid(body.payment_id)) throw payError(400, "BAD_REQUEST");
  const transactionId = normalizeTransactionId(body.transaction_id);
  if (!transactionId) {
    throw payError(400, "BAD_REQUEST", {
      so: "Transaction ID-ga WaafiPay waa khalad (ugu badnaan 64 xaraf: A-Z, 0-9, . _ -).",
      en: "A valid WaafiPay transaction id is required (max 64 chars: A-Z, 0-9, . _ -).",
    });
  }
  const reason = (typeof body.reason === "string" ? body.reason.trim() : "").slice(0, 200);

  const order = await loadOrder(admin, body.order_id);
  if (
    order.payment_status === "paid" ||
    order.payment_status === "refunded" ||
    order.status === "cancelled" ||
    order.status === "refunded"
  ) {
    throw payError(409, "ORDER_NOT_PAYABLE");
  }

  const { data: pData, error: pErr } = await admin
    .from("payments")
    .select("id, order_id, provider, wallet, account_no, amount, status, reference_id, transaction_id, created_at, raw_response")
    .eq("id", body.payment_id)
    .eq("order_id", order.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!pData) throw payError(404, "NOT_FOUND", { so: "Lacag-bixinta lama helin.", en: "Payment not found." });
  const payment = pData as PaymentRow;
  if (payment.provider !== "waafipay" || !CONFIRMABLE_STATUSES.includes(payment.status)) {
    throw payError(409, "ORDER_NOT_PAYABLE", {
      so: "Lacag-bixintan gacan laguma xaqiijin karo (waa inay ahaataa WaafiPay oo sugaysa ama fashilantay).",
      en: "Only a pending/failed WaafiPay payment can be confirmed manually.",
    });
  }

  // No other approved payment, no other attempt still in flight, transaction id not reused.
  const { data: others, error: oErr } = await admin
    .from("payments")
    .select("id, status, transaction_id")
    .eq("order_id", order.id)
    .neq("id", payment.id)
    .in("status", ["approved", "initiated", "pending"]);
  if (oErr) throw oErr;
  if ((others ?? []).some((p: { status: string }) => p.status === "approved")) throw payError(409, "ORDER_NOT_PAYABLE");
  if ((others ?? []).length > 0) throw payError(409, "PAYMENT_IN_PROGRESS");
  const { data: dup, error: dErr } = await admin
    .from("payments")
    .select("id")
    .eq("provider", "waafipay")
    .eq("transaction_id", transactionId)
    .neq("id", payment.id)
    .limit(1);
  if (dErr) throw dErr;
  if ((dup ?? []).length > 0) {
    throw payError(409, "ORDER_NOT_PAYABLE", {
      so: "Transaction ID-gan horay ayaa loogu isticmaalay lacag-bixin kale.",
      en: "This transaction id is already linked to another payment.",
    });
  }

  const who = caller.profile.full_name?.trim() || caller.user.id;
  const responseMsg = `Confirmed manually by ${who}${reason ? `: ${reason}` : ""}`.slice(0, 500);
  const { data: updated, error: uErr } = await admin
    .from("payments")
    .update({
      status: "approved",
      transaction_id: transactionId,
      response_code: "MANUAL",
      response_msg: responseMsg,
      raw_response: {
        ...(payment.raw_response ?? {}),
        manual_confirm: {
          by: caller.user.id,
          at: new Date().toISOString(),
          previous_status: payment.status,
          transaction_id: transactionId,
          reason: reason || null,
        },
      },
    })
    .eq("id", payment.id)
    .in("status", [...CONFIRMABLE_STATUSES])
    .select("id")
    .maybeSingle();
  if (uErr) throw uErr;
  if (!updated) throw payError(409, "ORDER_NOT_PAYABLE"); // lost a race with another update

  await markPaid(admin, order.id, caller.user.id, payment.id);
  await audit(admin, {
    actor_id: caller.user.id,
    action: "payment.manual_confirm",
    entity: "payment",
    entity_id: payment.id,
    details: {
      order_id: order.id,
      wallet: payment.wallet,
      amount: payment.amount,
      transaction_id: transactionId,
      previous_status: payment.status,
      reason: reason || null,
    },
  });

  return json(req, {
    ok: true,
    status: "approved",
    payment_id: payment.id,
    wallet: payment.wallet ?? undefined,
    message: PAY_MESSAGES.MANUAL_CONFIRMED.so,
    message_en: PAY_MESSAGES.MANUAL_CONFIRMED.en,
    order: await freshOrder(admin, order.id),
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return json(
      req,
      { ok: false, status: "failed", code: "BAD_REQUEST", message: "Habka codsiga lama ogola.", message_en: "Method not allowed" },
      405,
    );
  }
  try {
    const caller = await getCaller(req);
    const body = await readJson<PayBody>(req);
    switch (body.action) {
      case "purchase":
        return await purchase(req, caller, body);
      case "cash":
        return await cash(req, caller, body);
      case "reverse":
        return await reverse(req, caller, body);
      case "confirm":
        return await confirm(req, caller, body);
      default:
        throw payError(400, "BAD_REQUEST", { so: "Ficil aan la aqoon.", en: "Unknown action." });
    }
  } catch (err) {
    return errorResponse(req, err, FN, { status: "failed" });
  }
});
