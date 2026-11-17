import { describe, expect, it } from "vitest";
import { PAYMENT_STALE_MINUTES, type Payment } from "@/integrations/supabase/types";
import {
  hasInFlightPayment, isOrderPayable, isPaymentStale, minutesUntilStale, newestInFlightPayment, paymentStaleAt,
  serverPayMessage, type OrderPaymentState,
} from "@/lib/payment-state";

const T0 = Date.parse("2026-11-17T10:00:00Z");
const min = (m: number) => m * 60_000;
const pay = (status: Payment["status"], at: number) => ({ status, created_at: new Date(at).toISOString() });
const order = (over: Partial<OrderPaymentState> = {}): OrderPaymentState => ({
  status: "pending", payment_status: "pending", payments: [pay("pending", T0)], ...over,
});

describe("payment-state", () => {
  it("newest in-flight attempt ignores finished attempts", () => {
    const ps = [pay("failed", T0 + min(5)), pay("initiated", T0 + min(1)), pay("pending", T0)];
    expect(newestInFlightPayment(ps)?.created_at).toBe(new Date(T0 + min(1)).toISOString());
    expect(newestInFlightPayment([pay("approved", T0)])).toBeNull();
    expect(newestInFlightPayment(undefined)).toBeNull();
  });

  it("is in flight until PAYMENT_STALE_MINUTES have passed", () => {
    const o = order();
    expect(paymentStaleAt(o)).toBe(T0 + min(PAYMENT_STALE_MINUTES));
    expect(hasInFlightPayment(o, T0 + min(1))).toBe(true);
    expect(isPaymentStale(o, T0 + min(1))).toBe(false);
    expect(isOrderPayable(o, T0 + min(1))).toBe(false);
    expect(minutesUntilStale(o, T0 + min(1) + 1)).toBe(PAYMENT_STALE_MINUTES - 1);

    const later = T0 + min(PAYMENT_STALE_MINUTES);
    expect(hasInFlightPayment(o, later)).toBe(false);
    expect(isPaymentStale(o, later)).toBe(true);
    expect(isOrderPayable(o, new Date(later))).toBe(true);
    expect(minutesUntilStale(o, later)).toBe(0);
  });

  it("uses the newest in-flight attempt", () => {
    const o = order({ payments: [pay("pending", T0), pay("initiated", T0 + min(4))] });
    expect(hasInFlightPayment(o, T0 + min(7))).toBe(true);
    expect(isOrderPayable(o, T0 + min(11))).toBe(true);
  });

  it("pending with no in-flight rows is stale; unloaded payments are assumed in flight", () => {
    expect(isPaymentStale(order({ payments: [pay("failed", T0)] }), T0)).toBe(true);
    expect(isPaymentStale(order({ payments: [] }), T0)).toBe(true);
    expect(hasInFlightPayment(order({ payments: undefined }), T0 + min(60))).toBe(true);
    expect(isOrderPayable(order({ payments: undefined }), T0 + min(60))).toBe(false);
  });

  it("unpaid/failed pending orders are payable; paid, cancelled or shipped ones aren't", () => {
    expect(isOrderPayable(order({ payment_status: "unpaid", payments: [] }), T0)).toBe(true);
    expect(isOrderPayable(order({ payment_status: "failed" }), T0)).toBe(true);
    expect(isOrderPayable(order({ payment_status: "paid" }), T0 + min(60))).toBe(false);
    expect(isOrderPayable(order({ status: "cancelled", payment_status: "failed" }), T0)).toBe(false);
    expect(isOrderPayable(order({ status: "cancelled" }), T0 + min(60))).toBe(false);
    expect(isOrderPayable(null)).toBe(false);
    expect(hasInFlightPayment(order({ payment_status: "failed" }), T0)).toBe(false);
  });

  it("serverPayMessage prefers English when available", () => {
    expect(serverPayMessage({ message: "so", message_en: "en" }, "en")).toBe("en");
    expect(serverPayMessage({ message: "so", message_en: "en" }, "so")).toBe("so");
    expect(serverPayMessage({ message: "so" }, "en")).toBe("so");
    expect(serverPayMessage(null, "en")).toBe("");
  });
});
