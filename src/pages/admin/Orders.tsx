import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Filter, ScanBarcode, Search, ShoppingBag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { normalizeSomaliPhone } from "@/lib/wallet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  ChannelBadge, DataPagination, EmptyState, ErrorState, PageHeader, StatusBadge, TableSkeleton,
} from "@/components/admin/shared";
import { dateRangeToQuery, downloadCsv, pageToRange, sanitizeSearch, toCsv, totalPages } from "@/components/admin/utils";
import { useDebounced } from "@/hooks/admin/useDebounced";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const ORDER_STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refunded"] as const;
const ALL = "all";

interface OrderFilters {
  status: string;
  payment: string;
  channel: string;
  from: string;
  to: string;
  q: string;
}

function applyOrderFilters<Q>(query: Q, f: OrderFilters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (f.status !== ALL) q = q.eq("status", f.status);
  if (f.payment !== ALL) q = q.eq("payment_status", f.payment);
  if (f.channel !== ALL) q = q.eq("channel", f.channel);
  const range = dateRangeToQuery(f.from, f.to);
  if (range.gte) q = q.gte("created_at", range.gte);
  if (range.lt) q = q.lt("created_at", range.lt);
  const s = sanitizeSearch(f.q);
  if (s) {
    const parts = [`order_number.ilike.%${s}%`, `shipping_name.ilike.%${s}%`, `shipping_phone.ilike.%${s}%`];
    const phone = normalizeSomaliPhone(s);
    if (phone) parts.push(`shipping_phone.ilike.%${phone.slice(3)}%`);
    q = q.or(parts.join(","));
  }
  return q as Q;
}

const AdminOrders = () => {
  const { t, formatMoney, formatDate } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search, 350);
  const [exporting, setExporting] = useState(false);

  const filters: OrderFilters = useMemo(() => ({
    status: params.get("status") ?? ALL,
    payment: params.get("payment") ?? ALL,
    channel: params.get("channel") ?? ALL,
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    q: params.get("q") ?? "",
  }), [params]);
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const setParam = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || value === ALL) next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.delete("page");
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (debounced !== (params.get("q") ?? "")) setParam("q", debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const queryKey = ["admin", "orders", filters, page];
  const orders = useQuery({
    queryKey,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageToRange(page, PAGE_SIZE);
      const base = supabase
        .from("orders")
        .select("id, order_number, channel, status, payment_status, total, currency, shipping_name, shipping_phone, created_at, customer:customers(id, full_name, phone)", { count: "exact" });
      const { data, error, count } = await applyOrderFilters(base, filters)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Order[], count: count ?? 0 };
    },
  });

  // Realtime: refresh on any order insert/update the user can see.
  useEffect(() => {
    const ch = supabase
      .channel("admin-orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const pageCount = totalPages(orders.data?.count, PAGE_SIZE);
  const hasFilters = filters.status !== ALL || filters.payment !== ALL || filters.channel !== ALL || filters.from || filters.to || filters.q;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const base = supabase.from("orders").select("order_number, channel, status, payment_status, subtotal, shipping_fee, tax, discount, total, currency, shipping_name, shipping_phone, shipping_city, created_at, paid_at");
      const { data, error } = await applyOrderFilters(base, filters).order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as Order[];
      const csv = toCsv(rows, [
        { header: "order_number", value: (r) => r.order_number },
        { header: "created_at", value: (r) => r.created_at },
        { header: "channel", value: (r) => r.channel },
        { header: "status", value: (r) => r.status },
        { header: "payment_status", value: (r) => r.payment_status },
        { header: "customer", value: (r) => r.shipping_name },
        { header: "phone", value: (r) => r.shipping_phone },
        { header: "city", value: (r) => r.shipping_city },
        { header: "subtotal", value: (r) => r.subtotal },
        { header: "shipping", value: (r) => r.shipping_fee },
        { header: "tax", value: (r) => r.tax },
        { header: "discount", value: (r) => r.discount },
        { header: "total", value: (r) => r.total },
        { header: "currency", value: (r) => r.currency },
        { header: "paid_at", value: (r) => r.paid_at },
      ]);
      downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.orders.title")}
        description={t("admin.orders.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !orders.data?.count}>
              <Download className="mr-2 h-4 w-4" /> {t("admin.common.exportCsv")}
            </Button>
            {can("pos.use") && (
              <Button asChild size="sm">
                <Link to="/admin/pos"><ScanBarcode className="mr-2 h-4 w-4" />{t("admin.orders.newSale")}</Link>
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.orders.searchPlaceholder")}
              className="pl-9"
              aria-label={t("common.search")}
            />
          </div>
          <Select value={filters.status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger aria-label={t("admin.orders.fulfilment")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.orders.allStatuses")}</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.payment} onValueChange={(v) => setParam("payment", v)}>
            <SelectTrigger aria-label={t("admin.orders.payment")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.orders.allPayments")}</SelectItem>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.channel} onValueChange={(v) => setParam("channel", v)}>
            <SelectTrigger aria-label={t("admin.orders.channel")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.orders.allChannels")}</SelectItem>
              <SelectItem value="online">{t("admin.channel.online")}</SelectItem>
              <SelectItem value="pos">{t("admin.channel.pos")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); }}
              >
                <X className="mr-1 h-4 w-4" /> {t("admin.common.clearFilters")}
              </Button>
            ) : (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex"><Filter className="h-3.5 w-3.5" />{t("admin.common.filters")}</span>
            )}
          </div>
          <div className="flex items-center gap-2 lg:col-span-3">
            <Label htmlFor="o-from" className="shrink-0 text-xs text-muted-foreground">{t("admin.common.from")}</Label>
            <Input id="o-from" type="date" value={filters.from} onChange={(e) => setParam("from", e.target.value)} />
            <Label htmlFor="o-to" className="shrink-0 text-xs text-muted-foreground">{t("admin.common.to")}</Label>
            <Input id="o-to" type="date" value={filters.to} onChange={(e) => setParam("to", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {orders.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data!.rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={hasFilters ? t("common.noResults") : t("admin.orders.empty")}
            description={hasFilters ? t("admin.common.tryOtherFilters") : t("admin.orders.emptyHint")}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.orders.order")}</TableHead>
                    <TableHead>{t("admin.orders.customer")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("admin.orders.channel")}</TableHead>
                    <TableHead>{t("admin.orders.payment")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("admin.orders.fulfilment")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.data!.rows.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/orders/${o.id}`)}
                    >
                      <TableCell>
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="font-medium text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {o.order_number}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatDate(o.created_at, true)}</div>
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <div className="truncate">{o.shipping_name || o.customer?.full_name || t("admin.orders.walkIn")}</div>
                        <div className="truncate text-xs text-muted-foreground">{o.shipping_phone || o.customer?.phone || ""}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><ChannelBadge channel={o.channel} /></TableCell>
                      <TableCell><StatusBadge status={o.payment_status} /></TableCell>
                      <TableCell className="hidden sm:table-cell"><StatusBadge status={o.status} /></TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(o.total, o.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataPagination
              page={page}
              pageCount={pageCount}
              total={orders.data!.count}
              loading={orders.isFetching}
              onPage={(p) => setParam("page", String(p))}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default AdminOrders;
