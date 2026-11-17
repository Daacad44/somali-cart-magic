import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Category, StoreSettings, WalletPrefixRow } from "@/integrations/supabase/types";

export const storeSettingsKey = ["admin", "store-settings"] as const;
export const categoriesKey = ["admin", "categories"] as const;
export const walletPrefixesKey = ["admin", "wallet-prefixes"] as const;

export function useStoreSettings() {
  return useQuery({
    queryKey: storeSettingsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as StoreSettings | null;
    },
  });
}

/** All categories (incl. inactive — visible to products.manage via RLS). */
export function useAdminCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export function useAllWalletPrefixes() {
  return useQuery({
    queryKey: walletPrefixesKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("wallet_prefixes").select("*").order("prefix");
      if (error) throw error;
      return (data ?? []) as WalletPrefixRow[];
    },
  });
}
