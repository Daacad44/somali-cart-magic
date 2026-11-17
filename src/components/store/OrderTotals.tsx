import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OrderTotals = ({
  subtotal,
  shipping,
  tax,
  discount = 0,
  total,
  currency = "USD",
  estimated = false,
  className,
}: {
  subtotal: number;
  shipping: number;
  tax: number;
  discount?: number;
  total: number;
  currency?: string;
  estimated?: boolean;
  className?: string;
}) => {
  const { t, formatMoney } = useI18n();
  const row = (label: string, value: React.ReactNode, cls = "") => (
    <div className={cn("flex justify-between gap-4", cls)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      {row(t("common.subtotal"), formatMoney(subtotal, currency))}
      {discount > 0 && row(t("common.discount"), `−${formatMoney(discount, currency)}`, "text-success")}
      {row(t("common.shipping"), shipping === 0 ? <span className="font-medium text-success">{t("store.totals.free")}</span> : formatMoney(shipping, currency))}
      {row(t("common.tax"), formatMoney(tax, currency))}
      <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-bold">
        <dt>{t("common.total")}</dt>
        <dd className="tabular-nums">{formatMoney(total, currency)}</dd>
      </div>
      {estimated && <p className="text-xs text-muted-foreground">{t("store.totals.estimated")}</p>}
    </dl>
  );
};

export default OrderTotals;
