import { useState } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Order, PayResponse } from "@/integrations/supabase/types";
import { usePayErrorMessage, usePayOrder } from "@/hooks/store/usePayOrder";
import { useI18n } from "@/lib/i18n";
import { WALLET_LABELS } from "@/lib/wallet";
import PaymentWaiting from "./PaymentWaiting";
import WalletPhoneInput from "./WalletPhoneInput";
import { useWalletDetection } from "@/hooks/store/useWalletDetection";

/** Pay (or retry paying) an existing unpaid order with a mobile wallet. */
const PayOrderPanel = ({
  order,
  initialError,
  onPaid,
}: {
  order: Order;
  initialError?: string | null;
  onPaid?: (res: PayResponse) => void;
}) => {
  const { t, formatMoney } = useI18n();
  const [phone, setPhone] = useState(order.shipping_phone ?? "");
  const detection = useWalletDetection(phone);
  const { pay, paying, startedAt, result } = usePayOrder();
  const errorMessage = usePayErrorMessage();
  const failed = result && !result.ok ? errorMessage(result) : initialError ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detection.canPay || !detection.normalized) return;
    const res = await pay(order.id, detection.normalized);
    if (res.ok) {
      toast.success(t("store.pay.success"));
      onPaid?.(res);
    } else if (res.code !== "IN_FLIGHT") {
      toast.error(errorMessage(res));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {failed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("store.pay.failedTitle")}</AlertTitle>
          <AlertDescription>{failed}</AlertDescription>
        </Alert>
      )}
      <WalletPhoneInput value={phone} onChange={setPhone} detection={detection} disabled={paying} />
      <Button type="submit" size="lg" className="w-full" disabled={paying || !detection.canPay}>
        <Lock className="mr-2 h-4 w-4" />
        {failed ? t("store.pay.retry", { amount: formatMoney(order.total, order.currency) }) : t("store.pay.payNow", { amount: formatMoney(order.total, order.currency) })}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("store.pay.secureNote")}</p>
      <PaymentWaiting
        open={paying}
        startedAt={startedAt}
        walletLabel={detection.wallet ? WALLET_LABELS[detection.wallet.wallet] : null}
        phone={detection.normalized}
        amount={formatMoney(order.total, order.currency)}
      />
    </form>
  );
};

export default PayOrderPanel;
