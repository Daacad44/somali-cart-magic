import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Star, ShoppingCart, Truck, ShieldCheck, PackageX, AlertCircle, Check, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ProductCard from "@/components/ProductCard";
import { useCart } from "@/lib/cart-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { missingVariants, productQuantityInCart, clampQuantity, previewTotals } from "@/lib/cart-utils";
import { useProduct, useRelatedProducts, useStoreSettings } from "@/hooks/store/useCatalog";
import { discountPercent, isFlashSaleActive, productImage } from "@/hooks/store/query-utils";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import EmptyState from "@/components/store/EmptyState";
import QuantityStepper from "@/components/store/QuantityStepper";
import WishlistButton from "@/components/store/WishlistButton";
import Countdown from "@/components/store/Countdown";

const DetailSkeleton = () => (
  <div className="container mx-auto px-4 py-8 lg:px-8" aria-busy="true">
    <Skeleton className="mb-6 h-4 w-60" />
    <div className="grid gap-10 lg:grid-cols-2">
      <Skeleton className="aspect-square rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  </div>
);

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, pick, formatMoney } = useI18n();
  const { data: product, isLoading, isError, refetch } = useProduct(slug);
  const related = useRelatedProducts(product);
  const { data: settings } = useStoreSettings();
  const { items, addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [imageIdx, setImageIdx] = useState(0);
  const [triedAdd, setTriedAdd] = useState(false);

  // Reset local state when navigating between products
  useEffect(() => {
    setQuantity(1);
    setSelected({});
    setImageIdx(0);
    setTriedAdd(false);
  }, [slug]);

  const inCart = product ? productQuantityInCart(items, product.id) : 0;
  const available = product ? Math.max(0, product.stock - inCart) : 0;
  const missing = useMemo(() => (product ? missingVariants(product.variant_options, selected) : []), [product, selected]);

  useEffect(() => {
    if (available > 0 && quantity > available) setQuantity(available);
  }, [available, quantity]);

  if (isLoading) return <DetailSkeleton />;
  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("store.errors.loadFailed")}
        action={<Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>}
      />
    );
  }
  if (!product) {
    return (
      <EmptyState
        icon={PackageX}
        title={t("store.product.notFound")}
        description={t("store.product.notFoundDesc")}
        action={<Button asChild><Link to="/products">{t("store.product.backToShop")}</Link></Button>}
      />
    );
  }

  const name = pick(product.name, product.name_so);
  const description = pick(product.description, product.description_so);
  const discount = discountPercent(product.price, product.compare_at_price);
  const flash = isFlashSaleActive(product.flash_sale_ends_at);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.low_stock_threshold;
  const images = product.images.length ? product.images : ["/placeholder.svg"];
  const categoryName = product.category ? pick(product.category.name, product.category.name_so) : null;
  const canAdd = !outOfStock && available > 0 && missing.length === 0;
  const freeOver = settings?.free_shipping_over ?? null;
  const shippingPreview = previewTotals(product.price, settings);

  const handleAdd = (goToCart = false) => {
    setTriedAdd(true);
    if (missing.length) {
      toast.error(t("store.product.selectOptions", { options: missing.join(", ") }));
      return;
    }
    const res = addToCart(product, clampQuantity(quantity, available), selected);
    if (res.added === 0) {
      toast.error(t("store.cart.maxReached", { qty: product.stock }));
      return;
    }
    if (res.clamped) toast.warning(t("store.cart.clamped", { qty: res.added }));
    if (goToCart) {
      navigate("/cart");
      return;
    }
    toast.success(t("store.cart.added", { name }), {
      action: { label: t("store.cart.view"), onClick: () => navigate("/cart") },
    });
    setQuantity(1);
  };

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">{t("store.nav.home")}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/products">{t("store.nav.shop")}</Link></BreadcrumbLink></BreadcrumbItem>
          {product.category && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link to={`/products?category=${product.category.slug}`}>{categoryName}</Link></BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage className="line-clamp-1">{name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
            <img src={productImage(images, imageIdx)} alt={name} className="h-full w-full object-cover" />
            <div className="absolute left-4 top-4 flex flex-col items-start gap-1.5">
              {discount > 0 && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">-{discount}%</span>}
              {flash && <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">{t("store.product.flashSale")}</span>}
            </div>
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={t("store.product.gallery")}>
              {images.map((src, i) => (
                <button
                  key={src + i}
                  role="tab"
                  aria-selected={i === imageIdx}
                  aria-label={t("store.product.imageN", { n: i + 1 })}
                  onClick={() => setImageIdx(i)}
                  className={cn(
                    "h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition-colors",
                    i === imageIdx ? "border-accent" : "border-transparent hover:border-border",
                  )}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Details */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          {categoryName && <p className="text-sm font-medium text-accent">{categoryName}</p>}
          <h1 className="mt-2 font-heading text-3xl font-bold md:text-4xl">{name}</h1>

          {product.review_count > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-0.5" aria-label={t("store.product.ratingOf", { rating: product.rating.toFixed(1) })}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn("h-4 w-4", i < Math.round(product.rating) ? "fill-warning text-warning" : "text-border")} aria-hidden />
                ))}
              </div>
              <span className="text-sm font-medium">{product.rating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">{t("store.product.reviews", { n: product.review_count })}</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold">{formatMoney(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-lg text-muted-foreground line-through">{formatMoney(product.compare_at_price)}</span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{t("store.product.save", { n: discount })}</span>
              </>
            )}
          </div>

          {flash && product.flash_sale_ends_at && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-gradient-navy p-3">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-foreground"><Zap className="h-4 w-4" aria-hidden /> {t("store.home.flashEndsIn")}</span>
              <Countdown endsAt={product.flash_sale_ends_at} onExpire={() => refetch()} />
            </div>
          )}

          {/* Stock */}
          <p className={cn("mt-4 flex items-center gap-1.5 text-sm font-medium", outOfStock ? "text-destructive" : lowStock ? "text-warning" : "text-success")} aria-live="polite">
            {outOfStock ? <PackageX className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {outOfStock ? t("store.product.outOfStock") : lowStock ? t("store.product.onlyLeft", { n: product.stock }) : t("store.product.inStock")}
          </p>

          {description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{description}</p>}

          {/* Variants */}
          {product.variant_options.map((v) => {
            const isMissing = triedAdd && missing.includes(v.type);
            return (
              <fieldset key={v.type} className="mt-5">
                <legend className="text-sm font-semibold">
                  {v.type}
                  {selected[v.type] && <span className="ml-1.5 font-normal text-muted-foreground">: {selected[v.type]}</span>}
                </legend>
                <div className={cn("mt-2 flex flex-wrap gap-2 rounded-lg", isMissing && "ring-2 ring-destructive/50 ring-offset-2 ring-offset-background")}>
                  {v.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={selected[v.type] === opt}
                      onClick={() => setSelected((prev) => ({ ...prev, [v.type]: opt }))}
                      className={cn(
                        "rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
                        selected[v.type] === opt ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}

          {/* Quantity + actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <QuantityStepper value={quantity} max={Math.max(1, available)} onChange={setQuantity} disabled={!canAdd && missing.length === 0} />
            <Button size="lg" className="flex-1" disabled={!canAdd} onClick={() => handleAdd(false)}>
              <ShoppingCart className="mr-2 h-4 w-4" /> {outOfStock ? t("store.product.outOfStock") : t("store.product.addToCart")}
            </Button>
            <WishlistButton product={product} className="h-11 w-11 border border-border" iconClassName="h-5 w-5" />
          </div>
          {!outOfStock && (
            <Button size="lg" variant="secondary" className="mt-3 w-full" disabled={!canAdd} onClick={() => handleAdd(true)}>
              {t("store.product.buyNow")}
            </Button>
          )}
          <div className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite">
            {missing.length > 0 && !outOfStock && (
              <p className={triedAdd ? "text-destructive" : "text-muted-foreground"}>{t("store.product.selectOptions", { options: missing.join(", ") })}</p>
            )}
            {missing.length === 0 && inCart > 0 && available <= 0 && !outOfStock && (
              <p className="text-warning">{t("store.cart.maxReached", { qty: product.stock })}</p>
            )}
            {inCart > 0 && available > 0 && <p className="text-muted-foreground">{t("store.product.inCart", { n: inCart })}</p>}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/50 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-accent" aria-hidden />
              {freeOver != null
                ? t("store.product.freeShippingOver", { amount: formatMoney(freeOver) })
                : t("store.product.shippingFee", { amount: formatMoney(shippingPreview.shipping) })}
            </div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> {t("store.product.securePay")}</div>
          </div>

          {product.sku && <p className="mt-4 text-xs text-muted-foreground">SKU: {product.sku}</p>}
        </motion.div>
      </div>

      {/* Related */}
      {(related.isLoading || (related.data?.items.length ?? 0) > 0) && (
        <section className="mt-16" aria-labelledby="related-title">
          <h2 id="related-title" className="font-heading text-2xl font-bold">{t("store.product.related")}</h2>
          {related.isLoading ? (
            <ProductGridSkeleton count={4} className="mt-6" />
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.data!.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ProductDetail;
