import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Order, OrderItem, Payment } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { subscribeToOrderPayments } from "@/lib/payments";
import { hasInFlightPayment, isOrderPayable as isPayable } from "@/lib/payment-state";
import { storeKeys } from "./useCatalog";

function normalizeOrder(o: Order): Order {
  const num = (x: unknown) => Number(x ?? 0);
  return {
    ...o,
    subtotal: num(o.subtotal),
    shipping_fee: num(o.shipping_fee),
    tax: num(o.tax),
    discount: num(o.discount),
    total: num(o.total),
    items: o.items?.map((i: OrderItem) => ({ ...i, unit_price: num(i.unit_price), line_total: num(i.line_total) })),
    payments: o.payments
      ?.map((p: Payment) => ({ ...p, amount: num(p.amount) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/** The signed-in user's own orders (filtered by user_id: staff RLS would otherwise return all). */
export function useMyOrders() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: storeKeys.myOrders(uid),
    enabled: isSupabaseConfigured && !!uid,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, items:order_items(id, product_name, image, quantity)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as Order[]).map(normalizeOrder);
    },
  });
}

/**
 * One order with items & payments. Subscribes to Realtime payment/order
 * changes and polls while a payment is pending, so status stays live.
 */
export function useMyOrder(id: string | undefined, { live = true }: { live?: boolean } = {}) {
  const qc = useQueryClient();
  const key = storeKeys.myOrder(id);
  const query = useQuery({
    queryKey: key,
    enabled: isSupabaseConfigured && !!id,
    queryFn: async (): Promise<Order | null> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, items:order_items(*), payments(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeOrder(data as Order) : null;
    },
    // Poll only while an attempt can still be approved; stop once it has gone stale.
    refetchInterval: (q) => (hasInFlightPayment(q.state.data) ? 5000 : false),
  });

  useEffect(() => {
    if (!live || !id || !isSupabaseConfigured) return;
    const unsubPayments = subscribeToOrderPayments(id, () => {
      void qc.invalidateQueries({ queryKey: key });
    });
    const channel = supabase
      .channel(`order:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => {
      unsubPayments();
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live, qc]);

  return query;
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason ?? null });
      if (error) throw error;
      return data as Order;
    },
    onSuccess: (_d, { orderId }) => {
      void qc.invalidateQueries({ queryKey: storeKeys.myOrder(orderId) });
      void qc.invalidateQueries({ queryKey: ["store", "my-orders"] });
    },
  });
}

/**
 * Whether a customer may still pay / cancel this order: unpaid/failed, or
 * 'pending' whose newest attempt is older than PAYMENT_STALE_MINUTES.
 */
export function isOrderPayable(o: Parameters<typeof isPayable>[0], now: Date | number = Date.now()): boolean {
  return isPayable(o, now);
}
