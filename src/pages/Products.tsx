import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, LayoutGrid, List, Search, X, PackageSearch, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useCategories, useProducts } from "@/hooks/store/useCatalog";
import { PRODUCT_SORTS, parseSort, sanitizeSearch, type ProductSort } from "@/hooks/store/query-utils";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import EmptyState from "@/components/store/EmptyState";
import { NotConfigured } from "@/components/auth/Guards";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

const VIEW_KEY = "botan.products.view";

const Products = () => {
  const { t, pick } = useI18n();
  const [params, setParams] = useSearchParams();

  // Everything is derived from the URL so back/forward and navbar links always apply.
  const category = params.get("category") || null;
  const q = sanitizeSearch(params.get("q"));
  const sort = parseSort(params.get("sort"));
  const sale = params.get("sale") === "true";
  const flash = params.get("flash") === "true";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

  // Local search box mirrors ?q= (kept in sync when the URL changes elsewhere, e.g. navbar search).
  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);

  const categories = useCategories();
  const products = useProducts({ category, search: q || null, sort, sale, flashSale: flash, page });

  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    setParams(next);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  const activeCategory = categories.data?.find((c) => c.slug === category);
  const title = activeCategory ? pick(activeCategory.name, activeCategory.name_so) : flash ? t("store.product.flashSale") : sale ? t("store.nav.deals") : t("store.products.title");
  const data = products.data;
  const hasFilters = !!(category || q || sale || flash);

  const sortLabels: Record<ProductSort, string> = {
    latest: t("store.sort.latest"),
    popular: t("store.sort.popular"),
    rating: t("store.sort.rating"),
    "price-asc": t("store.sort.priceAsc"),
    "price-desc": t("store.sort.priceDesc"),
  };

  if (!isSupabaseConfigured) return <NotConfigured />;

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          {products.isLoading ? t("common.loading") : t("store.products.count", { n: data?.total ?? 0 })}
          {q && <> · {t("store.products.resultsFor", { q })}</>}
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Filters */}
        <aside className="w-full shrink-0 lg:w-60" aria-label={t("store.products.filters")}>
          <div className="space-y-5 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> {t("store.products.filters")}
            </h2>

            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                update({ q: sanitizeSearch(searchText) || null });
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t("store.nav.searchPlaceholder")}
                aria-label={t("common.search")}
                className="pl-9"
                maxLength={64}
              />
            </form>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{t("store.products.category")}</p>
              <div className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                <button
                  onClick={() => update({ category: null })}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                    !category ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={!category}
                >
                  {t("store.products.allCategories")}
                </button>
                {categories.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 shrink-0 lg:w-full" />)
                  : (categories.data ?? []).map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => update({ category: cat.slug })}
                        className={cn(
                          "shrink-0 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                          category === cat.slug ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-pressed={category === cat.slug}
                      >
                        {pick(cat.name, cat.name_so)}
                      </button>
                    ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="f-sale" className="text-sm font-normal">{t("store.products.onSale")}</Label>
                <Switch id="f-sale" checked={sale} onCheckedChange={(v) => update({ sale: v ? "true" : null })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="f-flash" className="text-sm font-normal">{t("store.product.flashSale")}</Label>
                <Switch id="f-flash" checked={flash} onCheckedChange={(v) => update({ flash: v ? "true" : null })} />
              </div>
            </div>

            {hasFilters && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setParams(sort !== "latest" ? { sort } : {})}>
                <X className="mr-1 h-3.5 w-3.5" /> {t("store.products.clearFilters")}
              </Button>
            )}
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {q && (
                <button onClick={() => update({ q: null })} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
                  “{q}” <X className="h-3 w-3" aria-label={t("common.close")} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => update({ sort: v === "latest" ? null : v })}>
                <SelectTrigger className="w-[190px]" aria-label={t("store.sort.label")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_SORTS.map((s) => (
                    <SelectItem key={s} value={s}>{sortLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label={t("store.products.view")}>
                <button
                  onClick={() => setView("grid")}
                  className={cn("rounded-md p-2 transition-colors", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                  aria-pressed={view === "grid"}
                  aria-label={t("store.products.gridView")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn("rounded-md p-2 transition-colors", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                  aria-pressed={view === "list"}
                  aria-label={t("store.products.listView")}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {products.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("store.errors.loadFailed")}
              action={<Button variant="outline" onClick={() => products.refetch()}>{t("common.retry")}</Button>}
            />
          ) : products.isLoading ? (
            <ProductGridSkeleton count={6} layout={view} className={view === "grid" ? "sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3" : ""} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={t("store.products.emptyTitle")}
              description={t("store.products.emptyDesc")}
              action={hasFilters ? <Button asChild variant="outline"><Link to="/products">{t("store.products.clearFilters")}</Link></Button> : undefined}
            />
          ) : (
            <>
              <div
                className={cn(
                  view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3",
                  products.isPlaceholderData && "opacity-60 transition-opacity",
                )}
              >
                {data.items.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} layout={view} />
                ))}
              </div>

              {data.pageCount > 1 && (
                <nav className="mt-8 flex items-center justify-center gap-2" aria-label={t("store.products.pagination")}>
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> {t("store.products.prev")}
                  </Button>
                  <span className="px-2 text-sm text-muted-foreground">
                    {t("store.products.pageOf", { page, total: data.pageCount })}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= data.pageCount} onClick={() => update({ page: String(page + 1) }, false)}>
                    {t("store.products.next")} <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;
