import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app has Supabase credentials configured. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "public-anon-key-not-configured",
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);

/**
 * Invokes an Edge Function and normalises errors so callers get
 * either the typed JSON body or a thrown Error with a readable message.
 */
export async function invokeFunction<TRes, TBody = unknown>(name: string, body: TBody): Promise<TRes> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message if present.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const payload = await ctx.json();
        if (payload?.message) throw Object.assign(new Error(payload.message), { payload });
      } catch (e) {
        if (e instanceof Error && (e as { payload?: unknown }).payload) throw e;
      }
    }
    throw new Error(error.message || "Request failed");
  }
  return data as TRes;
}

/** Maps Postgres RPC exception codes raised in SQL to friendly messages. */
export function rpcErrorMessage(err: unknown, lang: "so" | "en" = "so"): string {
  const raw = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  const map: Record<string, [string, string]> = {
    AUTH_REQUIRED: ["Fadlan soo gal marka hore.", "Please sign in first."],
    EMPTY_CART: ["Gaadhigu waa madhan yahay.", "Your cart is empty."],
    FORBIDDEN: ["Ogolaansho uma lihid.", "You don't have permission."],
    PRODUCT_NOT_FOUND: ["Alaabta lama helin.", "Product not found."],
    INVALID_QUANTITY: ["Tirada waa khalad.", "Invalid quantity."],
    ORDER_ALREADY_PAID: ["Dalabkan horay ayaa loo bixiyay.", "This order is already paid."],
    PAYMENT_IN_PROGRESS: ["Lacag-bixin ayaa socota.", "A payment is in progress."],
    ORDER_NOT_FOUND: ["Dalabka lama helin.", "Order not found."],
  };
  if (raw.startsWith("OUT_OF_STOCK:")) {
    const name = raw.split(":").slice(1).join(":");
    return lang === "so" ? `Kayd kuma filna: ${name}` : `Not enough stock: ${name}`;
  }
  const hit = Object.keys(map).find((k) => raw.includes(k));
  return hit ? map[hit][lang === "so" ? 0 : 1] : raw;
}
