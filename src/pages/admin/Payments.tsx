import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Download, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Payment } from "@/integrations/supabase/types";
import { payOrder } from "@/lib/payments";
import { serverPayMessage } from "@/lib/payment-state";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { maskPhone, WALLET_LABELS } from "@/lib/wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ConfirmDialog, DataPagination, EmptyState, ErrorState, PageHeader, StatusBadge, TableSkeleton, WalletBadge,
} from "@/components/admin/shared";
import { dateRangeToQuery, downloadCsv, pageToRange, toCsv, totalPages } from "@/components/admin/utils";
import { useStoreSettings } from "@/hooks/admin/useStoreData";

const PAGE_SIZE = 25;
const ALL = "all";
const STATUSES = ["initiated", "pending", "approved", "failed", "cancelled", "reversed"] as const;
const WALLETS = ["EVC_PLUS", "ZAAD", "SAHAL", "WAAFI", "JEEB", "EDAHAB", "CASH"] as const;

type PaymentRow = Payment & { order?: { id: string; order_number: string; shipping_name: string | null } | null };

interface Filters { status: string; wallet: string; from: string; to: string }

function applyFilters<Q>(query: Q, f: Filters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (f.status === "open") q = q.in("status", ["initiated", "pending"]);
  else if (f.status !== ALL) q = q.eq("status", f.status);
  if (f.wallet !== ALL) q = q.eq("wallet", f.wallet);
  const r = dateRangeToQuery(f.from, f.to);
  if (r.gte) q = q.gte("created_at", r.gte);
  if (r.lt) q = q.lt("created_at", r.lt);
  return q as Q;
}

const AdminPayments = () => {
  const { t, lang, formatMoney, formatDate } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [reverse, setReverse] = useState<PaymentRow | null>(null);
  const { data: settings } = useStoreSettings();
  const currency = settings?.currency ?? "USD";

  const filters: Filters = useMemo(() => ({
    status: params.get("status") ?? ALL,
    wallet: params.get("wallet") ?? ALL,
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  }), [params]);
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const setParam = (k: string, v: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (!v || v === ALL) n.delete(k); else n.set(k, v);
    if (k !== "page") n.delete("page");
    return n;
  }, { replace: true });

  const list = useQuery({
    queryKey: ["admin", "payments", filters, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageToRange(page, PAGE_SIZE);
      const base = supabase.from("payments").select("*, order:orders(id, order_number, shipping_name)", { count: "exact" });
      const { data, error, count } = await applyFilters(base, filters).order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as PaymentRow[], count: count ?? 0 };
    },
  });

  // Approved totals by wallet for the current date/wallet filters (status filter ignored on purpose).
  const totals = useQuery({
    queryKey: ["admin", "payments", "totals", filters.wallet, filters.from, filters.to],
    queryFn: async () => {
      const base = supabase.from("payments").select("wallet, amount").eq("status", "approved");
      const { data, error } = await applyFilters(base, { ...filters, status: ALL }).limit(10000);
      if (error) throw error;
      const m = new Map<string, { amount: number; count: number }>();
      for (const r of (data ?? []) as { wallet: string | null; amount: number }[]) {
        const k = r.wallet ?? "—";
        const cur = m.get(k) ?? { amount: 0, count: 0 };
        cur.amount += Number(r.amount); cur.count += 1;
        m.set(k, cur);
      }
      return [...m.entries()].map(([wallet, v]) => ({ wallet, ...v })).sort((a, b) => b.amount - a.amount);
    },
  });

  const grand = (totals.data ?? []).reduce((a, r) => a + r.amount, 0);
  const hasFilters = filters.status !== ALL || filters.wallet !== ALL || filters.from || filters.to;
  const canRefund = can("payments.refund");

  const exportCsv = async () => {
    const base = supabase.from("payments").select("*, order:orders(order_number)");
    const { data, error } = await applyFilters(base, filters).order("created_at", { ascending: false }).limit(5000);
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as PaymentRow[];
    downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, [
      { header: "created_at", value: (r) => r.created_at },
      { header: "order", value: (r) => r.order?.order_number },
      { header: "wallet", value: (r) => r.wallet },
      { header: "account", value: (r) => (r.account_no ? maskPhone(r.account_no) : "") },
      { header: "amount", value: (r) => r.amount },
      { header: "currency", value: (r) => r.currency },
      { header: "status", value: (r) => r.status },
      { header: "transaction_id", value: (r) => r.transaction_id },
      { header: "reference_id", value: (r) => r.reference_id },
      { header: "response", value: (r) => r.response_msg },
    ]));
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.payments.title")}
        description={t("admin.payments.subtitle")}
        actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!list.data?.count}><Download className="mr-2 h-4 w-4" />{t("admin.common.exportCsv")}</Button>}
      />

      {/* Totals by wallet */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-lg" />)
        ) : (
          <>
            <Card className="border-primary/30 bg-navy-soft/50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{t("admin.payments.approvedTotal")}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(grand, currency)}</p>
              </CardContent>
            </Card>
            {(totals.data ?? []).slice(0, 7).map((r) => (
              <Card key={r.wallet}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">{WALLET_LABELS[r.wallet as keyof typeof WALLET_LABELS] ?? r.wallet}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(r.amount, currency)}</p>
                  <p className="text-xs text-muted-foreground">{t("admin.payments.txCount", { n: r.count })}</p>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,1fr))_auto_auto_auto]">
          <Select value={filters.status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger aria-label={t("common.status")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.common.allStatuses")}</SelectItem>
              <SelectItem value="open">{t("admin.payments.open")}</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.wallet} onValueChange={(v) => setParam("wallet", v)}>
            <SelectTrigger aria-label={t("common.wallet")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.payments.allWallets")}</SelectItem>
              {WALLETS.map((w) => <SelectItem key={w} value={w}>{WALLET_LABELS[w]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="p-from" className="shrink-0 text-xs text-muted-foreground">{t("admin.common.from")}</Label>
            <Input id="p-from" type="date" value={filters.from} onChange={(e) => setParam("from", e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="p-to" className="shrink-0 text-xs text-muted-foreground">{t("admin.common.to")}</Label>
            <Input id="p-to" type="date" value={filters.to} onChange={(e) => setParam("to", e.target.value)} />
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}><X className="mr-1 h-4 w-4" />{t("admin.common.clearFilters")}</Button>
          ) : <span />}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title={hasFilters ? t("common.noResults") : t("admin.payments.empty")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("admin.orders.order")}</TableHead>
                    <TableHead>{t("common.wallet")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("admin.payments.account")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("admin.payments.txnId")}</TableHead>
                    <TableHead className="text-right">{t("admin.payments.amount")}</TableHead>
                    {canRefund && <TableHead className="w-10"><span className="sr-only">{t("common.actions")}</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data!.rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(p.created_at, true)}</TableCell>
                      <TableCell>
                        {p.order ? (
                          <Link to={`/admin/orders/${p.order.id}`} className="font-medium text-primary hover:underline">{p.order.order_number}</Link>
                        ) : "—"}
                        {p.order?.shipping_name && <div className="max-w-[10rem] truncate text-xs text-muted-foreground">{p.order.shipping_name}</div>}
                      </TableCell>
                      <TableCell><WalletBadge wallet={p.wallet} /></TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">{p.account_no ? maskPhone(p.account_no) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                        {p.status === "failed" && p.response_msg && <div className="mt-0.5 max-w-[12rem] truncate text-xs text-muted-foreground" title={p.response_msg}>{p.response_msg}</div>}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{p.transaction_id ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</TableCell>
                      {canRefund && (
                        <TableCell>
                          {p.status === "approved" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReverse(p)} aria-label={t("admin.orderDetail.reverse")} title={t("admin.orderDetail.reverse")}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataPagination page={page} pageCount={totalPages(list.data!.count, PAGE_SIZE)} total={list.data!.count} loading={list.isFetching} onPage={(p) => setParam("page", String(p))} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!reverse}
        onOpenChange={(o) => !o && setReverse(null)}
        title={t("admin.orderDetail.reverseTitle")}
        description={reverse ? t("admin.orderDetail.reverseDesc", { amount: formatMoney(reverse.amount, reverse.currency) }) : undefined}
        confirmLabel={t("admin.orderDetail.reverse")}
        withReason
        reasonRequired
        onConfirm={async (reason) => {
          if (!reverse) return;
          const res = await payOrder({ action: "reverse", order_id: reverse.order_id, payment_id: reverse.id, reason });
          const msg = serverPayMessage(res, lang);
          if (!res.ok) { toast.error(msg || t("admin.payment.failed")); throw new Error(msg); }
          toast.success(msg || t("admin.orderDetail.reversed"));
          qc.invalidateQueries({ queryKey: ["admin", "payments"] });
          qc.invalidateQueries({ queryKey: ["admin", "order", reverse.order_id] });
        }}
      />
    </div>
  );
};

export default AdminPayments;
