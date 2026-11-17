import { useMemo } from "react";
import { detectWallet, normalizeSomaliPhone, type WalletPrefix } from "@/lib/wallet";
import { useWalletPrefixes } from "./useCustomer";

export interface WalletDetection {
  normalized: string | null;
  wallet: WalletPrefix | null;
  /** Prefix table loaded; when false we can't judge detection and let the server decide. */
  prefixesReady: boolean;
  /** True when the number can be sent to the payment gateway. */
  canPay: boolean;
}

export function useWalletDetection(phone: string): WalletDetection {
  const { data: prefixes, isSuccess } = useWalletPrefixes();
  return useMemo(() => {
    const normalized = normalizeSomaliPhone(phone);
    const wallet = normalized && prefixes ? detectWallet(normalized, prefixes) : null;
    const prefixesReady = isSuccess && (prefixes?.length ?? 0) > 0;
    return { normalized, wallet, prefixesReady, canPay: !!normalized && (!prefixesReady || !!wallet) };
  }, [phone, prefixes, isSuccess]);
}

