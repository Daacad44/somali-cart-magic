// WaafiPay HTTP client (API_PURCHASE / API_REVERSAL) with mock mode.
// Docs: https://docs.waafipay.com — never log apiKey or full phone numbers.

import {
  buildMockPurchaseResponse,
  formatWaafiTimestamp,
  mockOutcomeFor,
  stripCredentials,
  WAAFI_ENDPOINTS,
  type WaafiEnv,
  type WaafiRawResponse,
} from "./waafipay-logic.ts";
import { maskPhone } from "./wallet.ts";

export interface WaafiConfig {
  mode: "live" | "mock";
  env: WaafiEnv;
  endpoint: string;
  merchantUid: string;
  apiUserId: string;
  apiKey: string;
}

/** Thrown when the HTTP call to WaafiPay aborts (timeout) — the outcome is unknown. */
export class WaafiNetworkTimeout extends Error {
  constructor() {
    super("WAAFI_NETWORK_TIMEOUT");
    this.name = "WaafiNetworkTimeout";
  }
}

/** Thrown for transport failures / non-JSON / non-2xx responses. */
export class WaafiTransportError extends Error {
  constructor(message: string, public httpStatus?: number) {
    super(message);
    this.name = "WaafiTransportError";
  }
}

export const PURCHASE_TIMEOUT_MS = 120_000;
export const REVERSAL_TIMEOUT_MS = 30_000;

/** Loads config from env. Returns null when live credentials are missing (NOT_CONFIGURED). */
export function loadWaafiConfig(): WaafiConfig | null {
  const mode = (Deno.env.get("WAAFI_MODE") ?? "live").toLowerCase() === "mock" ? "mock" : "live";
  const env: WaafiEnv = (Deno.env.get("WAAFI_ENV") ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  const merchantUid = Deno.env.get("WAAFI_MERCHANT_UID") ?? "";
  const apiUserId = Deno.env.get("WAAFI_API_USER_ID") ?? "";
  const apiKey = Deno.env.get("WAAFI_API_KEY") ?? "";
  if (mode === "live" && (!merchantUid || !apiUserId || !apiKey)) return null;
  return { mode, env, endpoint: WAAFI_ENDPOINTS[env], merchantUid, apiUserId, apiKey };
}

export interface PurchaseInput {
  requestId: string;
  accountNo: string; // normalised 252XXXXXXXXX
  referenceId: string;
  invoiceId: string;
  amount: string; // "12.50"
  currency: string;
  description: string;
}

export interface GatewayCall {
  raw: WaafiRawResponse;
  /** Response safe to persist (credentials stripped). */
  safe: WaafiRawResponse;
}

async function post(cfg: WaafiConfig, body: Record<string, unknown>, timeoutMs: number): Promise<WaafiRawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new WaafiTransportError(`Non-JSON response (HTTP ${res.status})`, res.status);
    }
    if (!parsed || typeof parsed !== "object") throw new WaafiTransportError(`Unexpected response (HTTP ${res.status})`, res.status);
    return parsed as WaafiRawResponse;
  } catch (e) {
    if (e instanceof WaafiTransportError) throw e;
    if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new WaafiNetworkTimeout();
    throw new WaafiTransportError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

function envelope(serviceName: string, requestId: string, serviceParams: Record<string, unknown>) {
  return {
    schemaVersion: "1.0",
    requestId,
    timestamp: formatWaafiTimestamp(),
    channelName: "WEB",
    serviceName,
    serviceParams,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** API_PURCHASE — blocks while the payer approves on their phone (up to ~2 min). */
export async function waafiPurchase(cfg: WaafiConfig, input: PurchaseInput): Promise<GatewayCall> {
  const started = Date.now();
  let raw: WaafiRawResponse;
  if (cfg.mode === "mock") {
    await sleep(2000);
    raw = buildMockPurchaseResponse(mockOutcomeFor(input.accountNo), {
      referenceId: input.referenceId,
      amount: input.amount,
      accountNo: input.accountNo,
    });
  } else {
    raw = await post(
      cfg,
      envelope("API_PURCHASE", input.requestId, {
        merchantUid: cfg.merchantUid,
        apiUserId: cfg.apiUserId,
        apiKey: cfg.apiKey,
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: { accountNo: input.accountNo },
        transactionInfo: {
          referenceId: input.referenceId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
        },
      }),
      PURCHASE_TIMEOUT_MS,
    );
  }
  console.log(
    `[waafipay] purchase ${cfg.mode}/${cfg.env} ref=${input.referenceId} payer=${maskPhone(input.accountNo)} ` +
      `code=${raw.responseCode} state=${raw.params?.state ?? "-"} in ${Date.now() - started}ms`,
  );
  return { raw, safe: stripCredentials(raw) };
}

/** API_REVERSAL — only within 24h and before settlement. */
export async function waafiReversal(
  cfg: WaafiConfig,
  input: { requestId: string; transactionId: string; description: string },
): Promise<GatewayCall> {
  let raw: WaafiRawResponse;
  if (cfg.mode === "mock") {
    await sleep(500);
    raw = {
      schemaVersion: "1.0",
      timestamp: formatWaafiTimestamp(),
      responseId: `MOCK-REV-${input.requestId.slice(0, 8)}`,
      responseCode: "2001",
      errorCode: "0",
      responseMsg: "RCS_SUCCESS",
      params: { state: "APPROVED", transactionId: input.transactionId },
    };
  } else {
    raw = await post(
      cfg,
      envelope("API_REVERSAL", input.requestId, {
        merchantUid: cfg.merchantUid,
        apiUserId: cfg.apiUserId,
        apiKey: cfg.apiKey,
        transactionId: input.transactionId,
        description: input.description.slice(0, 255),
      }),
      REVERSAL_TIMEOUT_MS,
    );
  }
  console.log(`[waafipay] reversal ${cfg.mode}/${cfg.env} tx=${input.transactionId} code=${raw.responseCode}`);
  return { raw, safe: stripCredentials(raw) };
}
