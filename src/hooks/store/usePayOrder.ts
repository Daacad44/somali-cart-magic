import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PayResponse } from "@/integrations/supabase/types";
import { payOrder } from "@/lib/payments";
import { useI18n } from "@/lib/i18n";
import { storeKeys } from "./useCatalog";

const KNOWN_CODES = [
  "WALLET_NOT_DETECTED", "INVALID_PHONE", "ORDER_NOT_PAYABLE", "FORBIDDEN", "DECLINED",
  "TIMEOUT", "GATEWAY_ERROR", "NOT_CONFIGURED", "NETWORK",
];

/** i18n key for a failed PayResponse code (falls back to the server message). */
export function payErrorKey(code: string | undefined): string | null {
  return code && KNOWN_CODES.includes(code) ? `store.pay.err.${code}` : null;
}

/** Runs a WaafiPay purchase for an existing order and tracks the waiting state. */
export function usePayOrder() {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<PayResponse | null>(null);
  const inFlight = useRef(false);

  const pay = useCallback(
    async (orderId: string, phone: string): Promise<PayResponse> => {
      if (inFlight.current) return { ok: false, status: "pending", message: "", code: "IN_FLIGHT" };
      inFlight.current = true;
      setPaying(true);
      setResult(null);
      setStartedAt(Date.now());
      try {
        const res = await payOrder({ action: "purchase", order_id: orderId, phone });
        setResult(res);
        return res;
      } finally {
        inFlight.current = false;
        setPaying(false);
        setStartedAt(null);
        void qc.invalidateQueries({ queryKey: storeKeys.myOrder(orderId) });
        void qc.invalidateQueries({ queryKey: ["store", "my-orders"] });
      }
    },
    [qc],
  );

  return { pay, paying, startedAt, result, reset: () => setResult(null) };
}

/** Translates a failed PayResponse into a user-facing message. */
export function usePayErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (res: Pick<PayResponse, "code" | "message"> | null | undefined) => {
      if (!res) return "";
      const key = payErrorKey(res.code);
      return key ? t(key) : res.message || t("common.error");
    },
    [t],
  );
}
