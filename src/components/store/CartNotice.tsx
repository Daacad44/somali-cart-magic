import { Info, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCart } from "@/lib/cart-context";
import { useI18n } from "@/lib/i18n";

/** Explains price/stock changes found when the cart was revalidated against the store. */
const CartNotice = () => {
  const { changes, dismissChanges } = useCart();
  const { t, pick, formatMoney } = useI18n();
  if (changes.length === 0) return null;
  return (
    <Alert className="relative border-warning/40 bg-warning/5">
      <Info className="h-4 w-4 !text-warning" />
      <AlertTitle>{t("store.cart.changedTitle")}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
          {changes.map((c, i) => {
            const name = pick(c.name, c.name_so);
            const msg =
              c.kind === "price"
                ? t("store.cart.changedPrice", { name, from: formatMoney(c.from), to: formatMoney(c.to) })
                : c.kind === "stock"
                  ? t("store.cart.changedStock", { name, qty: c.to ?? 0 })
                  : c.kind === "out_of_stock"
                    ? t("store.cart.changedOut", { name })
                    : t("store.cart.changedRemoved", { name });
            return <li key={i}>{msg}</li>;
          })}
        </ul>
      </AlertDescription>
      <button type="button" onClick={dismissChanges} className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={t("common.close")}>
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
};

export default CartNotice;
