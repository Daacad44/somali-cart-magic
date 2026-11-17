import type { Payment } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { WALLET_LABELS, formatSomaliPhone, maskPhone } from "@/lib/wallet";
import { StatusBadge } from "./OrderBadges";

const PaymentsList = ({ payments }: { payments: Payment[] }) => {
  const { t, formatMoney, formatDate } = useI18n();
  if (payments.length === 0) return <p className="text-sm text-muted-foreground">{t("store.order.noPayments")}</p>;
  return (
    <ul className="divide-y divide-border">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <div>
            <p className="font-medium">
              {p.wallet ? WALLET_LABELS[p.wallet] : t("common.wallet")}
              {p.account_no && <span className="ml-1.5 font-normal text-muted-foreground">{maskPhone(p.account_no) || formatSomaliPhone(p.account_no)}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(p.created_at, true)}</p>
            {p.status === "failed" && p.response_msg && <p className="mt-0.5 text-xs text-destructive">{p.response_msg}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span>
            <StatusBadge status={p.status} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default PaymentsList;
