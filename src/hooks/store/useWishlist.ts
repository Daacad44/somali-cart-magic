import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Product } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { PRODUCT_SELECT } from "./query-utils";
import { storeKeys } from "./useCatalog";

export interface WishlistEntry {
  product_id: string;
  created_at: string;
  product: Product | null;
}

export function useWishlist() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const key = storeKeys.wishlist(uid);

  const query = useQuery({
    queryKey: key,
    enabled: isSupabaseConfigured && !!uid,
    queryFn: async (): Promise<WishlistEntry[]> => {
      const { data, error } = await supabase
        .from("wishlists")
        .select(`product_id, created_at, product:products(${PRODUCT_SELECT})`)
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as WishlistEntry[]).map((e) => ({
        ...e,
        product: e.product
          ? { ...e.product, price: Number(e.product.price), compare_at_price: e.product.compare_at_price == null ? null : Number(e.product.compare_at_price) }
          : null,
      }));
    },
  });

  const ids = useMemo(() => new Set((query.data ?? []).map((e) => e.product_id)), [query.data]);

  const toggle = useMutation({
    mutationFn: async ({ product, add }: { product: Product; add: boolean }) => {
      if (!uid) throw new Error("AUTH_REQUIRED");
      if (add) {
        const { error } = await supabase.from("wishlists").upsert(
          { user_id: uid, product_id: product.id },
          { onConflict: "user_id,product_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from("wishlists").delete().eq("user_id", uid).eq("product_id", product.id);
        if (error) throw error;
      }
      return add;
    },
    onMutate: async ({ product, add }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WishlistEntry[]>(key);
      qc.setQueryData<WishlistEntry[]>(key, (old = []) =>
        add
          ? [{ product_id: product.id, created_at: new Date().toISOString(), product }, ...old.filter((e) => e.product_id !== product.id)]
          : old.filter((e) => e.product_id !== product.id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    ...query,
    entries: query.data ?? [],
    ids,
    has: (productId: string) => ids.has(productId),
    isSignedIn: !!uid,
    toggle,
  };
}
