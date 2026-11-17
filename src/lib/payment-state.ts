import { PAYMENT_STALE_MINUTES, type Order, type Payment } from "@/integrations/supabase/types";

/**
 * Pure helpers describing where an order's payment stands, mirroring the
 * server's `expire_stale_payments`: an attempt in ('initiated','pending')
 * older than PAYMENT_STALE_MINUTES can no longer be approved, so the order
 * may be paid again / cancelled even if payment_status still says 'pending'.
 */
export const PAYMENT_STALE_MS = PAYMENT_STALE_MINUTES * 60_000;

type PaymentLike = Pick<Payment, "status" | "created_at">;
export type OrderPaymentState = Pick<Order, "status" | "payment_status"> & { payments?: PaymentLike[] | null };

const IN_FLIGHT: ReadonlyArray<Payment["status"]> = ["initiated", "pending"];

function toMs(now: Date | number): number {
  return typeof now === "number" ? now : now.getTime();
}

/** Newest payment attempt that is still 'initiated' or 'pending' (any age). */
export function newestInFlightPayment<P extends PaymentLike>(payments: P[] | null | undefined): P | null {
  let best: P | null = null;
  let bestMs = -Infinity;
  for (const p of payments ?? []) {
    if (!IN_FLIGHT.includes(p.status)) continue;
    const ms = Date.parse(p.created_at);
    if (Number.isFinite(ms) && ms > bestMs) { best = p; bestMs = ms; }
  }
  return best;
}

/** Epoch ms at which the newest in-flight attempt becomes stale (null if none). */
export function paymentStaleAt(order: OrderPaymentState | null | undefined): number | null {
  const p = newestInFlightPayment(order?.payments);
  return p ? Date.parse(p.created_at) + PAYMENT_STALE_MS : null;
}

/**
 * True while a payment attempt may still be approved by the payer.
 * If the order says 'pending' but its payments were not loaded, we can't tell,
 * so assume in flight (conservative).
 */
export function hasInFlightPayment(order: OrderPaymentState | null | undefined, now: Date | number = Date.now()): boolean {
  if (!order || order.payment_status !== "pending") return false;
  if (!order.payments) return true;
  const at = paymentStaleAt(order);
  return at !== null && toMs(now) < at;
}

/** Order is 'pending' payment but every in-flight attempt is past the stale window. */
export function isPaymentStale(order: OrderPaymentState | null | undefined, now: Date | number = Date.now()): boolean {
  return !!order && order.payment_status === "pending" && !!order.payments && !hasInFlightPayment(order, now);
}

/** Whether the order may (again) be paid or cancelled. */
export function isOrderPayable(order: OrderPaymentState | null | undefined, now: Date | number = Date.now()): boolean {
  if (!order || order.status !== "pending") return false;
  if (order.payment_status === "unpaid" || order.payment_status === "failed") return true;
  return isPaymentStale(order, now);
}

/** Whole minutes (rounded up, >= 0) until the in-flight attempt is stale. */
export function minutesUntilStale(order: OrderPaymentState | null | undefined, now: Date | number = Date.now()): number {
  const at = paymentStaleAt(order);
  if (at === null) return 0;
  return Math.max(0, Math.ceil((at - toMs(now)) / 60_000));
}

/** Server message in the UI language: message_en for English when the server sent one. */
export function serverPayMessage(
  res: { message?: string | null; message_en?: string | null } | null | undefined,
  lang: "so" | "en",
): string {
  if (!res) return "";
  return (lang === "en" && res.message_en ? res.message_en : res.message) || "";
}
