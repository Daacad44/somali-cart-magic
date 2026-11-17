// Pure, framework-free cart helpers (unit-tested in src/test/store/cart.test.ts).
import type { Product, StoreSettings, VariantOption } from "@/integrations/supabase/types";

export const CART_STORAGE_KEY = "botan.cart";
export const CART_STORAGE_VERSION = 2;
export const MAX_LINE_QUANTITY = 99;

/** The subset of a product we keep in the cart (snapshot, revalidated against the DB). */
export type CartProduct = Pick<
  Product,
  | "id"
  | "name"
  | "name_so"
  | "slug"
  | "price"
  | "compare_at_price"
  | "stock"
  | "images"
  | "variant_options"
  | "sku"
  | "is_active"
> & { category?: Product["category"] };

export type CartVariants = Record<string, string>;

export interface CartLine {
  key: string;
  product: CartProduct;
  quantity: number;
  variants: CartVariants;
}

export interface CartChange {
  kind: "removed" | "price" | "stock" | "out_of_stock";
  name: string;
  name_so: string | null;
  from?: number;
  to?: number;
}

export function toCartProduct(p: Product | CartProduct): CartProduct {
  return {
    id: p.id,
    name: p.name,
    name_so: p.name_so ?? null,
    slug: p.slug,
    price: Number(p.price),
    compare_at_price: p.compare_at_price == null ? null : Number(p.compare_at_price),
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    images: Array.isArray(p.images) ? p.images.filter((x) => typeof x === "string") : [],
    variant_options: Array.isArray(p.variant_options) ? p.variant_options : [],
    sku: p.sku ?? null,
    is_active: p.is_active !== false,
    category: p.category ?? null,
  };
}

/** Drops empty values and sorts keys so {Size:M, Color:Navy} === {Color:Navy, Size:M}. */
export function normalizeVariants(variants: CartVariants | null | undefined): CartVariants {
  const out: CartVariants = {};
  if (!variants || typeof variants !== "object") return out;
  for (const k of Object.keys(variants).sort()) {
    const v = variants[k];
    if (typeof v === "string" && v.trim() !== "" && k.trim() !== "") out[k] = v;
  }
  return out;
}

/** Line identity: product id + sorted variant pairs (so different sizes don't merge). */
export function lineKey(productId: string, variants?: CartVariants | null): string {
  const v = normalizeVariants(variants);
  const parts = Object.keys(v).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(v[k])}`);
  return parts.length ? `${productId}::${parts.join("&")}` : productId;
}

/** Clamps to [1, min(stock, MAX)]; returns 0 when nothing can be bought. */
export function clampQuantity(requested: number, stock: number): number {
  const max = Math.min(Math.max(0, Math.floor(stock || 0)), MAX_LINE_QUANTITY);
  if (max <= 0) return 0;
  const q = Math.floor(Number.isFinite(requested) ? requested : 1);
  return Math.min(Math.max(1, q), max);
}

/** Variant types the product requires that are missing from the selection. */
export function missingVariants(options: VariantOption[] | null | undefined, selected: CartVariants): string[] {
  return (options ?? [])
    .filter((o) => Array.isArray(o.options) && o.options.length > 0)
    .filter((o) => !selected[o.type] || !o.options.includes(selected[o.type]))
    .map((o) => o.type);
}

/** Total quantity of a product across all its variant lines. */
export function productQuantityInCart(items: CartLine[], productId: string, exceptKey?: string): number {
  return items
    .filter((i) => i.product.id === productId && i.key !== exceptKey)
    .reduce((s, i) => s + i.quantity, 0);
}

export interface AddResult {
  items: CartLine[];
  added: number;
  clamped: boolean;
}

/**
 * Adds `qty` of a product/variant combination. Stock is shared across
 * variant lines of the same product, so the clamp accounts for other lines.
 */
export function addLine(items: CartLine[], product: Product | CartProduct, qty: number, variants?: CartVariants): AddResult {
  const snap = toCartProduct(product);
  const v = normalizeVariants(variants);
  const key = lineKey(snap.id, v);
  const existing = items.find((i) => i.key === key);
  const others = productQuantityInCart(items, snap.id, key);
  const available = Math.max(0, snap.stock - others);
  const wanted = (existing?.quantity ?? 0) + Math.max(1, Math.floor(qty || 1));
  const next = clampQuantity(wanted, available);
  const added = Math.max(0, next - (existing?.quantity ?? 0));
  const clamped = next < wanted;
  if (next <= 0) return { items, added: 0, clamped: true };
  const line: CartLine = { key, product: snap, quantity: next, variants: v };
  const out = existing ? items.map((i) => (i.key === key ? line : i)) : [...items, line];
  return { items: out, added, clamped };
}

export function setLineQuantity(items: CartLine[], key: string, qty: number): CartLine[] {
  const line = items.find((i) => i.key === key);
  if (!line) return items;
  if (qty <= 0) return items.filter((i) => i.key !== key);
  const available = Math.max(0, line.product.stock - productQuantityInCart(items, line.product.id, key));
  const next = clampQuantity(qty, available);
  if (next <= 0) return items.filter((i) => i.key !== key);
  return items.map((i) => (i.key === key ? { ...i, quantity: next } : i));
}

export function removeLine(items: CartLine[], key: string): CartLine[] {
  return items.filter((i) => i.key !== key);
}

export function cartSubtotal(items: CartLine[]): number {
  return round2(items.reduce((s, i) => s + i.product.price * i.quantity, 0));
}

export function cartCount(items: CartLine[]): number {
  return items.reduce((s, i) => s + i.quantity, 0);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseProduct(x: unknown): CartProduct | null {
  if (!isRecord(x)) return null;
  const { id, name, slug, price, stock } = x;
  if (typeof id !== "string" || !id) return null;
  if (typeof name !== "string" || typeof slug !== "string") return null;
  const priceN = Number(price);
  const stockN = Number(stock);
  if (!Number.isFinite(priceN) || priceN < 0 || !Number.isFinite(stockN)) return null;
  const variant_options = Array.isArray(x.variant_options)
    ? (x.variant_options as unknown[]).filter(
        (o): o is VariantOption =>
          isRecord(o) && typeof o.type === "string" && Array.isArray(o.options) && o.options.every((s) => typeof s === "string"),
      )
    : [];
  return toCartProduct({
    id,
    name,
    slug,
    name_so: typeof x.name_so === "string" ? x.name_so : null,
    price: priceN,
    compare_at_price: x.compare_at_price == null || !Number.isFinite(Number(x.compare_at_price)) ? null : Number(x.compare_at_price),
    stock: stockN,
    images: Array.isArray(x.images) ? (x.images as unknown[]).filter((s): s is string => typeof s === "string") : [],
    variant_options,
    sku: typeof x.sku === "string" ? x.sku : null,
    is_active: x.is_active !== false,
    category: isRecord(x.category) ? (x.category as CartProduct["category"]) : null,
  });
}

/** Parses + validates the stored cart. Anything invalid is dropped; never throws. */
export function parseStoredCart(raw: string | null | undefined): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(data) || data.version !== CART_STORAGE_VERSION || !Array.isArray(data.items)) return [];
  let items: CartLine[] = [];
  for (const entry of data.items) {
    if (!isRecord(entry)) continue;
    const product = parseProduct(entry.product);
    if (!product) continue;
    const variants = isRecord(entry.variants) ? normalizeVariants(entry.variants as CartVariants) : {};
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    // Re-add through addLine so keys are recomputed, duplicates merged and stock clamped.
    items = addLine(items, product, qty, variants).items;
  }
  return items;
}

export function serializeCart(items: CartLine[]): string {
  return JSON.stringify({
    version: CART_STORAGE_VERSION,
    items: items.map((i) => ({ product: i.product, quantity: i.quantity, variants: i.variants })),
  });
}

// ---------------------------------------------------------------------------
// Revalidation against fresh DB rows
// ---------------------------------------------------------------------------

export function reconcileCart(
  items: CartLine[],
  fresh: Array<Product | CartProduct>,
): { items: CartLine[]; changes: CartChange[] } {
  const byId = new Map(fresh.map((p) => [p.id, toCartProduct(p)]));
  const changes: CartChange[] = [];
  let out: CartLine[] = [];
  for (const line of items) {
    const p = byId.get(line.product.id);
    if (!p || !p.is_active) {
      changes.push({ kind: "removed", name: line.product.name, name_so: line.product.name_so });
      continue;
    }
    if (p.stock <= 0) {
      changes.push({ kind: "out_of_stock", name: p.name, name_so: p.name_so });
      continue;
    }
    if (round2(p.price) !== round2(line.product.price)) {
      changes.push({ kind: "price", name: p.name, name_so: p.name_so, from: line.product.price, to: p.price });
    }
    const before = cartCount(out.filter((l) => l.product.id === p.id)) + line.quantity;
    const res = addLine(out, p, line.quantity, line.variants);
    out = res.items;
    const after = cartCount(out.filter((l) => l.product.id === p.id));
    if (after < before) {
      changes.push({ kind: "stock", name: p.name, name_so: p.name_so, from: line.quantity, to: res.added });
    }
  }
  return { items: out, changes };
}

// ---------------------------------------------------------------------------
// Totals preview (server is authoritative — mirrors create_order)
// ---------------------------------------------------------------------------

export interface TotalsPreview {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  freeShippingRemaining: number | null;
}

export function previewTotals(
  subtotal: number,
  settings: Pick<StoreSettings, "shipping_fee" | "free_shipping_over" | "tax_rate"> | null | undefined,
): TotalsPreview {
  const fee = Number(settings?.shipping_fee ?? 0);
  const freeOver = settings?.free_shipping_over == null ? null : Number(settings.free_shipping_over);
  const rate = Number(settings?.tax_rate ?? 0);
  const sub = round2(subtotal);
  const shipping = sub <= 0 ? 0 : freeOver != null && sub >= freeOver ? 0 : round2(fee);
  const tax = round2(sub * rate);
  return {
    subtotal: sub,
    shipping,
    tax,
    total: round2(sub + shipping + tax),
    freeShippingRemaining: freeOver != null && sub < freeOver ? round2(freeOver - sub) : null,
  };
}
