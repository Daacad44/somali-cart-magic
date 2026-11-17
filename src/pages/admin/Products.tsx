import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MoreHorizontal, Package, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataPagination, EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/admin/shared";
import { ProductFormDialog } from "@/components/admin/ProductFormDialog";
import { pageToRange, sanitizeSearch, totalPages } from "@/components/admin/utils";
import { useAdminCategories, useStoreSettings } from "@/hooks/admin/useStoreData";
import { useDebounced } from "@/hooks/admin/useDebounced";

const PAGE_SIZE = 20;
const ALL = "all";

/* ---------- Quick stock adjust ---------- */
const StockAdjust = ({ product, onSaved }: { product: Product; onSaved: () => void }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [saving, setSaving] = useState(false);
  const low = product.stock <= product.low_stock_threshold;
  const next = Math.max(0, product.stock + (Number(delta) || 0));

  const save = async (value: number) => {
    setSaving(true);
    const { error } = await supabase.from("products").update({ stock: value }).eq("id", product.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("admin.products.stockUpdated", { n: value }));
    setDelta("");
    setOpen(false);
    onSaved();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex min-w-[3rem] items-center justify-center gap-1 rounded-md px-2 py-1 text-sm font-medium tabular-nums transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            product.stock === 0 ? "text-destructive" : low ? "text-amber-700 dark:text-amber-300" : "",
          )}
          aria-label={t("admin.products.adjustStock")}
        >
          {low && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          {product.stock}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="mb-2 text-sm font-medium">{t("admin.products.adjustStock")}</p>
        <div className="flex items-center gap-2">
          {[-1, +1, +10].map((d) => (
            <Button key={d} type="button" variant="outline" size="sm" className="flex-1" onClick={() => setDelta(String((Number(delta) || 0) + d))}>
              {d > 0 ? `+${d}` : d}
            </Button>
          ))}
        </div>
        <Input
          className="mt-2"
          type="number"
          inputMode="numeric"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder={t("admin.products.deltaPh")}
          aria-label={t("admin.products.deltaPh")}
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("admin.products.stockPreview", { from: product.stock, to: next })}</p>
        <Button className="mt-3 w-full" size="sm" disabled={saving || !delta || next === product.stock} onClick={() => save(next)}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}
        </Button>
      </PopoverContent>
    </Popover>
  );
};

const AdminProducts = () => {
  const { t, pick, formatMoney } = useI18n();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search, 350);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ product: Product; refs: number | null } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const categories = useAdminCategories();
  const { data: settings } = useStoreSettings();
  const currency = settings?.currency ?? "USD";

  const category = params.get("category") ?? ALL;
  const status = params.get("status") ?? ALL;
  const stockFilter = params.get("stock") ?? ALL;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const q = params.get("q") ?? "";

  const setParam = (key: string, value: string) => setParams((prev) => {
    const n = new URLSearchParams(prev);
    if (!value || value === ALL) n.delete(key); else n.set(key, value);
    if (key !== "page") n.delete("page");
    return n;
  }, { replace: true });

  useEffect(() => {
    if (debounced !== q) setParam("q", debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const products = useQuery({
    queryKey: ["admin", "products", { q, category, status, stockFilter, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("products").select("*, category:categories(id, name, name_so, slug)", { count: "exact" });
      if (category !== ALL) query = category === "none" ? query.is("category_id", null) : query.eq("category_id", category);
      if (status !== ALL) query = query.eq("is_active", status === "active");
      const s = sanitizeSearch(q);
      if (s) query = query.or(`name.ilike.%${s}%,name_so.ilike.%${s}%,sku.ilike.%${s}%,slug.ilike.%${s}%`);
      if (stockFilter === "out") query = query.eq("stock", 0);
      if (stockFilter === "low") {
        // PostgREST can't compare two columns; fetch a bounded set and filter client-side.
        const { data, error } = await query.order("stock", { ascending: true }).limit(1000);
        if (error) throw error;
        const rows = ((data ?? []) as Product[]).filter((p) => p.stock <= p.low_stock_threshold);
        return { rows, count: rows.length, paged: false };
      }
      const [from, to] = pageToRange(page, PAGE_SIZE);
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as Product[], count: count ?? 0, paged: true };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "products"] });

  const toggle = async (p: Product, field: "is_active" | "is_featured", value: boolean) => {
    const { error } = await supabase.from("products").update({ [field]: value }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(t("admin.common.saved"));
    refresh();
  };

  const askDelete = async (p: Product) => {
    setToDelete({ product: p, refs: null });
    const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", p.id);
    setToDelete({ product: p, refs: count ?? 0 });
  };

  const doDelete = async (mode: "delete" | "deactivate") => {
    if (!toDelete) return;
    setDeleting(true);
    const { product } = toDelete;
    const { error } = mode === "delete"
      ? await supabase.from("products").delete().eq("id", product.id)
      : await supabase.from("products").update({ is_active: false }).eq("id", product.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    if (mode === "delete" && product.images.length) {
      // Best-effort cleanup of images we stored in our bucket.
      const marker = "/product-images/";
      const paths = product.images.filter((u) => u.includes(marker)).map((u) => decodeURIComponent(u.split(marker)[1]));
      if (paths.length) await supabase.storage.from("product-images").remove(paths);
    }
    toast.success(mode === "delete" ? t("admin.products.deleted") : t("admin.products.deactivated"));
    setToDelete(null);
    refresh();
  };

  const hasFilters = category !== ALL || status !== ALL || stockFilter !== ALL || q;
  const rows = products.data?.rows ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.products.title")}
        description={t("admin.products.subtitle")}
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> {t("admin.products.new")}
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.products.searchPh")} aria-label={t("common.search")} />
          </div>
          <Select value={category} onValueChange={(v) => setParam("category", v)}>
            <SelectTrigger aria-label={t("admin.products.category")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.products.allCategories")}</SelectItem>
              <SelectItem value="none">{t("admin.products.noCategory")}</SelectItem>
              {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{pick(c.name, c.name_so)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger aria-label={t("common.status")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.common.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("admin.common.active")}</SelectItem>
              <SelectItem value="inactive">{t("admin.common.inactive")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={stockFilter} onValueChange={(v) => setParam("stock", v)}>
              <SelectTrigger aria-label={t("admin.products.stock")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("admin.products.allStock")}</SelectItem>
                <SelectItem value="low">{t("admin.products.lowStock")}</SelectItem>
                <SelectItem value="out">{t("admin.products.outOfStock")}</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={() => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); }} aria-label={t("admin.common.clearFilters")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {products.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasFilters ? t("common.noResults") : t("admin.products.empty")}
            description={hasFilters ? t("admin.common.tryOtherFilters") : t("admin.products.emptyHint")}
            action={!hasFilters && <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("admin.products.new")}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">{t("admin.products.product")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("admin.products.category")}</TableHead>
                    <TableHead className="text-right">{t("admin.products.price")}</TableHead>
                    <TableHead className="text-center">{t("admin.products.stock")}</TableHead>
                    <TableHead className="text-center">{t("admin.common.active")}</TableHead>
                    <TableHead className="w-10"><span className="sr-only">{t("common.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id} className={cn(!p.is_active && "opacity-60")}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                            {p.images[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="m-2.5 h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0">
                            <button className="block max-w-[18rem] truncate text-left font-medium hover:underline" onClick={() => { setEditing(p); setFormOpen(true); }}>
                              {pick(p.name, p.name_so)}
                            </button>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {p.sku && <span className="font-mono">{p.sku}</span>}
                              {p.is_featured && <span className="inline-flex items-center gap-0.5 text-umber"><Star className="h-3 w-3 fill-current" />{t("admin.products.featured")}</span>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{p.category ? pick(p.category.name, p.category.name_so) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="font-medium">{formatMoney(p.price, currency)}</div>
                        {p.compare_at_price ? <div className="text-xs text-muted-foreground line-through">{formatMoney(p.compare_at_price, currency)}</div> : null}
                      </TableCell>
                      <TableCell className="text-center"><StockAdjust product={p} onSaved={refresh} /></TableCell>
                      <TableCell className="text-center">
                        <Switch checked={p.is_active} onCheckedChange={(v) => toggle(p, "is_active", v)} aria-label={t("admin.common.active")} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("common.actions")}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => { setEditing(p); setFormOpen(true); }}><Pencil className="mr-2 h-4 w-4" />{t("common.edit")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggle(p, "is_featured", !p.is_featured)}>
                              <Star className="mr-2 h-4 w-4" />{p.is_featured ? t("admin.products.unfeature") : t("admin.products.feature")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => askDelete(p)}>
                              <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {products.data!.paged ? (
              <DataPagination page={page} pageCount={totalPages(products.data!.count, PAGE_SIZE)} total={products.data!.count} loading={products.isFetching} onPage={(p) => setParam("page", String(p))} />
            ) : (
              <p className="border-t px-4 py-3 text-sm text-muted-foreground">{t("admin.products.lowCount", { n: rows.length })}</p>
            )}
          </>
        )}
      </Card>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.products.deleteTitle", { name: toDelete?.product.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {toDelete?.refs === null ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("admin.products.checkingRefs")}</span>
                ) : toDelete && toDelete.refs > 0 ? (
                  <span>{t("admin.products.deleteReferenced", { n: toDelete.refs })}</span>
                ) : (
                  <span>{t("admin.products.deleteDesc")}</span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            {toDelete?.product.is_active && (
              <Button variant={toDelete.refs ? "default" : "outline"} disabled={deleting || toDelete.refs === null} onClick={() => doDelete("deactivate")}>
                {t("admin.products.deactivateInstead")}
              </Button>
            )}
            <Button variant="destructive" disabled={deleting || toDelete?.refs === null} onClick={() => doDelete("delete")}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {toDelete?.refs ? t("admin.products.deleteAnyway") : t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProducts;
