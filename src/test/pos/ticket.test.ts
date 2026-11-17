import { describe, expect, it } from "vitest";
import type { Order } from "@/integrations/supabase/types";
import {
  addLine, clampDiscount, computeTotals, initialPayState, isBusy, isTicketLocked, lineKey, maxQtyForLine,
  missingVariants, payReducer, removeLine, round2, setLineQty, toRpcItems, validateSale,
  type PayState, type TicketLine, type TicketProduct,
} from "@/components/pos/ticket";

const product = (over: Partial<TicketProduct> = {}): TicketProduct => ({
  id: "p1", name: "Shirt", name_so: "Shaati", sku: "SH-1", price: 10, stock: 5,
  images: ["/products/shirt.jpg"], variant_options: [], ...over,
});

const order = { id: "o1", order_number: "ORD-1001", total: 21 } as Order;

describe("lineKey", () => {
  it("is order-independent for variants", () => {
    expect(lineKey("p", { Size: "M", Color: "Red" })).toBe(lineKey("p", { Color: "Red", Size: "M" }));
  });
  it("differs per variant and ignores empty values", () => {
    expect(lineKey("p", { Size: "M" })).not.toBe(lineKey("p", { Size: "L" }));
    expect(lineKey("p", { Size: "" })).toBe("p");
    expect(lineKey("p")).toBe("p");
  });
});

describe("addLine / quantities", () => {
  it("merges identical lines and keeps variant lines separate", () => {
    let lines: TicketLine[] = [];
    lines = addLine(lines, product(), { Size: "M" }).lines;
    lines = addLine(lines, product(), { Size: "M" }).lines;
    lines = addLine(lines, product(), { Size: "L" }).lines;
    expect(lines).toHaveLength(2);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].image).toBe("/products/shirt.jpg");
  });

  it("clamps to product stock across variant lines", () => {
    let lines: TicketLine[] = [];
    lines = addLine(lines, product({ stock: 3 }), { Size: "M" }, 2).lines;
    const r = addLine(lines, product({ stock: 3 }), { Size: "L" }, 5);
    expect(r.added).toBe(1);
    const r2 = addLine(r.lines, product({ stock: 3 }), { Size: "S" });
    expect(r2.added).toBe(0);
    expect(r2.lines).toBe(r.lines);
  });

  it("does not add out-of-stock products", () => {
    const r = addLine([], product({ stock: 0 }));
    expect(r.added).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it("setLineQty clamps to [1, available] and removes on 0", () => {
    let lines = addLine([], product({ stock: 4 }), { Size: "M" }, 1).lines;
    lines = addLine(lines, product({ stock: 4 }), { Size: "L" }, 1).lines;
    const k = lines[0].key;
    expect(maxQtyForLine(lines, k)).toBe(3);
    expect(setLineQty(lines, k, 10)[0].quantity).toBe(3);
    expect(setLineQty(lines, k, 2.7)[0].quantity).toBe(2);
    expect(setLineQty(lines, k, 0)).toHaveLength(1);
    expect(setLineQty(lines, k, Number.NaN)).toBe(lines);
    expect(removeLine(lines, k).map((l) => l.key)).toEqual([lines[1].key]);
  });

  it("toRpcItems maps lines to the create_order payload", () => {
    const lines = addLine([], product(), { Size: "M" }, 2).lines;
    expect(toRpcItems(lines)).toEqual([{ product_id: "p1", quantity: 2, variants: { Size: "M" } }]);
  });
});

describe("missingVariants", () => {
  const opts = [{ type: "Size", options: ["S", "M"] }, { type: "Color", options: ["Red"] }, { type: "Empty", options: [] }];
  it("lists unselected or invalid required types", () => {
    expect(missingVariants(opts, {})).toEqual(["Size", "Color"]);
    expect(missingVariants(opts, { Size: "XL", Color: "Red" })).toEqual(["Size"]);
    expect(missingVariants(opts, { Size: "S", Color: "Red" })).toEqual([]);
    expect(missingVariants(null, {})).toEqual([]);
  });
});

describe("money", () => {
  it("round2 mirrors Postgres round(…, 2) half away from zero", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.125)).toBe(0.13);
    expect(round2(10)).toBe(10);
  });

  it("computes totals with discount and tax like create_order", () => {
    let lines = addLine([], product({ id: "a", price: 89.99, stock: 10 }), {}, 3).lines;
    lines = addLine(lines, product({ id: "b", price: 0.1, stock: 10 }), {}, 3).lines;
    const t = computeTotals(lines, 10, 0.05);
    // subtotal = 269.97 + 0.30 = 270.27; taxable = 260.27; tax = round(13.0135) = 13.01
    expect(t.subtotal).toBe(270.27);
    expect(t.discount).toBe(10);
    expect(t.tax).toBe(13.01);
    expect(t.total).toBe(273.28);
    expect(t.itemCount).toBe(6);
  });

  it("rounds tax half up and clamps discount to subtotal", () => {
    const lines = addLine([], product({ price: 10.5, stock: 1 })).lines;
    // 10.50 * 0.05 = 0.525 → 0.53
    expect(computeTotals(lines, 0, 0.05).tax).toBe(0.53);
    const t = computeTotals(lines, 999, 0.05);
    expect(t.discount).toBe(10.5);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(0);
    expect(computeTotals(lines, -5, 0).discount).toBe(0);
  });

  it("clampDiscount parses input", () => {
    expect(clampDiscount("5,5", 100)).toBe(5.5);
    expect(clampDiscount("abc", 100)).toBe(0);
    expect(clampDiscount(200, 50)).toBe(50);
    expect(clampDiscount(-1, 50)).toBe(0);
  });
});

describe("validateSale", () => {
  const lines = addLine([], product()).lines;
  it("requires items", () => {
    expect(validateSale({ lines: [], method: "cash", normalizedPhone: null, detectedWallet: null, overrideWallet: null }))
      .toEqual(["EMPTY_TICKET"]);
  });
  it("cash sales don't need a phone", () => {
    expect(validateSale({ lines, method: "cash", normalizedPhone: null, detectedWallet: null, overrideWallet: null })).toEqual([]);
  });
  it("wallet sales need a valid phone and a wallet", () => {
    expect(validateSale({ lines, method: "wallet", normalizedPhone: null, detectedWallet: null, overrideWallet: null }))
      .toEqual(["INVALID_PHONE"]);
    expect(validateSale({ lines, method: "wallet", normalizedPhone: "252612345678", detectedWallet: null, overrideWallet: null }))
      .toEqual(["WALLET_NOT_DETECTED"]);
    expect(validateSale({ lines, method: "wallet", normalizedPhone: "252612345678", detectedWallet: null, overrideWallet: "JEEB" }))
      .toEqual([]);
    expect(validateSale({ lines, method: "wallet", normalizedPhone: "252612345678", detectedWallet: "EVC_PLUS", overrideWallet: null }))
      .toEqual([]);
  });
  it("flags quantities above stock", () => {
    const bad = [{ ...lines[0], quantity: 99 }];
    expect(validateSale({ lines: bad, method: "cash", normalizedPhone: null, detectedWallet: null, overrideWallet: null }))
      .toContain("INVALID_QUANTITY");
  });
});

describe("payReducer", () => {
  const attempt = { method: "wallet" as const, phone: "252612345678", wallet: "EVC_PLUS" as const, startedAt: 1 };

  it("idle → creating → awaiting_payment → approved", () => {
    let s: PayState = payReducer(initialPayState, { type: "CREATE_START", print: true });
    expect(s.phase).toBe("creating");
    expect(isBusy(s)).toBe(true);
    s = payReducer(s, { type: "CREATE_SUCCESS", order });
    s = payReducer(s, { type: "PAY_START", attempt });
    expect(s.phase).toBe("awaiting_payment");
    expect(s.attempts).toBe(1);
    s = payReducer(s, { type: "PAY_APPROVED" });
    expect(s.phase).toBe("approved");
    expect(s.order).toBe(order);
    expect(s.print).toBe(true);
  });

  it("blocks double submit while busy", () => {
    const s = payReducer(initialPayState, { type: "CREATE_START", print: false });
    expect(payReducer(s, { type: "CREATE_START", print: true })).toBe(s);
    expect(payReducer(s, { type: "CANCEL_START" })).toBe(s);
  });

  it("create failure returns to idle without an order", () => {
    let s = payReducer(initialPayState, { type: "CREATE_START", print: false });
    s = payReducer(s, { type: "CREATE_FAIL", error: { code: "OUT_OF_STOCK", message: "x" } });
    expect(s.phase).toBe("idle");
    expect(s.order).toBeNull();
    expect(s.error?.code).toBe("OUT_OF_STOCK");
  });

  it("keeps the order on decline and retries on the same order", () => {
    let s = payReducer(initialPayState, { type: "CREATE_START", print: false });
    s = payReducer(s, { type: "CREATE_SUCCESS", order });
    s = payReducer(s, { type: "PAY_START", attempt });
    s = payReducer(s, { type: "PAY_FAILED", error: { code: "DECLINED", message: "no" } });
    expect(s.phase).toBe("failed");
    expect(s.order).toBe(order);
    expect(isTicketLocked(s)).toBe(true);
    // a new CREATE is refused while the order exists
    expect(payReducer(s, { type: "CREATE_START", print: false })).toBe(s);
    s = payReducer(s, { type: "PAY_START", attempt: { ...attempt, method: "cash", wallet: "CASH", phone: null }, print: true });
    expect(s.phase).toBe("awaiting_payment");
    expect(s.order).toBe(order);
    expect(s.attempts).toBe(2);
    expect(s.print).toBe(true);
  });

  it("cancel flow resets, cancel failure keeps the order", () => {
    let s = payReducer(initialPayState, { type: "CREATE_START", print: false });
    s = payReducer(s, { type: "CREATE_SUCCESS", order });
    s = payReducer(s, { type: "PAY_START", attempt });
    s = payReducer(s, { type: "PAY_FAILED", error: { code: "TIMEOUT", message: "t" } });
    const c = payReducer(s, { type: "CANCEL_START" });
    expect(c.phase).toBe("cancelling");
    const failed = payReducer(c, { type: "CANCEL_FAIL", error: { code: "PAYMENT_IN_PROGRESS", message: "p" } });
    expect(failed.phase).toBe("failed");
    expect(failed.order).toBe(order);
    expect(payReducer(c, { type: "CANCEL_DONE" })).toEqual(initialPayState);
  });

  it("ignores out-of-order events", () => {
    expect(payReducer(initialPayState, { type: "PAY_APPROVED" })).toBe(initialPayState);
    expect(payReducer(initialPayState, { type: "PAY_FAILED", error: { code: "x", message: "y" } })).toBe(initialPayState);
    expect(payReducer(initialPayState, { type: "PAY_START", attempt })).toBe(initialPayState);
  });
});
