import { supabase, invokeFunction } from "@/integrations/supabase/client";
import type { Payment, PayRequest, PayResponse, WalletPrefixRow } from "@/integrations/supabase/types";

/**
 * Sends a payment request through the `waafi-pay` edge function.
 * For mobile wallets the call stays open while the payer approves the
 * USSD/PIN prompt on their phone (up to ~2 minutes), then resolves with
 * the final status. Never throws for business declines — check `ok`.
 */
export async function payOrder(req: PayRequest): Promise<PayResponse> {
  try {
    return await invokeFunction<PayResponse, PayRequest>("waafi-pay", req);
  } catch (e) {
    const payload = (e as { payload?: PayResponse }).payload;
    if (payload) return payload;
    return { ok: false, status: "failed", message: e instanceof Error ? e.message : String(e), code: "NETWORK" };
  }
}

/** Live updates for a single order's payments (Realtime). Returns unsubscribe fn. */
export function subscribeToOrderPayments(orderId: string, onChange: (p: Payment) => void): () => void {
  const channel = supabase
    .channel(`payments:${orderId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${orderId}` },
      (payload) => onChange(payload.new as Payment),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function fetchWalletPrefixes(): Promise<WalletPrefixRow[]> {
  const { data, error } = await supabase.from("wallet_prefixes").select("*").eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as WalletPrefixRow[];
}
