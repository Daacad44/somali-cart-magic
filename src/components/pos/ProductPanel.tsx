import { useMemo, useState } from "react";
import { AlertCircle, ImageOff, PackageSearch, ScanBarcode, X } from "lucide-react";
import type { PosProduct } from "@/hooks/pos";
import { useI18n } from "@/lib/i18n";
import { productQtyOnTicket, type TicketLine } from "./ticket";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "./Kbd";
import { cn } from "@/lib/utils";

interface Category { id: string; name: string; name_so: string | null }

interface Props {
  products: PosProduct[] | undefined;
  categories: Category[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  lines: TicketLine[];
  currency: string;
  locked: boolean;
  searchRef: React.RefObject<HTMLInputElement>;
  onPick: (p: PosProduct) => void;
  onNotFound: (query: string) => void;
}

function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function ProductPanel({
  products, categories, loading, error, onRetry, lines, currency, locked, searchRef, onPick, onNotFound,
}: Props) {
  const { t, pick, formatMoney } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return (products ?? []).filter((p) => {
      if (category !== "all" && p.category_id !== category) return false;
      if (!q) return true;
      return norm(p.name).includes(q) || norm(p.name_so).includes(q) || norm(p.sku).includes(q);
    });
  }, [products, query, category]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.stopPropagation();
      setQuery("");
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim();
    if (!q || locked) return;
    // Barcode/SKU scan: exact SKU match across the whole catalogue first.
    const exact = (products ?? []).find((p) => p.sku && p.sku.toLowerCase() === q.toLowerCase());
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      onPick(target);
      setQuery("");
    } else {
      onNotFound(q);
    }
  };

  return (
    <section aria-label={t("pos.products.title")} className="flex min-w-0 flex-col gap-3">
      <div className="relative">
        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder={t("pos.products.searchPlaceholder")}
          aria-label={t("pos.products.searchPlaceholder")}
          className="h-12 pl-10 pr-20 text-base"
          autoComplete="off"
          enterKeyHint="go"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuery("")} aria-label={t("pos.products.clear")}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Kbd>F2</Kbd>
          )}
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" role="toolbar" aria-label={t("pos.products.categories")}>
        {[{ id: "all", name: t("pos.products.all"), name_so: null }, ...(categories ?? [])].map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c.id)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {c.id === "all" ? c.name : pick(c.name, c.name_so)}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm">{t("pos.products.loadError")}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>{t("common.retry")}</Button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <PackageSearch className="h-8 w-8" />
          <p className="text-sm">{query ? t("common.noResults") : t("pos.products.empty")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={t("pos.products.title")}>
          {filtered.map((p) => {
            const remaining = Math.max(0, p.stock - productQtyOnTicket(lines, p.id));
            const out = p.stock <= 0;
            const disabled = out || remaining <= 0 || locked;
            const low = !out && p.stock <= (p.low_stock_threshold ?? 5);
            const name = pick(p.name, p.name_so);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(p)}
                  className={cn(
                    "group flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    disabled ? "cursor-not-allowed opacity-55" : "hover:border-primary/50 hover:shadow-md active:scale-[0.98]",
                  )}
                  aria-label={`${name}, ${formatMoney(p.price, currency)}${out ? `, ${t("pos.products.outOfStock")}` : ""}`}
                >
                  <div className="relative aspect-square w-full bg-muted">
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm",
                        out ? "bg-destructive text-destructive-foreground"
                          : low ? "bg-warning text-warning-foreground" : "bg-background/90 text-foreground",
                      )}
                    >
                      {out ? t("pos.products.outOfStock") : t("pos.products.stockShort", { n: remaining })}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{name}</span>
                    {p.sku && <span className="text-[11px] text-muted-foreground">{p.sku}</span>}
                    <span className="mt-auto pt-1 font-semibold text-primary tabular-nums">{formatMoney(p.price, currency)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
