// Pure, framework-free POS ticket logic. Everything here is unit-tested in
// src/test/pos/ticket.test.ts — keep it free of React / Supabase imports.
import type { Order, Product, VariantOption } from "@/integrations/supabase/types";
import type { Wallet } from "@/lib/wallet";

/* ------------------------------------------------------------------ */
/* Lines                                                               */
/* ------------------------------------------------------------------ */

export type Variants = Record<string, string>;

export interface TicketLine {
  key: string;
  productId: string;
  name: string;
  nameSo: string | null;
  sku: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
  /** Product-level stock at the time the line was added. */
  stock: number;
  variants: Variants;
}

export type TicketProduct = Pick<Product, "id" | "name" | "name_so" | "sku" | "price" | "stock" | "images" | "variant_options">;

/** Stable key for a product + variant combination (variant order does not matter). */
export function lineKey(productId: string, variants: Variants = {}): string {
  const parts = Object.keys(variants)
    .filter((k) => variants[k] !== undefined && variants[k] !== "")
    .sort()
    .map((k) => `${k}=${variants[k]}`);
  return parts.length ? `${productId}|${parts.join("|")}` : productId;
}

/** Quantity of a product already on the ticket (all variant lines), optionally excluding one line. */
export function productQtyOnTicket(lines: TicketLine[], productId: string, excludeKey?: string): number {
  return lines
    .filter((l) => l.productId === productId && l.key !== excludeKey)
    .reduce((s, l) => s + l.quantity, 0);
}

/** How many more units of this product can still be added. Stock is tracked per product. */
export function remainingStock(lines: TicketLine[], product: Pick<Product, "id" | "stock">): number {
  return Math.max(0, product.stock - productQtyOnTicket(lines, product.id));
}

/** Variant types that are required but not chosen. */
export function missingVariants(options: VariantOption[] | null | undefined, chosen: Variants): string[] {
  return (options ?? [])
    .filter((o) => o.options && o.options.length > 0)
    .filter((o) => !chosen[o.type] || !o.options.includes(chosen[o.type]))
    .map((o) => o.type);
}

export function hasVariants(p: Pick<Product, "variant_options">): boolean {
  return (p.variant_options ?? []).some((o) => o.options && o.options.length > 0);
}

export interface AddResult {
  lines: TicketLine[];
  /** Units actually added (0 if out of stock). */
  added: number;
}

/** Adds qty units, merging with an existing identical line and clamping to stock. */
export function addLine(lines: TicketLine[], product: TicketProduct, variants: Variants = {}, qty = 1): AddResult {
  const allowed = Math.min(Math.max(0, Math.floor(qty)), remainingStock(lines, product));
  if (allowed <= 0) return { lines, added: 0 };
  const key = lineKey(product.id, variants);
  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return {
      lines: lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + allowed, stock: product.stock } : l)),
      added: allowed,
    };
  }
  const line: TicketLine = {
    key,
    productId: product.id,
    name: product.name,
    nameSo: product.name_so,
    sku: product.sku,
    image: product.images?.[0] ?? null,
    unitPrice: Number(product.price),
    quantity: allowed,
    stock: product.stock,
    variants: { ...variants },
  };
  return { lines: [...lines, line], added: allowed };
}

/** Max quantity a line can have given the other lines of the same product. */
export function maxQtyForLine(lines: TicketLine[], key: string): number {
  const line = lines.find((l) => l.key === key);
  if (!line) return 0;
  return Math.max(0, line.stock - productQtyOnTicket(lines, line.productId, key));
}

/** Sets a line quantity clamped to [1, available stock]. qty <= 0 removes the line. */
export function setLineQty(lines: TicketLine[], key: string, qty: number): TicketLine[] {
  if (!Number.isFinite(qty)) return lines;
  if (qty <= 0) return removeLine(lines, key);
  const max = maxQtyForLine(lines, key);
  if (max <= 0) return removeLine(lines, key);
  const q = Math.min(Math.floor(qty), max);
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, q) } : l));
}

export function removeLine(lines: TicketLine[], key: string): TicketLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Payload for rpc create_order p_items. */
export function toRpcItems(lines: TicketLine[]): { product_id: string; quantity: number; variants: Variants }[] {
  return lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, variants: l.variants }));
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** Integer cents, removing binary float noise first (e.g. 1.005 → 100.49999… → 101). */
export function toCents(n: number): number {
  const x = Number(n) || 0;
  const scaled = Math.round(x * 100 * 1e6) / 1e6;
  return roundHalfAwayFromZero(scaled);
}

function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** Mirrors Postgres round(numeric, 2) (half away from zero). */
export function round2(n: number): number {
  return toCents(n) / 100;
}

export interface Totals {
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

/**
 * Same arithmetic as create_order for channel 'pos' (no shipping):
 *   line = round(price*qty, 2); subtotal = Σ line
 *   discount = least(greatest(discount,0), subtotal)
 *   tax = round((subtotal - discount) * tax_rate, 2)
 *   total = subtotal - discount + tax
 */
export function computeTotals(lines: TicketLine[], discount: number, taxRate: number): Totals {
  const subCents = lines.reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  const discCents = Math.min(Math.max(0, toCents(Number(discount) || 0)), subCents);
  const taxable = subCents - discCents;
  const rawTax = Math.round(taxable * (Number(taxRate) || 0) * 1e6) / 1e6;
  const taxCents = roundHalfAwayFromZero(rawTax);
  return {
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: subCents / 100,
    discount: discCents / 100,
    tax: taxCents / 100,
    total: (subCents - discCents + taxCents) / 100,
  };
}

/** Parses a user-typed discount and clamps it to [0, subtotal]. */
export function clampDiscount(input: string | number, subtotal: number): number {
  const n = typeof input === "number" ? input : parseFloat(String(input).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(round2(n), round2(subtotal));
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type PayMethod = "wallet" | "cash";

export type SaleError = "EMPTY_TICKET" | "INVALID_PHONE" | "WALLET_NOT_DETECTED" | "INVALID_QUANTITY";

export interface SaleInput {
  lines: TicketLine[];
  method: PayMethod;
  /** Normalized phone (252…) or null if the typed number is invalid. */
  normalizedPhone: string | null;
  detectedWallet: Wallet | null;
  overrideWallet: Wallet | null;
}

export function validateSale(input: SaleInput): SaleError[] {
  const errors: SaleError[] = [];
  if (input.lines.length === 0) errors.push("EMPTY_TICKET");
  if (input.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > l.stock)) {
    errors.push("INVALID_QUANTITY");
  }
  if (input.method === "wallet") {
    if (!input.normalizedPhone) errors.push("INVALID_PHONE");
    else if (!input.detectedWallet && !input.overrideWallet) errors.push("WALLET_NOT_DETECTED");
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Payment state machine                                               */
/* ------------------------------------------------------------------ */

export type PayPhase = "idle" | "creating" | "awaiting_payment" | "approved" | "failed" | "cancelling";

export interface PayAttempt {
  method: PayMethod;
  phone: string | null;
  wallet: Wallet | "CASH" | null;
  startedAt: number;
}

export interface PayError {
  code: string;
  message: string;
}

export interface PayState {
  phase: PayPhase;
  /** Order created for the current ticket (kept across failed attempts — never recreated). */
  order: Order | null;
  attempt: PayAttempt | null;
  error: PayError | null;
  /** Whether the current submission should print on approval. */
  print: boolean;
  attempts: number;
}

export const initialPayState: PayState = {
  phase: "idle",
  order: null,
  attempt: null,
  error: null,
  print: false,
  attempts: 0,
};

export type PayAction =
  | { type: "CREATE_START"; print: boolean }
  | { type: "CREATE_SUCCESS"; order: Order }
  | { type: "CREATE_FAIL"; error: PayError }
  | { type: "PAY_START"; attempt: PayAttempt; print?: boolean }
  | { type: "PAY_APPROVED"; order?: Order }
  | { type: "PAY_FAILED"; error: PayError }
  | { type: "CANCEL_START" }
  | { type: "CANCEL_DONE" }
  | { type: "CANCEL_FAIL"; error: PayError }
  | { type: "RESET" };

export function isBusy(s: PayState): boolean {
  return s.phase === "creating" || s.phase === "awaiting_payment" || s.phase === "cancelling";
}

/** The ticket can't be edited once an order exists (its items are fixed server-side). */
export function isTicketLocked(s: PayState): boolean {
  return s.order !== null || isBusy(s);
}

export function payReducer(state: PayState, action: PayAction): PayState {
  switch (action.type) {
    case "CREATE_START":
      if (isBusy(state) || state.order) return state;
      return { ...state, phase: "creating", error: null, print: action.print };
    case "CREATE_SUCCESS":
      if (state.phase !== "creating") return state;
      return { ...state, order: action.order };
    case "CREATE_FAIL":
      if (state.phase !== "creating") return state;
      return { ...state, phase: "idle", order: null, error: action.error };
    case "PAY_START": {
      const fromCreating = state.phase === "creating" && state.order !== null;
      const retry = (state.phase === "failed" || state.phase === "idle") && state.order !== null;
      if (!fromCreating && !retry) return state;
      return {
        ...state,
        phase: "awaiting_payment",
        attempt: action.attempt,
        error: null,
        print: action.print ?? state.print,
        attempts: state.attempts + 1,
      };
    }
    case "PAY_APPROVED":
      if (state.phase !== "awaiting_payment" && state.phase !== "failed") return state;
      return { ...state, phase: "approved", order: action.order ?? state.order, error: null };
    case "PAY_FAILED":
      if (state.phase !== "awaiting_payment") return state;
      return { ...state, phase: "failed", error: action.error };
    case "CANCEL_START":
      if (isBusy(state)) return state;
      return { ...state, phase: "cancelling", error: null };
    case "CANCEL_DONE":
      if (state.phase !== "cancelling") return state;
      return { ...initialPayState };
    case "CANCEL_FAIL":
      if (state.phase !== "cancelling") return state;
      return { ...state, phase: state.order ? "failed" : "idle", error: action.error };
    case "RESET":
      return { ...initialPayState };
    default:
      return state;
  }
}
