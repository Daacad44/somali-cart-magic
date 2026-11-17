import type { WalletPrefixRow } from "@/integrations/supabase/types";
import { detectWallet, normalizeSomaliPhone, type Wallet } from "@/lib/wallet";

export const WALLETS: Wallet[] = ["EVC_PLUS", "ZAAD", "SAHAL", "WAAFI", "JEEB", "EDAHAB"];

export interface WalletDetection {
  normalized: string | null;
  detected: WalletPrefixRow | null;
  /** Wallet that will be charged: staff override first, then prefix detection. */
  effective: Wallet | null;
}

export function detectFor(phone: string, prefixes: WalletPrefixRow[] | undefined, override: Wallet | null): WalletDetection {
  const normalized = normalizeSomaliPhone(phone);
  const detected = normalized && prefixes ? (detectWallet(normalized, prefixes) as WalletPrefixRow | null) : null;
  return { normalized, detected, effective: override ?? detected?.wallet ?? null };
}
