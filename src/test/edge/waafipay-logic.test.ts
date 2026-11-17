import { describe, expect, it } from "vitest";
import {
  buildDescription,
  buildMockPurchaseResponse,
  buildReferenceId,
  checkPayability,
  checkReversible,
  formatAmount,
  formatWaafiTimestamp,
  gatewayFailureMessage,
  IN_FLIGHT_WINDOW_MS,
  isValidReferenceId,
  isWallet,
  mockOutcomeFor,
  parsePurchaseResponse,
  parseReversalResponse,
  shortRandom,
  stripCredentials,
} from "../../../supabase/functions/_shared/waafipay-logic.ts";

const approvedRaw = {
  schemaVersion: "1.0",
  timestamp: "2026-11-17 10:00:00.000",
  responseId: "123",
  responseCode: "2001",
  errorCode: "0",
  responseMsg: "RCS_SUCCESS",
  params: {
    state: "APPROVED",
    referenceId: "ORD-1001-ABC",
    transactionId: 7712345,
    issuerTransactionId: "ISS-99",
    txAmount: "12.50",
    accountNo: "252612345678",
  },
};

describe("parsePurchaseResponse", () => {
  it("approves only on 2001 + state APPROVED", () => {
    const r = parsePurchaseResponse(approvedRaw);
    expect(r.outcome).toBe("approved");
    expect(r.status).toBe("approved");
    expect(r.code).toBeUndefined();
    expect(r.transactionId).toBe("7712345");
    expect(r.issuerTransactionId).toBe("ISS-99");
    expect(r.txAmount).toBe(12.5);
  });

  it("does NOT treat 2001 without APPROVED state as success", () => {
    const r = parsePurchaseResponse({ ...approvedRaw, params: { ...approvedRaw.params, state: "PENDING" } });
    expect(r.outcome).toBe("declined");
    expect(r.code).toBe("DECLINED");
    const noParams = parsePurchaseResponse({ responseCode: "2001", errorCode: "0", responseMsg: "RCS_SUCCESS" });
    expect(noParams.outcome).toBe("declined");
  });

  it("accepts numeric codes and lowercase state", () => {
    const r = parsePurchaseResponse({ responseCode: 2001, params: { state: "approved" } });
    expect(r.outcome).toBe("approved");
  });

  it("maps 5309 to TIMEOUT and 5306 to CANCELLED", () => {
    expect(parsePurchaseResponse({ responseCode: "5309", errorCode: "E10205", responseMsg: "x" })).toMatchObject({
      outcome: "timeout",
      status: "failed",
      code: "TIMEOUT",
    });
    expect(parsePurchaseResponse({ responseCode: "5306", responseMsg: "cancelled" })).toMatchObject({
      outcome: "cancelled",
      status: "cancelled",
      code: "CANCELLED",
    });
  });

  it("maps other codes to DECLINED and keeps responseMsg", () => {
    const r = parsePurchaseResponse({ responseCode: "5206", errorCode: "E10308", responseMsg: "Payment Failed (balance)" });
    expect(r).toMatchObject({ outcome: "declined", status: "failed", code: "DECLINED", responseMsg: "Payment Failed (balance)" });
    expect(gatewayFailureMessage(r).en).toContain("Payment Failed (balance)");
  });

  it("treats garbage as a gateway error", () => {
    for (const raw of [null, undefined, "oops", 42, {}]) {
      expect(parsePurchaseResponse(raw)).toMatchObject({ outcome: "error", code: "GATEWAY_ERROR", status: "failed" });
    }
  });

  it("does not append gateway text to timeout messages", () => {
    const r = parsePurchaseResponse({ responseCode: "5309", responseMsg: "RCS_TRAN_TIMEOUT" });
    expect(gatewayFailureMessage(r).en).not.toContain("RCS_TRAN_TIMEOUT");
  });
});

describe("parseReversalResponse", () => {
  it("succeeds on 2001", () => {
    expect(parseReversalResponse({ responseCode: "2001", errorCode: "0" }).ok).toBe(true);
    expect(parseReversalResponse({ responseCode: "2001", params: { state: "APPROVED" } }).ok).toBe(true);
  });
  it("fails otherwise", () => {
    expect(parseReversalResponse({ responseCode: "2001", params: { state: "DECLINED" } }).ok).toBe(false);
    expect(parseReversalResponse({ responseCode: "5310", responseMsg: "settled" })).toMatchObject({ ok: false, responseMsg: "settled" });
    expect(parseReversalResponse(null).ok).toBe(false);
  });
});

describe("reference ids & formatting", () => {
  it("builds valid reference ids", () => {
    const ref = buildReferenceId("ORD-1001", "AB12CD");
    expect(ref).toBe("ORD-1001-AB12CD");
    expect(isValidReferenceId(ref)).toBe(true);
  });

  it("sanitises and caps at 50 chars while keeping the suffix", () => {
    const ref = buildReferenceId("ORD #1001 / ñ".padEnd(80, "X"), "ZZZ999");
    expect(ref.length).toBeLessThanOrEqual(50);
    expect(ref.endsWith("-ZZZ999")).toBe(true);
    expect(isValidReferenceId(ref)).toBe(true);
  });

  it("generates random suffixes from a safe alphabet", () => {
    const a = shortRandom();
    expect(a).toMatch(/^[A-Z2-9]{6}$/);
    expect(shortRandom(10)).toHaveLength(10);
    expect(buildReferenceId("ORD-1")).toMatch(/^ORD-1-[A-Z2-9]{6}$/);
    expect(shortRandom(4, () => new Uint8Array([0, 1, 2, 3]))).toBe("ABCD");
  });

  it("rejects invalid reference ids", () => {
    expect(isValidReferenceId("")).toBe(false);
    expect(isValidReferenceId("a b")).toBe(false);
    expect(isValidReferenceId("x".repeat(51))).toBe(false);
  });

  it("formats amounts with 2 decimals", () => {
    expect(formatAmount(12.5)).toBe("12.50");
    expect(formatAmount("7")).toBe("7.00");
    expect(formatAmount(0.105)).toBe("0.11");
    expect(() => formatAmount(0)).toThrow("INVALID_AMOUNT");
    expect(() => formatAmount("abc")).toThrow("INVALID_AMOUNT");
    expect(() => formatAmount(-1)).toThrow();
  });

  it("formats WaafiPay timestamps", () => {
    expect(formatWaafiTimestamp(new Date(Date.UTC(2026, 0, 5, 3, 4, 5, 7)))).toBe("2026-01-05 03:04:05.007");
  });

  it("builds single-line descriptions <= 255 chars", () => {
    expect(buildDescription("Botan\nShop", "ORD-1")).toBe("Botan Shop - ORD-1");
    expect(buildDescription("x".repeat(400), "ORD-1").length).toBe(255);
  });

  it("validates wallets", () => {
    expect(isWallet("EVC_PLUS")).toBe(true);
    expect(isWallet("CASH")).toBe(false);
    expect(isWallet(undefined)).toBe(false);
  });
});

describe("stripCredentials", () => {
  it("removes credentials deeply and masks account numbers", () => {
    const input = {
      serviceParams: {
        merchantUid: "M1",
        apiUserId: "U1",
        apiKey: "SECRET",
        payerInfo: { accountNo: "252612345678" },
        list: [{ ApiKey: "x", keep: 1 }],
      },
      responseMsg: "ok",
    };
    const out = stripCredentials(input);
    const s = JSON.stringify(out);
    expect(s).not.toContain("SECRET");
    expect(s).not.toContain("M1");
    expect(s).not.toContain("U1");
    expect(s).not.toContain("252612345678");
    expect(out.serviceParams.payerInfo.accountNo).toBe("25261****678");
    expect(out.serviceParams.list[0]).toEqual({ keep: 1 });
    expect(out.responseMsg).toBe("ok");
    // original untouched
    expect(input.serviceParams.apiKey).toBe("SECRET");
  });

  it("passes primitives through", () => {
    expect(stripCredentials(null)).toBeNull();
    expect(stripCredentials("a")).toBe("a");
  });
});

describe("checkPayability", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const order = { status: "pending", payment_status: "unpaid", total: "25.00" };

  it("allows unpaid and failed orders", () => {
    expect(checkPayability(order, [], now)).toEqual({ ok: true, stalePaymentIds: [] });
    expect(checkPayability({ ...order, payment_status: "failed" }, [], now).ok).toBe(true);
  });

  it.each([
    [{ payment_status: "paid" }],
    [{ payment_status: "refunded" }],
    [{ status: "cancelled" }],
    [{ status: "refunded" }],
    [{ total: 0 }],
    [{ total: "NaN" }],
  ])("rejects %o", (patch) => {
    expect(checkPayability({ ...order, ...patch }, [], now)).toMatchObject({ ok: false, code: "ORDER_NOT_PAYABLE" });
  });

  it("blocks while a fresh attempt is in flight", () => {
    const r = checkPayability(order, [{ id: "p1", status: "pending", created_at: ago(60_000) }], now);
    expect(r).toEqual({ ok: false, code: "PAYMENT_IN_PROGRESS", stalePaymentIds: [] });
  });

  it("reports stale attempts and allows a retry", () => {
    const r = checkPayability(
      { ...order, payment_status: "pending" },
      [
        { id: "old", status: "initiated", created_at: ago(IN_FLIGHT_WINDOW_MS + 1) },
        { id: "done", status: "failed", created_at: ago(10_000) },
      ],
      now,
    );
    expect(r).toEqual({ ok: true, stalePaymentIds: ["old"] });
  });
});

describe("checkReversible", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const base = { provider: "waafipay", status: "approved", transaction_id: "T1", created_at: new Date(now - 3600_000).toISOString() };

  it("allows recent approved waafipay payments", () => {
    expect(checkReversible(base, now)).toEqual({ ok: true });
  });
  it("rejects non-approved, missing tx id and > 24h", () => {
    expect(checkReversible({ ...base, status: "failed" }, now)).toMatchObject({ ok: false, reason: "not_approved" });
    expect(checkReversible({ ...base, transaction_id: null }, now)).toMatchObject({ ok: false, reason: "missing_transaction_id" });
    expect(checkReversible({ ...base, created_at: new Date(now - 25 * 3600_000).toISOString() }, now)).toMatchObject({
      ok: false,
      reason: "window_expired",
    });
  });
  it("allows cash reversals regardless of age", () => {
    expect(
      checkReversible({ ...base, provider: "cash", transaction_id: null, created_at: "2020-01-01T00:00:00Z" }, now),
    ).toEqual({ ok: true });
  });
});

describe("mock gateway", () => {
  it("chooses outcome by number suffix", () => {
    expect(mockOutcomeFor("252610000000")).toBe("declined");
    expect(mockOutcomeFor("252619999999")).toBe("timeout");
    expect(mockOutcomeFor("252612345678")).toBe("approved");
  });

  it("produces responses the real parser understands", () => {
    const opts = { referenceId: "ORD-1-X", amount: "5.00", accountNo: "252612345678" };
    expect(parsePurchaseResponse(buildMockPurchaseResponse("approved", opts))).toMatchObject({ outcome: "approved", txAmount: 5 });
    expect(parsePurchaseResponse(buildMockPurchaseResponse("timeout", opts)).code).toBe("TIMEOUT");
    expect(parsePurchaseResponse(buildMockPurchaseResponse("declined", opts)).code).toBe("DECLINED");
  });
});
