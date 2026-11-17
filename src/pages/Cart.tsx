import { Link } from "react-router-dom";
import { Trash2, ArrowLeft, ShoppingCart, Truck, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useI18n } from "@/lib/i18n";
import { previewTotals, productQuantityInCart } from "@/lib/cart-utils";
import { useStoreSettings } from "@/hooks/store/useCatalog";
import { productImage } from "@/hooks/store/query-utils";
import EmptyState from "@/components/store/EmptyState";
import QuantityStepper from "@/components/store/QuantityStepper";
import OrderTotals from "@/components/store/OrderTotals";
import PaymentMethods from "@/components/store/PaymentMethods";
import CartNotice from "@/components/store/CartNotice";

const Cart = () => {
  const { items, updateQuantity, removeFromCart, subtotal, totalItems, revalidating } = useCart();
  const { t, pick, formatMoney } = useI18n();
  const { data: settings } = useStoreSettings();
  const totals = previewTotals(subtotal, settings);
  const currency = settings?.currency ?? "USD";

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl pt-6"><CartNotice /></div>
        <EmptyState
          icon={ShoppingCart}
          title={t("store.cart.emptyTitle")}
          description={t("store.cart.emptyDesc")}
          action={<Button asChild size="lg"><Link to="/products">{t("store.cart.startShopping")}</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Link to="/products" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("store.cart.continue")}
      </Link>
      <h1 className="flex items-center gap-3 font-heading text-3xl font-bold">
        {t("store.cart.titleCount", { n: totalItems })}
        {revalidating && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("common.loading")} />}
      </h1>

      <div className="mt-4"><CartNotice /></div>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <ul className="space-y-3 lg:col-span-2">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const name = pick(item.product.name, item.product.name_so);
              const others = productQuantityInCart(items, item.product.id, item.key);
              const max = Math.max(1, item.product.stock - others);
              const variants = Object.entries(item.variants);
              return (
                <motion.li
                  key={item.key}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-4 rounded-xl border border-border bg-card p-4"
                >
                  <Link to={`/product/${item.product.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                    <img src={productImage(item.product.images)} alt={name} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/product/${item.product.slug}`} className="line-clamp-1 text-sm font-semibold hover:text-accent">{name}</Link>
                        {variants.length > 0 && (
                          <p className="text-xs text-muted-foreground">{variants.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatMoney(item.product.price, currency)}</p>
                        {item.quantity >= item.product.stock - others && (
                          <p className="text-xs text-warning">{t("store.product.onlyLeft", { n: item.product.stock })}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.key)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={t("store.cart.remove", { name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <QuantityStepper size="sm" value={item.quantity} min={1} max={max} onChange={(q) => updateQuantity(item.key, q)} />
                      <span className="text-sm font-bold tabular-nums">{formatMoney(item.product.price * item.quantity, currency)}</span>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-20">
          <h2 className="font-heading text-lg font-bold">{t("store.cart.summary")}</h2>
          {totals.freeShippingRemaining != null && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <Truck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              {t("store.cart.freeShippingRemaining", { amount: formatMoney(totals.freeShippingRemaining, currency) })}
            </p>
          )}
          <OrderTotals className="mt-4" subtotal={totals.subtotal} shipping={totals.shipping} tax={totals.tax} total={totals.total} currency={currency} estimated />
          <Button asChild size="lg" className="mt-5 w-full" disabled={revalidating}>
            <Link to="/checkout">{t("store.cart.checkout")}</Link>
          </Button>
          <PaymentMethods variant="chips" className="mt-4 justify-center" />
        </aside>
      </div>
    </div>
  );
};

export default Cart;
