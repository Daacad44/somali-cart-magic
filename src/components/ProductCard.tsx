import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart, Star, SlidersHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { Product } from "@/integrations/supabase/types";
import { useCart } from "@/lib/cart-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { discountPercent, isFlashSaleActive, productImage } from "@/hooks/store/query-utils";
import WishlistButton from "@/components/store/WishlistButton";

interface ProductCardProps {
  product: Product;
  index?: number;
  layout?: "grid" | "list";
}

const ProductCard = ({ product, index = 0, layout = "grid" }: ProductCardProps) => {
  const { addToCart } = useCart();
  const { t, pick, formatMoney } = useI18n();
  const navigate = useNavigate();
  const name = pick(product.name, product.name_so);
  const discount = discountPercent(product.price, product.compare_at_price);
  const flash = isFlashSaleActive(product.flash_sale_ends_at);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.low_stock_threshold;
  const needsOptions = product.variant_options.some((v) => v.options?.length > 0);
  const href = `/product/${product.slug}`;
  const category = product.category ? pick(product.category.name, product.category.name_so) : null;

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (needsOptions) {
      navigate(href);
      return;
    }
    const res = addToCart(product, 1);
    if (res.added > 0) {
      toast.success(t("store.cart.added", { name }), {
        action: { label: t("store.cart.view"), onClick: () => navigate("/cart") },
      });
    } else {
      toast.error(t("store.cart.maxReached", { qty: product.stock }));
    }
  };

  const addLabel = outOfStock ? t("store.product.outOfStock") : needsOptions ? t("store.product.chooseOptions") : t("store.product.addToCart");
  const AddIcon = needsOptions ? SlidersHorizontal : ShoppingCart;

  const badges = (
    <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
      {discount > 0 && (
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">-{discount}%</span>
      )}
      {flash && (
        <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">{t("store.product.flashSale")}</span>
      )}
      {outOfStock && (
        <span className="rounded-md bg-foreground/80 px-2 py-0.5 text-xs font-bold text-background">{t("store.product.outOfStock")}</span>
      )}
    </div>
  );

  const priceBlock = (
    <div className="mt-2 flex flex-wrap items-baseline gap-2">
      <span className="text-lg font-bold text-foreground">{formatMoney(product.price)}</span>
      {discount > 0 && <span className="text-sm text-muted-foreground line-through">{formatMoney(product.compare_at_price)}</span>}
    </div>
  );

  const rating = product.review_count > 0 && (
    <div className="mt-1.5 flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
      <span className="text-xs font-medium text-foreground">{product.rating.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">({product.review_count})</span>
    </div>
  );

  if (layout === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.3 }}
        className="group relative flex gap-4 overflow-hidden rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-card-hover"
      >
        <Link to={href} className="relative block h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-40 sm:w-40">
          <img src={productImage(product.images)} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          {badges}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          {category && <p className="text-xs font-medium text-muted-foreground">{category}</p>}
          <Link to={href}>
            <h3 className="mt-0.5 line-clamp-2 text-base font-semibold text-foreground transition-colors hover:text-accent">{name}</h3>
          </Link>
          {rating}
          <p className="mt-1 hidden line-clamp-2 text-sm text-muted-foreground sm:block">{pick(product.description, product.description_so)}</p>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
            <div>
              {priceBlock}
              {lowStock && <p className="text-xs font-medium text-warning">{t("store.product.onlyLeft", { n: product.stock })}</p>}
            </div>
            <div className="flex items-center gap-2">
              <WishlistButton product={product} className="h-9 w-9 border border-border" />
              <button
                type="button"
                onClick={onAdd}
                disabled={outOfStock}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AddIcon className="h-3.5 w-3.5" /> {addLabel}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.4 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-300 hover:shadow-card-hover"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Link to={href} className="block h-full w-full" tabIndex={-1} aria-hidden>
          <img
            src={productImage(product.images)}
            alt=""
            loading="lazy"
            className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", outOfStock && "opacity-60")}
          />
        </Link>
        {badges}
        <WishlistButton product={product} className="absolute right-3 top-3 h-9 w-9 bg-card/90 shadow-sm backdrop-blur" />
        <div className="absolute inset-x-0 bottom-0 p-3 transition-transform duration-300 md:translate-y-full md:group-focus-within:translate-y-0 md:group-hover:translate-y-0">
          <button
            type="button"
            onClick={onAdd}
            disabled={outOfStock}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AddIcon className="h-3.5 w-3.5" /> {addLabel}
          </button>
        </div>
      </div>

      <div className="p-4">
        {category && <p className="text-xs font-medium text-muted-foreground">{category}</p>}
        <Link to={href}>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-foreground transition-colors hover:text-accent">{name}</h3>
        </Link>
        {rating}
        {priceBlock}
        {lowStock && <p className="mt-1 text-xs font-medium text-warning">{t("store.product.onlyLeft", { n: product.stock })}</p>}
      </div>
    </motion.div>
  );
};

export default ProductCard;
