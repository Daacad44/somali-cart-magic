import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, DollarSign, Minus, Package, ScanBarcode, ShoppingBag, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardStats, Order } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { WALLET_LABELS } from "@/lib/wallet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/admin/shared";
import { firstAllowedPath } from "@/components/admin/nav";
import { percentChange } from "@/components/admin/utils";
import { useStoreSettings } from "@/hooks/admin/useStoreData";

type Range = 7 | 30 | 90;

const Delta = ({ value }: { value: number | null }) => {
  const { t } = useI18n();
  if (value === null) return <span className="text-xs text-muted-foreground">{t("admin.dashboard.noBaseline")}</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {value > 0 ? "+" : ""}{value}% <span className="ml-1 font-normal text-muted-foreground">{t("admin.dashboard.vsPrev")}</span>
    </span>
  );
};

const Kpi = ({
  label, value, icon: Icon, footer, to,
}: { label: string; value: string; icon: typeof DollarSign; footer?: React.ReactNode; to?: string }) => {
  const body = (
    <Card className={cn("h-full transition-colors", to && "hover:border-primary/40")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-soft text-navy">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        <div className="mt-1 min-h-[1rem]">{footer}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">{body}</Link> : body;
};

const DashboardSkeleton = () => (
  <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-[300px] rounded-lg" />
      <Skeleton className="h-[300px] rounded-lg" />
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[240px] rounded-lg" />)}
    </div>
  </div>
);

const AdminDashboard = () => {
  const { can } = useAuth();
  const { t, formatMoney, formatDate, lang } = useI18n();
  const [days, setDays] = useState<Range>(30);
  const { data: settings } = useStoreSettings();
  const currency = settings?.currency ?? "USD";
  const allowed = can("dashboard.view");
  const canOrders = can(["orders.view", "orders.manage"]);

  const stats = useQuery({
    queryKey: ["admin", "dashboard", days],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats", { p_days: days });
      if (error) throw error;
      return data as DashboardStats;
    },
  });

  const recent = useQuery({
    queryKey: ["admin", "dashboard", "recent-orders"],
    enabled: allowed && canOrders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, shipping_name, total, currency, status, payment_status, channel, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  if (!allowed) {
    const next = firstAllowedPath(can);
    if (next && next !== "/admin") return <Navigate to={next} replace />;
    return <EmptyState title={t("common.forbidden")} />;
  }

  const s = stats.data;
  const money = (n: number) => formatMoney(n, currency);
  const dayFmt = (d: string) =>
    new Date(d).toLocaleDateString(lang === "so" ? "so-SO" : "en-GB", { day: "numeric", month: "short" });

  const revenueConfig: ChartConfig = { revenue: { label: t("admin.dashboard.revenue"), color: "hsl(var(--primary))" } };
  const ordersConfig: ChartConfig = { orders: { label: t("admin.dashboard.orders"), color: "hsl(var(--secondary))" } };
  const daily = (s?.daily ?? []).map((d) => ({ ...d, revenue: Number(d.revenue), orders: Number(d.orders) }));

  const walletTotal = (s?.by_wallet ?? []).reduce((a, w) => a + Number(w.amount), 0);
  const channelTotal = (s?.by_channel ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const channel = (c: "online" | "pos") => s?.by_channel.find((x) => x.channel === c) ?? { channel: c, count: 0, amount: 0 };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.subtitle")}
        actions={
          <>
            <ToggleGroup
              type="single"
              value={String(days)}
              onValueChange={(v) => v && setDays(Number(v) as Range)}
              variant="outline"
              size="sm"
              aria-label={t("admin.dashboard.range")}
            >
              {[7, 30, 90].map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="px-3">
                  {t("admin.dashboard.days", { n: d })}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {can("pos.use") && (
              <Button asChild size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                <Link to="/admin/pos"><ScanBarcode className="mr-2 h-4 w-4" />{t("admin.nav.pos")}</Link>
              </Button>
            )}
          </>
        }
      />

      {stats.isLoading ? (
        <DashboardSkeleton />
      ) : stats.isError || !s ? (
        <Card><ErrorState error={stats.error} onRetry={() => stats.refetch()} /></Card>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label={t("admin.dashboard.revenue")}
              value={money(Number(s.revenue))}
              icon={DollarSign}
              footer={<Delta value={percentChange(Number(s.revenue), Number(s.revenue_prev))} />}
            />
            <Kpi
              label={t("admin.dashboard.orders")}
              value={String(s.orders)}
              icon={ShoppingBag}
              footer={<Delta value={percentChange(Number(s.orders), Number(s.orders_prev))} />}
              to={canOrders ? "/admin/orders" : undefined}
            />
            <Kpi
              label={t("admin.dashboard.customers")}
              value={String(s.customers)}
              icon={Users}
              footer={<span className="text-xs text-muted-foreground">{t("admin.dashboard.newCustomers", { n: s.new_customers })}</span>}
            />
            <Kpi
              label={t("admin.dashboard.pendingPayments")}
              value={String(s.pending_payments)}
              icon={Clock}
              footer={
                <span className="text-xs text-muted-foreground">
                  {t("admin.dashboard.paidOrders", { n: s.paid_orders })} · {t("admin.dashboard.activeProducts", { n: s.products })}
                </span>
              }
              to={can(["orders.view", "payments.refund", "reports.view"]) ? "/admin/payments?status=open" : undefined}
            />
          </div>

          {/* Daily charts — two single-measure charts instead of a dual axis */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("admin.dashboard.revenueDaily")}</CardTitle>
                <CardDescription>{t("admin.dashboard.lastDays", { n: days })}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={revenueConfig} className="aspect-auto h-[240px] w-full">
                  <AreaChart data={daily} margin={{ left: 4, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickFormatter={dayFmt} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(Number(v)).replace(/\.00$/, "")} />
                    <ChartTooltip
                      content={<ChartTooltipContent labelFormatter={(v) => formatDate(String(v))} formatter={(v) => money(Number(v))} />}
                    />
                    <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} fill="url(#revFill)" />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("admin.dashboard.ordersDaily")}</CardTitle>
                <CardDescription>{t("admin.dashboard.lastDays", { n: days })}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={ordersConfig} className="aspect-auto h-[240px] w-full">
                  <BarChart data={daily} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickFormatter={dayFmt} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatDate(String(v))} />} />
                    <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown row */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.dashboard.byWallet")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.by_wallet.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.dashboard.noPayments")}</p>
                ) : (
                  s.by_wallet.map((w) => {
                    const pct = walletTotal ? (Number(w.amount) / walletTotal) * 100 : 0;
                    return (
                      <div key={w.wallet ?? "none"}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">{w.wallet ? WALLET_LABELS[w.wallet] ?? w.wallet : "—"}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {money(Number(w.amount))} · {w.count}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.dashboard.byChannel")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(["online", "pos"] as const).map((c) => {
                  const row = channel(c);
                  const pct = channelTotal ? Math.round((Number(row.amount) / channelTotal) * 100) : 0;
                  return (
                    <div key={c} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t(`admin.channel.${c}`)}</span>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{money(Number(row.amount))}</p>
                      <p className="text-xs text-muted-foreground">{t("admin.dashboard.ordersCount", { n: row.count })}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", c === "pos" ? "bg-secondary" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> {t("admin.dashboard.lowStock")}
                </CardTitle>
                {can("products.manage") && (
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link to="/admin/products?stock=low">{t("admin.common.viewAll")}</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {s.low_stock.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.dashboard.stockHealthy")}</p>
                ) : (
                  <ul className="divide-y">
                    {s.low_stock.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="truncate">{p.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-2 py-0.5 text-xs font-semibold tabular-nums",
                            p.stock === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {p.stock === 0 ? t("admin.products.outOfStock") : t("admin.dashboard.left", { n: p.stock })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top products + recent orders */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-muted-foreground" aria-hidden /> {t("admin.dashboard.topProducts")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s.top_products.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.dashboard.noSales")}</p>
                ) : (
                  <ol className="space-y-3">
                    {s.top_products.map((p, i) => (
                      <li key={`${p.product_id}-${i}`} className="flex items-center gap-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{p.product_name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">×{p.quantity}</span>
                        <span className="w-20 shrink-0 text-right font-medium tabular-nums">{money(Number(p.amount))}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">{t("admin.dashboard.recentOrders")}</CardTitle>
                {canOrders && (
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link to="/admin/orders">{t("admin.common.viewAll")}</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {!canOrders ? (
                  <p className="px-6 py-6 text-center text-sm text-muted-foreground">{t("common.forbidden")}</p>
                ) : recent.isLoading ? (
                  <div className="space-y-2 px-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : recent.isError ? (
                  <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
                ) : (recent.data ?? []).length === 0 ? (
                  <EmptyState title={t("admin.orders.empty")} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">{t("admin.orders.order")}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t("admin.orders.customer")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead className="pr-6 text-right">{t("common.total")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.data!.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="pl-6">
                            <Link to={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.order_number}</Link>
                            <div className="text-xs text-muted-foreground">{formatDate(o.created_at, true)}</div>
                          </TableCell>
                          <TableCell className="hidden max-w-[10rem] truncate sm:table-cell">{o.shipping_name || "—"}</TableCell>
                          <TableCell><StatusBadge status={o.payment_status} /></TableCell>
                          <TableCell className="pr-6 text-right font-medium tabular-nums">{formatMoney(o.total, o.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
