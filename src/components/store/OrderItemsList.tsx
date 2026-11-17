import type { OrderItem } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { productImage } from "@/hooks/store/query-utils";

const OrderItemsList = ({ items, currency = "USD" }: { items: OrderItem[]; currency?: string }) => {
  const { t, formatMoney } = useI18n();
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => {
        const variants = Object.entries(it.variants ?? {});
        return (
          <li key={it.id} className="flex gap-3 py-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              <img src={productImage(it.image ? [it.image] : [])} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold">{it.product_name}</p>
              {variants.length > 0 && (
                <p className="text-xs text-muted-foreground">{variants.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("store.order.qtyTimes", { qty: it.quantity, price: formatMoney(it.unit_price, currency) })}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatMoney(it.line_total, currency)}</p>
          </li>
        );
      })}
    </ul>
  );
};

export default OrderItemsList;
