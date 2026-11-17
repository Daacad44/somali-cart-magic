// Data hooks for the POS / cashier screen. Self-contained (no cross-workstream imports).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Category, Customer, Order, Product, StoreSettings, WalletPrefixRow } from "@/integrations/supabase/types";
import { fetchWalletPrefixes } from "@/lib/payments";
import { normalizeSomaliPhone, localPart } from "@/lib/wallet";
import { useAuth } from "@/lib/auth";

export const posKeys = {
  products: ["pos", "products"] as const,
  categories: ["pos", "categories"] as const,
  settings: ["pos", "store-settings"] as const,
  prefixes: ["pos", "wallet-prefixes"] as const,
  customers: (q: string) => ["pos", "customers", q] as const,
  salesToday: (uid: string | undefined, day: string) => ["pos", "sales-today", uid, day] as const,
  order: (id: string) => ["pos", "order", id] as const,
};

export type PosProduct = Pick<
  Product,
  "id" | "name" | "name_so" | "sku" | "price" | "stock" | "images" | "variant_options" | "category_id" | "low_stock_threshold"
>;

const PRODUCT_COLUMNS = "id,name,name_so,sku,price,stock,images,variant_options,category_id,low_stock_threshold";

export function usePosProducts() {
  return useQuery({
    queryKey: posKeys.products,
    queryFn: async (): Promise<PosProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("is_active", true)
        .order("name")
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as PosProduct[]).map((p) => ({
        ...p,
        price: Number(p.price),
        images: p.images ?? [],
        variant_options: Array.isArray(p.variant_options) ? p.variant_options : [],
      }));
    },
    staleTime: 30_000,
  });
}

export function usePosCategories() {
  return useQuery({
    queryKey: posKeys.categories,
    queryFn: async (): Promise<Pick<Category, "id" | "name" | "name_so" | "slug" | "sort_order">[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,name_so,slug,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export const DEFAULT_SETTINGS: StoreSettings = {
  id: 1,
  store_name: "Botan E-commerce",
  currency: "USD",
  shipping_fee: 0,
  free_shipping_over: null,
  tax_rate: 0,
  phone: null,
  address: null,
  receipt_footer: null,
  updated_at: new Date(0).toISOString(),
};

export async function fetchStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  const s = data as StoreSettings;
  return { ...s, tax_rate: Number(s.tax_rate) || 0, shipping_fee: Number(s.shipping_fee) || 0 };
}

/** POS-local copy of store settings (tax rate, receipt header/footer). */
export function useStoreSettings() {
  return useQuery({ queryKey: posKeys.settings, queryFn: fetchStoreSettings, staleTime: 5 * 60_000 });
}

export function useWalletPrefixes() {
  return useQuery<WalletPrefixRow[]>({ queryKey: posKeys.prefixes, queryFn: fetchWalletPrefixes, staleTime: 10 * 60_000 });
}

/** Strips characters that would break a PostgREST `or=(…)` filter. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\"']/g, " ").trim();
}

export type PosCustomer = Pick<Customer, "id" | "full_name" | "phone" | "address">;

/** Customer search by name or phone (any format). Empty query → most recent customers. */
export function usePosCustomers(query: string, enabled = true) {
  const q = sanitizeSearch(query);
  return useQuery({
    queryKey: posKeys.customers(q),
    enabled,
    queryFn: async (): Promise<PosCustomer[]> => {
      let req = supabase.from("customers").select("id,full_name,phone,address").limit(20);
      if (q) {
        const digits = q.replace(/\D/g, "");
        const ors = [`full_name.ilike.%${q}%`];
        if (digits.length >= 3) {
          const n = normalizeSomaliPhone(digits);
          const needle = n ? localPart(n) : digits.replace(/^(00)?252/, "").replace(/^0/, "");
          ors.push(`phone.ilike.%${needle}%`);
        }
        req = req.or(ors.join(","));
        req = req.order("full_name");
      } else {
        req = req.order("created_at", { ascending: false });
      }
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export interface NewCustomerInput {
  full_name: string;
  phone: string;    // already normalized 252…
  address?: string | null;
}

export class DuplicateCustomerError extends Error {
  constructor(public existing: PosCustomer) {
    super("DUPLICATE_CUSTOMER");
  }
}

export function useCreatePosCustomer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: NewCustomerInput): Promise<PosCustomer> => {
      const { data: existing } = await supabase
        .from("customers")
        .select("id,full_name,phone,address")
        .eq("phone", input.phone)
        .limit(1)
        .maybeSingle();
      if (existing) throw new DuplicateCustomerError(existing as PosCustomer);
      const { data, error } = await supabase
        .from("customers")
        .insert({
          full_name: input.full_name.trim(),
          phone: input.phone,
          address: input.address?.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id,full_name,phone,address")
        .single();
      if (error) throw error;
      return data as PosCustomer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "customers"] }),
  });
}

export type SaleSummary = Pick<
  Order,
  "id" | "order_number" | "status" | "payment_status" | "total" | "currency" | "created_at" | "shipping_name" | "shipping_phone"
> & {
  customer: { full_name: string } | null;
  payments: { wallet: string | null; status: string; amount: number; provider: string }[];
};

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** POS orders created by the signed-in cashier since local midnight. */
export function useMySalesToday(enabled = true) {
  const { user } = useAuth();
  const since = startOfToday();
  return useQuery({
    queryKey: posKeys.salesToday(user?.id, since.toDateString()),
    enabled: enabled && Boolean(user?.id),
    queryFn: async (): Promise<SaleSummary[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,order_number,status,payment_status,total,currency,created_at,shipping_name,shipping_phone," +
            "customer:customers(full_name),payments(wallet,status,amount,provider)",
        )
        .eq("created_by", user!.id)
        .eq("channel", "pos")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as SaleSummary[]).map((o) => ({ ...o, total: Number(o.total) }));
    },
    refetchInterval: 60_000,
  });
}

/** Full order (items, payments, customer) for receipts. */
export async function fetchOrderForReceipt(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customer:customers(id,full_name,phone), items:order_items(*), payments(*)")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data as Order;
}

export function useReceiptOrder(orderId: string | null | undefined) {
  return useQuery({
    queryKey: posKeys.order(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: () => fetchOrderForReceipt(orderId!),
  });
}
