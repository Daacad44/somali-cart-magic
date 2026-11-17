import type { Wallet } from "@/lib/wallet";

/** Display info for the mobile wallets WaafiPay supports. */
export const STORE_WALLETS: { id: Wallet; provider?: string; tone: string }[] = [
  { id: "EVC_PLUS", provider: "Hormuud", tone: "bg-secondary text-secondary-foreground" },
  { id: "ZAAD", provider: "Telesom", tone: "bg-primary text-primary-foreground" },
  { id: "SAHAL", provider: "Golis", tone: "bg-success text-success-foreground" },
  { id: "WAAFI", provider: "WaafiPay", tone: "bg-accent text-accent-foreground" },
  { id: "EDAHAB", provider: "Somtel", tone: "bg-warning text-warning-foreground" },
  { id: "JEEB", tone: "bg-navy-light text-primary-foreground" },
];
