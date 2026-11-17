import { Link } from "react-router-dom";
import { AlertCircle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/ProductCard";
import { useI18n } from "@/lib/i18n";
import { useWishlist } from "@/hooks/store/useWishlist";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import EmptyState from "@/components/store/EmptyState";

const Wishlist = () => {
  const { t } = useI18n();
  const { entries, isLoading, isError, refetch } = useWishlist();
  // Products that were deactivated come back as null through RLS — hide them.
  const products = entries.map((e) => e.product).filter((p): p is NonNullable<typeof p> => !!p && p.is_active);

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">{t("store.nav.wishlist")}</h1>
      {!isLoading && !isError && products.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">{t("store.products.count", { n: products.length })}</p>
      )}
      <div className="mt-6">
        {isLoading ? (
          <ProductGridSkeleton count={4} />
        ) : isError ? (
          <EmptyState icon={AlertCircle} title={t("store.errors.loadFailed")} action={<Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={t("store.wishlist.emptyTitle")}
            description={t("store.wishlist.emptyDesc")}
            action={<Button asChild><Link to="/products">{t("store.cart.startShopping")}</Link></Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wishlist;
