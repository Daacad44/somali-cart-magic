// Pure, runtime-agnostic WaafiPay logic shared by the `waafi-pay` Edge
// Function (Deno) and the vitest suite (Node). Keep this file free of
// Deno-specific APIs and of any import other than ./wallet.ts.

import { maskPhone, type Wallet } from "./wallet.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayCode =
  | "WALLET_NOT_DETECTED"
  | "INVALID_PHONE"
  | "ORDER_NOT_PAYABLE"
  | "PAYMENT_IN_PROGRESS"
  | "FORBIDDEN"
  | "DECLINED"
  | "CANCELLED"
  | "TIMEOUT"
  | "GATEWAY_ERROR"
  | "NOT_CONFIGURED"
  | "NOT_REVERSIBLE"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "INTERNAL";

export type PaymentRowStatus = "initiated" | "pending" | "approved" | "failed" | "cancelled" | "reversed";

/** Raw WaafiPay /asm response (fields we care about; the rest is preserved). */
export interface WaafiRawResponse {
  schemaVersion?: string;
  timestamp?: string;
  responseId?: string;
  responseCode?: string | number;
  errorCode?: string | number;
  responseMsg?: string;
  params?: {
    state?: string;
    transactionId?: string | number;
    issuerTransactionId?: string | number;
    referenceId?: string;
    txAmount?: string | number;
    accountNo?: string;
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
}

export type GatewayOutcome = "approved" | "declined" | "cancelled" | "timeout" | "error";

export interface ParsedGatewayResult {
  outcome: GatewayOutcome;
  /** Payment row status this outcome maps to. */
  status: PaymentRowStatus;
  /** Machine code for PayResponse (undefined when approved). */
  code?: PayCode;
  responseCode: string | null;
  errorCode: string | null;
  responseMsg: string | null;
  transactionId: string | null;
  issuerTransactionId: string | null;
  txAmount: number | null;
}

/** Minimal order shape needed for payability checks. */
export interface PayableOrderLike {
  status: string;
  payment_status: string;
  total: number | string;
}

/** Minimal payment shape needed for in-flight detection. */
export interface PaymentLike {
  id: string;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WAAFI_ENDPOINTS = {
  sandbox: "https://sandbox.waafipay.com/asm",
  production: "https://api.waafipay.net/asm",
} as const;

export type WaafiEnv = keyof typeof WAAFI_ENDPOINTS;

export const WAAFI_SUCCESS_CODE = "2001";
export const WAAFI_TIMEOUT_CODE = "5309";
export const WAAFI_USER_CANCELLED_CODE = "5306";

/** A payment still `initiated/pending` younger than this blocks new attempts. */
export const IN_FLIGHT_WINDOW_MS = 3 * 60 * 1000;
/** WaafiPay only allows reversals within 24h (and before settlement). */
export const REVERSAL_WINDOW_MS = 24 * 60 * 60 * 1000;

const CREDENTIAL_KEYS = new Set(["apikey", "apiuserid", "merchantuid", "password", "pin"]);

// ---------------------------------------------------------------------------
// Messages (Somali first; English kept in `message_en`)
// ---------------------------------------------------------------------------

export const PAY_MESSAGES: Record<PayCode | "APPROVED" | "REVERSED" | "CASH_RECORDED", { so: string; en: string }> = {
  APPROVED: { so: "Lacag-bixintu way guulaysatay. Mahadsanid!", en: "Payment approved. Thank you!" },
  CASH_RECORDED: { so: "Lacag caddaan ah ayaa la diiwaangeliyay.", en: "Cash payment recorded." },
  REVERSED: { so: "Lacagta waa la celiyay, dalabkana waa la soo celiyay.", en: "Payment reversed and order refunded." },
  WALLET_NOT_DETECTED: {
    so: "Lambarkan lama aqoonsan karo wallet uu leeyahay. Isticmaal EVC Plus, ZAAD ama SAHAL.",
    en: "Could not detect a supported wallet for this number.",
  },
  INVALID_PHONE: {
    so: "Lambarka telefoonku waa khalad. Tusaale: 61 234 5678.",
    en: "Invalid phone number. Example: 61 234 5678.",
  },
  ORDER_NOT_PAYABLE: {
    so: "Dalabkan lama bixin karo (horay ayaa loo bixiyay ama waa la joojiyay).",
    en: "This order cannot be paid (already paid or cancelled).",
  },
  PAYMENT_IN_PROGRESS: {
    so: "Codsi lacag-bixin ayaa hore u socda. Fadlan sug ama hubi telefoonka.",
    en: "A payment request is already in progress. Please wait or check the phone.",
  },
  FORBIDDEN: { so: "Ogolaansho uma lihid ficilkan.", en: "You don't have permission for this action." },
  DECLINED: { so: "Lacag-bixinta waa la diiday.", en: "Payment was declined." },
  CANCELLED: { so: "Lacag-bixinta waa la joojiyay (macmiilka ayaa diiday).", en: "Payment was cancelled by the payer." },
  TIMEOUT: {
    so: "Waqtigii waa dhammaaday — lacag-bixinta lama ansixin 5 daqiiqo gudahood. Isku day mar kale.",
    en: "Timed out — the payer did not approve within 5 minutes. Please try again.",
  },
  GATEWAY_ERROR: {
    so: "Cilad ayaa ka dhacday adeegga lacag-bixinta. Isku day mar kale.",
    en: "Payment gateway error. Please try again.",
  },
  NOT_CONFIGURED: {
    so: "Lacag-bixinta WaafiPay weli lama habeyn. La xiriir maamulka.",
    en: "WaafiPay is not configured yet. Contact the administrator.",
  },
  NOT_REVERSIBLE: {
    so: "Lacag-bixintan lama celin karo (24 saac way ka badan tahay ama lama ansixin).",
    en: "This payment cannot be reversed (older than 24h or not approved).",
  },
  NOT_FOUND: { so: "Lama helin.", en: "Not found." },
  BAD_REQUEST: { so: "Codsiga waa khalad.", en: "Invalid request." },
  UNAUTHORIZED: { so: "Fadlan soo gal marka hore.", en: "Please sign in first." },
  INTERNAL: { so: "Cilad gudaha ah ayaa dhacday.", en: "Internal error." },
};

/** Message shown when the HTTP call to WaafiPay aborted (outcome unknown). */
export const NETWORK_TIMEOUT_MESSAGE = {
  so: "Jawaab lagama helin WaafiPay waqtigii loogu talagalay. Hubi telefoonka macmiilka ama WaafiPay portal-ka ka hor intaadan mar kale isku dayin.",
  en: "No response from WaafiPay in time. Check the payer's phone or the WaafiPay portal before retrying.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** WaafiPay timestamp: "YYYY-MM-DD HH:mm:ss.SSS" (UTC). */
export function formatWaafiTimestamp(d: Date = new Date()): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

/** Amount as a 2-decimal string ("12.5" -> "12.50"). Throws on invalid input. */
export function formatAmount(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_AMOUNT");
  return (Math.round(n * 100) / 100).toFixed(2);
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short random token using Web Crypto (available in Deno and Node >= 19). */
export function shortRandom(length = 6, rand: (n: number) => Uint8Array = defaultRandomBytes): string {
  const bytes = rand(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}

function defaultRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export const REFERENCE_ID_RE = /^[A-Za-z0-9._-]{1,50}$/;

/**
 * referenceId = `${order_number}-${suffix}` sanitised to WaafiPay's
 * allowed charset [A-Za-z0-9._-] and capped at 50 chars (suffix preserved).
 */
export function buildReferenceId(orderNumber: string, suffix: string = shortRandom()): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "");
  const sfx = clean(suffix).slice(0, 20) || shortRandom();
  const base = clean(orderNumber) || "ORDER";
  const maxBase = 50 - sfx.length - 1;
  return `${base.slice(0, maxBase)}-${sfx}`;
}

export function isValidReferenceId(ref: string): boolean {
  return REFERENCE_ID_RE.test(ref);
}

/** Description field (<= 255 chars, printable). */
export function buildDescription(storeName: string, orderNumber: string): string {
  return `${storeName} - ${orderNumber}`.replace(/[\r\n\t]+/g, " ").slice(0, 255);
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

/** Maps a raw API_PURCHASE response to an outcome. 2001 alone is NOT success. */
export function parsePurchaseResponse(raw: unknown): ParsedGatewayResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as WaafiRawResponse;
  const responseCode = str(r.responseCode);
  const errorCode = str(r.errorCode);
  const responseMsg = str(r.responseMsg);
  const params = r.params && typeof r.params === "object" ? r.params : {};
  const state = str(params.state)?.toUpperCase() ?? null;
  const txAmountNum = params.txAmount === undefined || params.txAmount === null ? NaN : Number(params.txAmount);
  const base = {
    responseCode,
    errorCode,
    responseMsg,
    transactionId: str(params.transactionId),
    issuerTransactionId: str(params.issuerTransactionId),
    txAmount: Number.isFinite(txAmountNum) ? txAmountNum : null,
  };

  if (!raw || typeof raw !== "object" || (responseCode === null && errorCode === null)) {
    return { ...base, outcome: "error", status: "failed", code: "GATEWAY_ERROR" };
  }
  if (responseCode === WAAFI_SUCCESS_CODE && state === "APPROVED") {
    return { ...base, outcome: "approved", status: "approved" };
  }
  const codes = [responseCode, errorCode];
  if (codes.includes(WAAFI_TIMEOUT_CODE)) {
    return { ...base, outcome: "timeout", status: "failed", code: "TIMEOUT" };
  }
  if (codes.includes(WAAFI_USER_CANCELLED_CODE)) {
    return { ...base, outcome: "cancelled", status: "cancelled", code: "CANCELLED" };
  }
  return { ...base, outcome: "declined", status: "failed", code: "DECLINED" };
}

/** Reversal succeeds on 2001 unless the response carries an explicit non-approved state. */
export function parseReversalResponse(raw: unknown): { ok: boolean; responseCode: string | null; responseMsg: string | null } {
  const r = (raw && typeof raw === "object" ? raw : {}) as WaafiRawResponse;
  const responseCode = str(r.responseCode);
  const responseMsg = str(r.responseMsg);
  const state = str(r.params?.state)?.toUpperCase() ?? null;
  const ok = responseCode === WAAFI_SUCCESS_CODE && (state === null || state === "APPROVED");
  return { ok, responseCode, responseMsg };
}

/**
 * Human message for a failed gateway outcome. Prefers WaafiPay's own
 * responseMsg (often already localised, e.g. insufficient balance).
 */
export function gatewayFailureMessage(parsed: ParsedGatewayResult): { so: string; en: string } {
  const code = parsed.code ?? "DECLINED";
  const base = PAY_MESSAGES[code];
  const gw = parsed.responseMsg && parsed.responseMsg !== "RCS_SUCCESS" ? parsed.responseMsg : null;
  if (!gw || code === "TIMEOUT") return base;
  return { so: `${base.so} (${gw})`, en: `${base.en} (${gw})` };
}

/** Deep-copies a value removing credential fields (apiKey, apiUserId, merchantUid…). */
export function stripCredentials<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripCredentials(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CREDENTIAL_KEYS.has(k.toLowerCase())) continue;
      if (k === "accountNo" && typeof v === "string") {
        out[k] = maskPhone(v);
        continue;
      }
      out[k] = stripCredentials(v);
    }
    return out as T;
  }
  return value;
}

export type PayabilityResult =
  | { ok: true; stalePaymentIds: string[] }
  | { ok: false; code: "ORDER_NOT_PAYABLE" | "PAYMENT_IN_PROGRESS"; stalePaymentIds: string[] };

/**
 * Decides whether a new payment attempt may start for an order.
 * - paid/refunded orders and cancelled/refunded statuses are not payable;
 * - an `initiated`/`pending` payment younger than 3 minutes blocks (double-charge guard);
 * - older in-flight payments are returned as stale (caller marks them failed/TIMEOUT).
 */
export function checkPayability(
  order: PayableOrderLike,
  payments: PaymentLike[],
  now: number = Date.now(),
): PayabilityResult {
  const inFlight = payments.filter((p) => p.status === "initiated" || p.status === "pending");
  const stale = inFlight.filter((p) => now - Date.parse(p.created_at) >= IN_FLIGHT_WINDOW_MS).map((p) => p.id);
  const fresh = inFlight.filter((p) => now - Date.parse(p.created_at) < IN_FLIGHT_WINDOW_MS);

  const total = Number(order.total);
  if (
    order.payment_status === "paid" ||
    order.payment_status === "refunded" ||
    order.status === "cancelled" ||
    order.status === "refunded" ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return { ok: false, code: "ORDER_NOT_PAYABLE", stalePaymentIds: stale };
  }
  if (fresh.length > 0) return { ok: false, code: "PAYMENT_IN_PROGRESS", stalePaymentIds: stale };
  return { ok: true, stalePaymentIds: stale };
}

/** Whether an approved payment can still be reversed. */
export function checkReversible(
  payment: { provider: string; status: string; transaction_id: string | null; created_at: string },
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (payment.status !== "approved") return { ok: false, reason: "not_approved" };
  if (payment.provider === "cash") return { ok: true };
  if (!payment.transaction_id) return { ok: false, reason: "missing_transaction_id" };
  if (now - Date.parse(payment.created_at) > REVERSAL_WINDOW_MS) return { ok: false, reason: "window_expired" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mock gateway (WAAFI_MODE=mock)
// ---------------------------------------------------------------------------

export type MockOutcome = "approved" | "declined" | "timeout";

/** Numbers ending 0000 decline, ending 9999 time out, everything else approves. */
export function mockOutcomeFor(accountNo: string): MockOutcome {
  if (accountNo.endsWith("0000")) return "declined";
  if (accountNo.endsWith("9999")) return "timeout";
  return "approved";
}

/** Builds a realistic raw response for the mock gateway (parsed like a real one). */
export function buildMockPurchaseResponse(
  outcome: MockOutcome,
  opts: { referenceId: string; amount: string; accountNo: string; now?: Date },
): WaafiRawResponse {
  const ts = formatWaafiTimestamp(opts.now ?? new Date());
  const responseId = `MOCK-${shortRandom(10)}`;
  if (outcome === "approved") {
    return {
      schemaVersion: "1.0",
      timestamp: ts,
      responseId,
      responseCode: "2001",
      errorCode: "0",
      responseMsg: "RCS_SUCCESS",
      params: {
        state: "APPROVED",
        referenceId: opts.referenceId,
        transactionId: `MOCK${Date.now()}`,
        issuerTransactionId: `MOCK-ISS-${shortRandom(8)}`,
        txAmount: opts.amount,
        accountNo: opts.accountNo,
      },
    };
  }
  if (outcome === "timeout") {
    return {
      schemaVersion: "1.0",
      timestamp: ts,
      responseId,
      responseCode: WAAFI_TIMEOUT_CODE,
      errorCode: "E10205",
      responseMsg: "RCS_TRAN_TIMEOUT (mock: payer did not respond)",
      params: null,
    };
  }
  return {
    schemaVersion: "1.0",
    timestamp: ts,
    responseId,
    responseCode: "5206",
    errorCode: "E10308",
    responseMsg: "Payment Failed (mock: insufficient balance)",
    params: null,
  };
}

export function isWallet(v: unknown): v is Wallet {
  return typeof v === "string" && ["EVC_PLUS", "ZAAD", "SAHAL", "WAAFI", "JEEB", "EDAHAB"].includes(v);
}
