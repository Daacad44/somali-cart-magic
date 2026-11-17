import { describe, expect, it } from "vitest";
import { PAYMENT_STALE_MINUTES as CLIENT_STALE_MINUTES } from "@/integrations/supabase/types";
import {
  amountMismatchReason,
  checkPayability,
  classifyPurchaseFailure,
  CONFIRMABLE_STATUSES,
  IN_FLIGHT_WINDOW_MS,
  normalizeTransactionId,
  PAY_MESSAGES,
  PAYMENT_STALE_INTERVAL,
  PAYMENT_STALE_MINUTES,
  parsePurchaseResponse,
  resolveWaafiEndpoint,
  WAAFI_ENDPOINTS,
} from "../../../supabase/functions/_shared/waafipay-logic.ts";

describe("stale window", () => {
  it("is 6 minutes everywhere (one more than WaafiPay's 5-minute payer window)", () => {
    expect(PAYMENT_STALE_MINUTES).toBe(6);
    expect(CLIENT_STALE_MINUTES).toBe(PAYMENT_STALE_MINUTES);
    expect(IN_FLIGHT_WINDOW_MS).toBe(6 * 60_000);
    expect(PAYMENT_STALE_INTERVAL).toBe("6 minutes");
  });

  it("still blocks a 5-minute-old attempt", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    const created_at = new Date(now - 5 * 60_000).toISOString();
    const r = checkPayability({ status: "pending", payment_status: "pending", total: 10 }, [{ id: "p", status: "pending", created_at }], now);
    expect(r).toMatchObject({ ok: false, code: "PAYMENT_IN_PROGRESS" });
  });

  it("messages: TIMEOUT cites WaafiPay's 5 min, UNKNOWN tells not to retry for 6 min", () => {
    expect(PAY_MESSAGES.TIMEOUT.en).toContain("5 minutes");
    expect(PAY_MESSAGES.UNKNOWN.en).toContain("6 minutes");
    expect(PAY_MESSAGES.UNKNOWN.so).toContain("6 daqiiqo");
  });
});

describe("classifyPurchaseFailure", () => {
  it("network timeout → pending/UNKNOWN, order left pending", () => {
    const r = classifyPurchaseFailure({ kind: "network_timeout" });
    expect(r).toMatchObject({ status: "pending", code: "UNKNOWN", responseCode: "UNKNOWN", orderPaymentStatus: "pending" });
    expect(r.message).toBe(PAY_MESSAGES.UNKNOWN);
  });

  it("transport error / unreadable response → UNKNOWN (never failed)", () => {
    expect(classifyPurchaseFailure({ kind: "transport_error", message: "connection reset" })).toMatchObject({
      status: "pending",
      code: "UNKNOWN",
      orderPaymentStatus: "pending",
    });
    const garbage = parsePurchaseResponse({ hello: "world" });
    expect(classifyPurchaseFailure({ kind: "response", parsed: garbage })).toMatchObject({ status: "pending", code: "UNKNOWN" });
  });

  it("explicit decline → failed/DECLINED, order failed", () => {
    const parsed = parsePurchaseResponse({ responseCode: "5206", errorCode: "E10308", responseMsg: "Insufficient balance" });
    const r = classifyPurchaseFailure({ kind: "response", parsed });
    expect(r).toMatchObject({ status: "failed", code: "DECLINED", responseCode: "5206", orderPaymentStatus: "failed" });
    expect(r.message.en).toContain("Insufficient balance");
  });

  it("5306 → cancelled/CANCELLED, 5309 → failed/TIMEOUT", () => {
    expect(classifyPurchaseFailure({ kind: "response", parsed: parsePurchaseResponse({ responseCode: "5306" }) })).toMatchObject({
      status: "cancelled",
      code: "CANCELLED",
      orderPaymentStatus: "failed",
    });
    expect(classifyPurchaseFailure({ kind: "response", parsed: parsePurchaseResponse({ responseCode: "5309" }) })).toMatchObject({
      status: "failed",
      code: "TIMEOUT",
      orderPaymentStatus: "failed",
    });
  });

  it("refuses an approved result", () => {
    const parsed = parsePurchaseResponse({ responseCode: "2001", params: { state: "APPROVED" } });
    expect(() => classifyPurchaseFailure({ kind: "response", parsed })).toThrow();
  });
});

describe("amountMismatchReason", () => {
  it("ignores missing txAmount and differences ≤ 0.009", () => {
    expect(amountMismatchReason("12.50", null)).toBeNull();
    expect(amountMismatchReason("12.50", 12.5)).toBeNull();
    expect(amountMismatchReason(12.5, 12.509)).toBeNull();
    expect(amountMismatchReason(12.5, 12.505)).toBeNull();
  });
  it("flags real mismatches", () => {
    expect(amountMismatchReason("12.50", 12.0)).toBe("AMOUNT_MISMATCH: expected 12.50 got 12.00");
    expect(amountMismatchReason(10, 10.02)).toBe("AMOUNT_MISMATCH: expected 10.00 got 10.02");
  });
});

describe("manual confirm helpers", () => {
  it("normalizeTransactionId", () => {
    expect(normalizeTransactionId(" 7712345 ")).toBe("7712345");
    expect(normalizeTransactionId(7712345)).toBe("7712345");
    expect(normalizeTransactionId("TX-1_a.b")).toBe("TX-1_a.b");
    expect(normalizeTransactionId("")).toBeNull();
    expect(normalizeTransactionId("   ")).toBeNull();
    expect(normalizeTransactionId("a b")).toBeNull();
    expect(normalizeTransactionId("x".repeat(65))).toBeNull();
    expect(normalizeTransactionId("x".repeat(64))).toBe("x".repeat(64));
    expect(normalizeTransactionId(null)).toBeNull();
  });
  it("only pending/initiated/failed payments are confirmable", () => {
    expect([...CONFIRMABLE_STATUSES].sort()).toEqual(["failed", "initiated", "pending"]);
  });
});

describe("resolveWaafiEndpoint", () => {
  it("defaults to the documented hosts", () => {
    expect(resolveWaafiEndpoint("sandbox")).toBe("https://sandbox.waafipay.com/asm");
    expect(resolveWaafiEndpoint("production", "  ")).toBe(WAAFI_ENDPOINTS.production);
  });
  it("accepts an https override and strips a trailing slash", () => {
    expect(resolveWaafiEndpoint("sandbox", "https://sandbox.example.com/asm/")).toBe("https://sandbox.example.com/asm");
  });
  it("rejects invalid or non-https overrides", () => {
    expect(() => resolveWaafiEndpoint("sandbox", "not a url")).toThrow();
    expect(() => resolveWaafiEndpoint("sandbox", "http://sandbox.waafipay.com/asm")).toThrow();
  });
});
