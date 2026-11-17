import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Category, Product, StoreSettings } from "@/integrations/supabase/types";
import { PAGE_SIZE, PRODUCT_SELECT, searchOrFilter, type ProductSort } from "./query-utils";

export interface ProductFilters {
  category?: string | null;   // category slug
  search?: string | null;
  sort?: ProductSort;
  featured?: boolean;
  flashSale?: boolean;
  /** Discounted items (compare_at_price set) */
  sale?: boolean;
  page?: number;              // 1-based
  pageSize?: number;
  excludeId?: string;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
}

function normalizeProduct(p: Product): Product {
  return {
    ...p,
    price: Number(p.price),
    compare_at_price: p.compare_at_price == null ? null : Number(p.compare_at_price),
    rating: Number(p.rating ?? 0),
    images: p.images ?? [],
    variant_options: Array.isArray(p.variant_options) ? p.variant_options : [],
    tags: p.tags ?? [],
  };
}

export const storeKeys = {
  products: (f: ProductFilters) => ["store", "products", f] as const,
  product: (slug: string) => ["store", "product", slug] as const,
  categories: ["store", "categories"] as const,
  categoryCounts: ["store", "category-counts"] as const,
  settings: ["store", "settings"] as const,
  wishlist: (uid: string | undefined) => ["store", "wishlist", uid] as const,
  myOrders: (uid: string | undefined) => ["store", "my-orders", uid] as const,
  myOrder: (id: string | undefined) => ["store", "my-order", id] as const,
  myCustomer: (uid: string | undefined) => ["store", "my-customer", uid] as const,
  walletPrefixes: ["store", "wallet-prefixes"] as const,
};

export async function fetchProducts(f: ProductFilters): Promise<ProductPage> {
  const pageSize = f.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, f.page ?? 1);
  const select = f.category
    ? PRODUCT_SELECT.replace("category:categories(", "category:categories!inner(")
    : PRODUCT_SELECT;
  let q = supabase.from("products").select(select, { count: "exact" }).eq("is_active", true);

  if (f.category) q = q.eq("category.slug", f.category);
  const or = f.search ? searchOrFilter(f.search) : null;
  if (or) q = q.or(or);
  if (f.featured) q = q.eq("is_featured", true);
  if (f.flashSale) q = q.gt("flash_sale_ends_at", new Date().toISOString());
  if (f.sale) q = q.not("compare_at_price", "is", null);
  if (f.excludeId) q = q.neq("id", f.excludeId);

  switch (f.sort ?? "latest") {
    case "price-asc": q = q.order("price", { ascending: true }); break;
    case "price-desc": q = q.order("price", { ascending: false }); break;
    case "popular": q = q.order("review_count", { ascending: false }); break;
    case "rating": q = q.order("rating", { ascending: false }); break;
    default: q = q.order("created_at", { ascending: false });
  }
  q = q.order("id", { ascending: true }); // stable pagination

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw error;
  const total = count ?? 0;
  return {
    items: ((data ?? []) as unknown as Product[]).map(normalizeProduct),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function useProducts(filters: ProductFilters = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: storeKeys.products(filters),
    queryFn: () => fetchProducts(filters),
    enabled: isSupabaseConfigured && (opts.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: storeKeys.product(slug ?? ""),
    enabled: isSupabaseConfigured && !!slug,
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("slug", slug!)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeProduct(data as unknown as Product) : null;
    },
  });
}

export function useRelatedProducts(product: Product | null | undefined, limit = 4) {
  const slug = product?.category?.slug ?? null;
  return useProducts({
    category: slug,
    excludeId: product?.id,
    sort: "popular",
    pageSize: limit,
    // Without a category fall back to featured items
    featured: !slug,
  }, { enabled: !!product });
}

export function useCategories() {
  return useQuery({
    queryKey: storeKeys.categories,
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

/** Active product count per category id. */
export function useCategoryCounts() {
  return useQuery({
    queryKey: storeKeys.categoryCounts,
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("products").select("category_id").eq("is_active", true);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { category_id: string | null }[]) {
        if (row.category_id) counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: storeKeys.settings,
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StoreSettings | null> => {
      const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const s = data as StoreSettings;
      return {
        ...s,
        shipping_fee: Number(s.shipping_fee),
        free_shipping_over: s.free_shipping_over == null ? null : Number(s.free_shipping_over),
        tax_rate: Number(s.tax_rate),
      };
    },
  });
}
