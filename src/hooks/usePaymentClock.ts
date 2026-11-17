import { useEffect, useState } from "react";
import { hasInFlightPayment, isOrderPayable, paymentStaleAt, type OrderPaymentState } from "@/lib/payment-state";

/**
 * Re-renders every second while the order has an in-flight payment attempt, so
 * the UI flips to "payable / cancellable" the moment that attempt goes stale.
 */
export function usePaymentClock(order: OrderPaymentState | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const inFlight = hasInFlightPayment(order, now);
  useEffect(() => {
    if (!inFlight) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inFlight]);
  const staleAt = paymentStaleAt(order);
  return {
    now,
    inFlight,
    payable: isOrderPayable(order, now),
    /** Seconds until a new attempt is allowed (0 when not in flight). */
    secondsLeft: inFlight && staleAt ? Math.max(0, Math.ceil((staleAt - now) / 1000)) : 0,
  };
}

/** m:ss for a countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds remaining until `targetMs` (epoch), ticking every second; 0 when null or past. */
export function useCountdown(targetMs: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const active = !!targetMs && targetMs > now;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, targetMs]);
  return targetMs ? Math.max(0, Math.ceil((targetMs - now) / 1000)) : 0;
}
