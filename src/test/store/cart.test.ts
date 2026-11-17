import { describe, it, expect } from "vitest";
import type { Product } from "@/integrations/supabase/types";
import {
  CART_STORAGE_VERSION,
  addLine,
  cartCount,
  cartSubtotal,
  clampQuantity,
  lineKey,
  missingVariants,
  normalizeVariants,
  parseStoredCart,
  previewTotals,
  reconcileCart,
  removeLine,
  serializeCart,
  setLineQuantity,
  type CartLine,
} from "@/lib/cart-utils";
import { safeNext, sanitizeSearch, searchOrFilter, isFlashSaleActive, discountPercent } from "@/hooks/store/query-utils";

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Shirt",
    name_so: "Shaati",
    slug: "shirt",
    description: null,
    description_so: null,
    category_id: null,
    price: 10,
    compare_at_price: null,
    sku: "SH-1",
    stock: 5,
    low_stock_threshold: 2,
    images: ["/products/shirt.jpg"],
    variant_options: [{ type: "Size", options: ["S", "M"] }],
    tags: [],
    is_active: true,
    is_featured: false,
    flash_sale_ends_at: null,
    rating: 4,
    review_count: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("line identity", () => {
  it("is independent of variant key order and ignores empty values", () => {
    expect(lineKey("p1", { Size: "M", Color: "Navy" })).toBe(lineKey("p1", { Color: "Navy", Size: "M" }));
    expect(lineKey("p1", { Size: "" })).toBe("p1");
    expect(normalizeVariants({ b: "2", a: "1", c: "" })).toEqual({ a: "1", b: "2" });
  });

  it("keeps different variants of the same product as separate lines", () => {
    let items: CartLine[] = [];
    items = addLine(items, product(), 1, { Size: "S" }).items;
    items = addLine(items, product(), 1, { Size: "M" }).items;
    items = addLine(items, product(), 1, { Size: "S" }).items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.variants.Size === "S")?.quantity).toBe(2);
    expect(cartCount(items)).toBe(3);
  });

  it("detects missing required variants", () => {
    expect(missingVariants(product().variant_options, {})).toEqual(["Size"]);
    expect(missingVariants(product().variant_options, { Size: "XL" })).toEqual(["Size"]);
    expect(missingVariants(product().variant_options, { Size: "M" })).toEqual([]);
  });
});

describe("quantity clamping", () => {
  it("clamps to stock and floors at 1", () => {
    expect(clampQuantity(10, 5)).toBe(5);
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(-3, 5)).toBe(1);
    expect(clampQuantity(3, 0)).toBe(0);
    expect(clampQuantity(2.7, 5)).toBe(2);
  });

  it("shares stock across variant lines of one product", () => {
    let res = addLine([], product({ stock: 3 }), 2, { Size: "S" });
    res = addLine(res.items, product({ stock: 3 }), 5, { Size: "M" });
    expect(res.added).toBe(1);
    expect(res.clamped).toBe(true);
    expect(cartCount(res.items)).toBe(3);
    // Nothing left to add
    const none = addLine(res.items, product({ stock: 3 }), 1, { Size: "M" });
    expect(none.added).toBe(0);
    expect(none.items).toEqual(res.items);
  });

  it("does not add out-of-stock products", () => {
    const res = addLine([], product({ stock: 0 }), 1);
    expect(res.items).toHaveLength(0);
    expect(res.added).toBe(0);
  });

  it("updates and removes lines", () => {
    let items = addLine([], product(), 1, { Size: "S" }).items;
    const key = items[0].key;
    items = setLineQuantity(items, key, 99);
    expect(items[0].quantity).toBe(5);
    items = setLineQuantity(items, key, 0);
    expect(items).toHaveLength(0);
    items = addLine([], product(), 2).items;
    expect(removeLine(items, items[0].key)).toHaveLength(0);
  });

  it("computes the subtotal with cent rounding", () => {
    const items = addLine([], product({ price: 0.1, stock: 10 }), 3).items;
    expect(cartSubtotal(items)).toBe(0.3);
  });
});

describe("persistence", () => {
  it("round-trips through serialize/parse", () => {
    const items = addLine([], product(), 2, { Size: "M" }).items;
    const parsed = parseStoredCart(serializeCart(items));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe(items[0].key);
    expect(parsed[0].quantity).toBe(2);
    expect(parsed[0].product.price).toBe(10);
  });

  it("returns [] for garbage, wrong versions or wrong shapes", () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart("not json")).toEqual([]);
    expect(parseStoredCart(JSON.stringify([{ product: {}, quantity: 1 }]))).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ version: CART_STORAGE_VERSION - 1, items: [] }))).toEqual([]);
  });

  it("drops invalid entries, merges duplicates and clamps", () => {
    const good = { id: "p1", name: "Shirt", slug: "shirt", price: 10, stock: 3, variant_options: [] };
    const raw = JSON.stringify({
      version: CART_STORAGE_VERSION,
      items: [
        { product: good, quantity: 2, variants: { Size: "M" } },
        { product: good, quantity: 2, variants: { Size: "M" } },
        { product: { ...good, price: "abc" }, quantity: 1 },
        { product: { name: "no id" }, quantity: 1 },
        { product: good, quantity: -1 },
        "junk",
      ],
    });
    const parsed = parseStoredCart(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].quantity).toBe(3);
  });
});

describe("revalidation", () => {
  it("reports price changes, stock reductions and removals", () => {
    let items = addLine([], product({ id: "a", stock: 10 }), 4).items;
    items = addLine(items, product({ id: "b", name: "Gone" }), 1).items;
    items = addLine(items, product({ id: "c", name: "Empty" }), 1).items;
    const fresh = [product({ id: "a", price: 12, stock: 2 }), product({ id: "c", stock: 0 })];
    const { items: next, changes } = reconcileCart(items, fresh);
    expect(next).toHaveLength(1);
    expect(next[0].product.price).toBe(12);
    expect(next[0].quantity).toBe(2);
    expect(changes.map((c) => c.kind).sort()).toEqual(["out_of_stock", "price", "removed", "stock"]);
  });

  it("reports nothing when the cart is current", () => {
    const items = addLine([], product(), 1, { Size: "S" }).items;
    expect(reconcileCart(items, [product()]).changes).toEqual([]);
  });
});

describe("totals preview", () => {
  const settings = { shipping_fee: 5.99, free_shipping_over: 100, tax_rate: 0.05 };
  it("adds shipping and tax", () => {
    expect(previewTotals(50, settings)).toMatchObject({ subtotal: 50, shipping: 5.99, tax: 2.5, total: 58.49, freeShippingRemaining: 50 });
  });
  it("applies free shipping over the threshold", () => {
    expect(previewTotals(100, settings)).toMatchObject({ shipping: 0, tax: 5, total: 105, freeShippingRemaining: null });
  });
  it("is zero for an empty cart", () => {
    expect(previewTotals(0, settings).total).toBe(0);
  });
});

describe("query helpers", () => {
  it("sanitizes search terms for PostgREST filters", () => {
    expect(sanitizeSearch("  50% off, (now)  ")).toBe("50 off now");
    expect(sanitizeSearch('a"b\\c{d}*e')).toBe("a b c d e");
    expect(sanitizeSearch("x".repeat(100))).toHaveLength(64);
    expect(searchOrFilter("%,")).toBeNull();
    expect(searchOrFilter("Audio")).toBe("name.ilike.%Audio%,name_so.ilike.%Audio%,tags.cs.{audio}");
    expect(searchOrFilter("two words")).toBe("name.ilike.%two words%,name_so.ilike.%two words%");
  });

  it("only allows same-origin next redirects", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("//evil.com")).toBe("/account");
    expect(safeNext("https://evil.com")).toBe("/account");
    expect(safeNext(null, "/")).toBe("/");
  });

  it("checks flash sale end and discounts", () => {
    expect(isFlashSaleActive(null)).toBe(false);
    expect(isFlashSaleActive("2000-01-01T00:00:00Z")).toBe(false);
    expect(isFlashSaleActive(new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(discountPercent(75, 100)).toBe(25);
    expect(discountPercent(100, 80)).toBe(0);
  });
});
