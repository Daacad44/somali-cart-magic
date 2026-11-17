// Pure helpers for building storefront queries (tested in src/test/store).

export const PRODUCT_SELECT = "*, category:categories(id,name,name_so,slug)";
export const PAGE_SIZE = 12;

export type ProductSort = "latest" | "price-asc" | "price-desc" | "popular" | "rating";
export const PRODUCT_SORTS: ProductSort[] = ["latest", "popular", "rating", "price-asc", "price-desc"];

export function parseSort(v: string | null | undefined): ProductSort {
  return (PRODUCT_SORTS as string[]).includes(v ?? "") ? (v as ProductSort) : "latest";
}

/**
 * Makes user input safe to embed inside a PostgREST `or=(...)` filter with ilike:
 * strips characters with special meaning (% _ , ( ) * " \ { } :), collapses spaces
 * and caps the length.
 */
export function sanitizeSearch(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/[%_,()*"\\{}:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

/** Builds the `or` filter for a sanitized term (name / name_so ilike, exact tag match). */
export function searchOrFilter(term: string): string | null {
  const s = sanitizeSearch(term);
  if (!s) return null;
  const parts = [`name.ilike.%${s}%`, `name_so.ilike.%${s}%`];
  const tag = s.toLowerCase();
  if (/^[\p{L}\p{N}-]+$/u.test(tag)) parts.push(`tags.cs.{${tag}}`);
  return parts.join(",");
}

/** Accepts only same-origin relative paths for ?next= redirects. */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function isFlashSaleActive(endsAt: string | null | undefined, now = Date.now()): boolean {
  if (!endsAt) return false;
  const t = Date.parse(endsAt);
  return Number.isFinite(t) && t > now;
}

export function discountPercent(price: number, compareAt: number | null | undefined): number {
  const c = Number(compareAt ?? 0);
  const p = Number(price);
  if (!c || c <= p) return 0;
  return Math.round(((c - p) / c) * 100);
}

export function productImage(images: string[] | null | undefined, index = 0): string {
  return images?.[index] || images?.[0] || "/placeholder.svg";
}
