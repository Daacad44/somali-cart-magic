// Pure, dependency-free wallet helpers shared by the web app (Vite) and
// the Supabase Edge Functions (Deno). Keep this file free of imports.

export type Wallet = "EVC_PLUS" | "ZAAD" | "SAHAL" | "WAAFI" | "JEEB" | "EDAHAB";

export interface WalletPrefix {
  prefix: string;
  wallet: Wallet;
  provider_name: string;
  is_active: boolean;
}

export const WALLET_LABELS: Record<Wallet | "CASH", string> = {
  EVC_PLUS: "EVC Plus",
  ZAAD: "ZAAD",
  SAHAL: "SAHAL",
  WAAFI: "WAAFI",
  JEEB: "Jeeb",
  EDAHAB: "eDahab",
  CASH: "Cash",
};

/**
 * Normalises a Somali mobile number to WaafiPay's format: 252XXXXXXXXX
 * (country code, no "+", no leading zero). Returns null if invalid.
 * Accepts: "+252 61 234 5678", "00252612345678", "0612345678", "612345678".
 */
export function normalizeSomaliPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("252")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Somali mobile subscriber numbers are 9 digits (e.g. 61 234 5678)
  if (!/^[1-9]\d{8}$/.test(digits)) return null;
  return "252" + digits;
}

/** Local part after 252 (e.g. "612345678"). */
export function localPart(normalized: string): string {
  return normalized.startsWith("252") ? normalized.slice(3) : normalized;
}

/**
 * Detects the wallet from the number using the admin-managed prefix table.
 * Longest matching prefix wins. Returns null when no active prefix matches.
 */
export function detectWallet(
  phone: string | null | undefined,
  prefixes: WalletPrefix[],
): WalletPrefix | null {
  const n = normalizeSomaliPhone(phone);
  if (!n) return null;
  const local = localPart(n);
  const match = prefixes
    .filter((p) => p.is_active && local.startsWith(p.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ?? null;
}

/** "252612345678" -> "+252 61 234 5678" */
export function formatSomaliPhone(normalized: string | null | undefined): string {
  const n = normalizeSomaliPhone(normalized ?? "");
  if (!n) return normalized ?? "";
  const l = localPart(n);
  return `+252 ${l.slice(0, 2)} ${l.slice(2, 5)} ${l.slice(5)}`;
}

/** Masks a number for display/logs: 252612345678 -> 25261****678 */
export function maskPhone(normalized: string): string {
  if (normalized.length < 8) return normalized;
  return normalized.slice(0, 5) + "****" + normalized.slice(-3);
}
