import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Order, StoreSettings } from "@/integrations/supabase/types";
import { ReceiptView, settlingPayment } from "@/components/receipt/Receipt";

const settings: StoreSettings = {
  id: 1, store_name: "Botan Store", currency: "USD", shipping_fee: 0, free_shipping_over: null, tax_rate: 0.05,
  phone: "+252 61 000 0000", address: "Mogadishu", receipt_footer: "Mahadsanid!", max_cashier_discount_pct: 0.2, updated_at: "2026-11-17T00:00:00Z",
};

const order = {
  id: "abcdef12-0000-0000-0000-000000000000", order_number: "ORD-1001", channel: "pos", customer_id: null, user_id: null,
  created_by: "u1", status: "paid", payment_status: "paid", subtotal: 20, shipping_fee: 0, tax: 0.95, discount: 1,
  total: 19.95, currency: "USD", shipping_name: null, shipping_phone: null, shipping_address: null, shipping_city: null,
  shipping_district: null, notes: null, paid_at: "2026-11-17T10:00:00Z", cancelled_at: null, needs_review: false, review_reason: null,
  created_at: "2026-11-17T09:59:00Z", updated_at: "2026-11-17T10:00:00Z",
  customer: { id: "c1", full_name: "Ayaan Cali", phone: "252612345678" },
  items: [{ id: "i1", order_id: "o", product_id: "p", product_name: "Shirt", sku: "SH", image: null, unit_price: 10,
    quantity: 2, variants: { Size: "M" }, line_total: 20, stock_deducted: 2 }],
  payments: [
    { id: "p1", order_id: "o", provider: "waafipay", wallet: "EVC_PLUS", account_no: "252610000000", amount: 19.95,
      currency: "USD", status: "failed", reference_id: "r1", request_id: null, transaction_id: null,
      issuer_transaction_id: null, response_code: null, response_msg: null, initiated_by: null,
      created_at: "2026-11-17T09:59:30Z", updated_at: "2026-11-17T09:59:30Z" },
    { id: "p2", order_id: "o", provider: "waafipay", wallet: "EVC_PLUS", account_no: "252612345678", amount: 19.95,
      currency: "USD", status: "approved", reference_id: "r2", request_id: null, transaction_id: "TX-999",
      issuer_transaction_id: null, response_code: null, response_msg: null, initiated_by: null,
      created_at: "2026-11-17T09:59:50Z", updated_at: "2026-11-17T10:00:00Z" },
  ],
} as Order;

describe("ReceiptView", () => {
  it("renders store, order, items, totals and masked payment details", () => {
    render(<ReceiptView order={order} settings={settings} cashierName="Hodan" lang="en" />);
    expect(screen.getByText("Botan Store")).toBeInTheDocument();
    expect(screen.getByText("ORD-1001")).toBeInTheDocument();
    expect(screen.getByText("Hodan")).toBeInTheDocument();
    expect(screen.getByText("Size: M")).toBeInTheDocument();
    expect(screen.getByText("$19.95", { selector: ".rcpt-total span" })).toBeInTheDocument();
    expect(screen.getByText("EVC Plus")).toBeInTheDocument();
    expect(screen.getAllByText("25261****678").length).toBeGreaterThan(0);
    expect(screen.getByText("TX-999")).toBeInTheDocument();
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.getByText("Mahadsanid!")).toBeInTheDocument();
  });

  it("defaults to Somali labels", () => {
    render(<ReceiptView order={order} settings={settings} />);
    expect(screen.getByText("LA BIXIYAY")).toBeInTheDocument();
  });

  it("settlingPayment prefers the approved payment", () => {
    expect(settlingPayment(order.payments)?.id).toBe("p2");
    expect(settlingPayment([])).toBeNull();
  });
});
