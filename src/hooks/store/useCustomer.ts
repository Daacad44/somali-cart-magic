import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Customer, WalletPrefixRow } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { fetchWalletPrefixes } from "@/lib/payments";
import { storeKeys } from "./useCatalog";

export interface CustomerProfileInput {
  full_name: string;
  phone: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
}

/** The customers row linked to the signed-in user (null for staff without one). */
export function useMyCustomer() {
  const { user, refresh } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const key = storeKeys.myCustomer(uid);

  const query = useQuery({
    queryKey: key,
    enabled: isSupabaseConfigured && !!uid,
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await supabase.from("customers").select("*").eq("user_id", uid!).maybeSingle();
      if (error) throw error;
      return (data as Customer) ?? null;
    },
  });

  const update = useMutation({
    mutationFn: async (input: CustomerProfileInput) => {
      if (!uid) throw new Error("AUTH_REQUIRED");
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: input.full_name, phone: input.phone })
        .eq("id", uid);
      if (pErr) throw pErr;
      const existing = qc.getQueryData<Customer | null>(key) ?? query.data;
      if (existing) {
        const { error } = await supabase
          .from("customers")
          .update({
            full_name: input.full_name,
            phone: input.phone,
            address: input.address ?? null,
            city: input.city ?? null,
            district: input.district ?? null,
          })
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      await refresh();
    },
  });

  return { ...query, update };
}

export function useWalletPrefixes() {
  return useQuery<WalletPrefixRow[]>({
    queryKey: storeKeys.walletPrefixes,
    enabled: isSupabaseConfigured,
    staleTime: 10 * 60_000,
    queryFn: fetchWalletPrefixes,
  });
}
