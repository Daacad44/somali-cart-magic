import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Truck, ShieldCheck, Smartphone, RotateCcw, Flame, AlertCircle } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useCategories, useCategoryCounts, useProducts } from "@/hooks/store/useCatalog";
import { isFlashSaleActive } from "@/hooks/store/query-utils";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import CategoryIcon from "@/components/store/CategoryIcon";
import Countdown from "@/components/store/Countdown";
import PaymentMethods from "@/components/store/PaymentMethods";
import { NotConfigured } from "@/components/auth/Guards";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import heroBanner from "@/assets/hero-banner.jpg";

const SectionError = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useI18n();
  return (
    <div className="mt-7 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
      <p>{t("store.errors.loadFailed")}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>{t("common.retry")}</Button>
    </div>
  );
};

const SectionHeader = ({ title, subtitle, to, light = false }: { title: string; subtitle?: string; to?: string; light?: boolean }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className={`font-heading text-2xl font-bold md:text-3xl ${light ? "text-primary-foreground" : ""}`}>{title}</h2>
        {subtitle && <p className={`mt-1 text-sm ${light ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{subtitle}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className={`inline-flex shrink-0 items-center gap-1 text-sm font-medium transition-colors ${light ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-accent hover:text-foreground"}`}
        >
          {t("store.home.viewAll")} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
};

const Index = () => {
  const { t, pick } = useI18n();
  const categories = useCategories();
  const counts = useCategoryCounts();
  const featured = useProducts({ featured: true, sort: "popular", pageSize: 8 });
  const flash = useProducts({ flashSale: true, sort: "popular", pageSize: 4 });

  const flashItems = (flash.data?.items ?? []).filter((p) => isFlashSaleActive(p.flash_sale_ends_at));
  const flashEndsAt = flashItems
    .map((p) => p.flash_sale_ends_at!)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];

  const trust = [
    { icon: Truck, label: t("store.home.trust.delivery"), sub: t("store.home.trust.deliverySub") },
    { icon: Smartphone, label: t("store.home.trust.mobile"), sub: t("store.home.trust.mobileSub") },
    { icon: ShieldCheck, label: t("store.home.trust.secure"), sub: t("store.home.trust.secureSub") },
    { icon: RotateCcw, label: t("store.home.trust.track"), sub: t("store.home.trust.trackSub") },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
        </div>
        <div className="container relative mx-auto px-4 py-24 lg:px-8 lg:py-36">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-xl">
            <span className="inline-block rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur-sm">
              {t("store.home.heroBadge")}
            </span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-tight text-primary-foreground md:text-5xl lg:text-6xl">
              {t("store.home.heroTitle1")} <span className="text-gradient-umber">{t("store.home.heroTitle2")}</span>
            </h1>
            <p className="mt-4 text-base text-primary-foreground/80 md:text-lg">{t("store.home.heroSubtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/products" className="inline-flex items-center gap-2 rounded-lg bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-opacity hover:opacity-90">
                {t("store.home.shopNow")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/products?sale=true" className="inline-flex items-center gap-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-6 py-3 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/20">
                {t("store.home.viewDeals")}
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-card" aria-label={t("store.home.trustLabel")}>
        <div className="container mx-auto grid grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4 lg:px-8">
          {trust.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-accent" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!isSupabaseConfigured && <NotConfigured />}

      {/* Categories */}
      <section className="container mx-auto px-4 py-14 lg:px-8">
        <SectionHeader title={t("store.home.categories")} subtitle={t("store.home.categoriesSub")} to="/products" />
        {categories.isError ? (
          <SectionError onRetry={() => categories.refetch()} />
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.isLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
              : (categories.data ?? []).map((cat, i) => {
                  const n = counts.data?.[cat.id];
                  return (
                    <motion.div key={cat.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}>
                      <Link
                        to={`/products?category=${cat.slug}`}
                        className="group flex h-full flex-col items-center rounded-xl border border-border bg-card p-5 text-center transition-all hover:border-accent/30 hover:shadow-premium"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-umber-soft text-accent transition-transform group-hover:scale-110">
                          <CategoryIcon slug={cat.slug} icon={cat.icon} />
                        </span>
                        <h3 className="mt-3 text-sm font-semibold text-foreground">{pick(cat.name, cat.name_so)}</h3>
                        {n != null && <p className="mt-0.5 text-xs text-muted-foreground">{t("store.home.itemsCount", { n })}</p>}
                      </Link>
                    </motion.div>
                  );
                })}
          </div>
        )}
      </section>

      {/* Flash sale (only when something is actually on a running flash sale) */}
      {(flash.isLoading || flashItems.length > 0) && (
        <section className="bg-gradient-navy py-14" aria-labelledby="flash-title">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">
                  <Flame className="h-3.5 w-3.5" aria-hidden /> {t("store.product.flashSale")}
                </span>
                <h2 id="flash-title" className="mt-3 font-heading text-2xl font-bold text-primary-foreground md:text-3xl">{t("store.home.flashTitle")}</h2>
                {flashEndsAt && <p className="mt-1 text-sm text-primary-foreground/70">{t("store.home.flashEndsIn")}</p>}
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                {flashEndsAt && <Countdown endsAt={flashEndsAt} onExpire={() => flash.refetch()} />}
                <Link to="/products?flash=true" className="text-sm font-medium text-primary-foreground/80 transition-colors hover:text-primary-foreground">
                  {t("store.home.viewAll")} →
                </Link>
              </div>
            </div>
            {flash.isLoading ? (
              <ProductGridSkeleton count={4} className="mt-7" />
            ) : (
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {flashItems.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Featured */}
      <section className="container mx-auto px-4 py-14 lg:px-8">
        <SectionHeader title={t("store.home.featured")} subtitle={t("store.home.featuredSub")} to="/products" />
        {featured.isError ? (
          <SectionError onRetry={() => featured.refetch()} />
        ) : featured.isLoading ? (
          <ProductGridSkeleton count={4} className="mt-7" />
        ) : (featured.data?.items.length ?? 0) === 0 ? (
          <p className="mt-7 text-sm text-muted-foreground">{t("store.home.noFeatured")}</p>
        ) : (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.data!.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </section>

      {/* Payment methods */}
      <section className="border-t border-border bg-muted/50 py-14">
        <div className="container mx-auto px-4 text-center lg:px-8">
          <h2 className="font-heading text-2xl font-bold md:text-3xl">{t("store.home.paymentsTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("store.home.paymentsSub")}</p>
          <PaymentMethods variant="cards" className="mt-8" />
        </div>
      </section>
    </div>
  );
};

export default Index;
