import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, Ban, BadgeCheck, CreditCard, Loader2, MapPin, Package, Printer, RotateCcw, Send, StickyNote,
  Timer, Truck, User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, rpcErrorMessage } from "@/integrations/supabase/client";
import type { Order, OrderStatus, Payment } from "@/integrations/supabase/types";
import { payOrder } from "@/lib/payments";
import { isPaymentStale, serverPayMessage } from "@/lib/payment-state";
import { formatCountdown, usePaymentClock } from "@/hooks/usePaymentClock";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatSomaliPhone, maskPhone } from "@/lib/wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChannelBadge, ConfirmDialog, EmptyState, ErrorState, StatusBadge, WalletBadge } from "@/components/admin/shared";
import { RequestPaymentDialog } from "@/components/admin/RequestPaymentDialog";
import { ConfirmPaymentDialog, confirmablePayments } from "@/components/admin/ConfirmPaymentDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Owned by the POS workstream; loaded lazily so the receipt bundle stays out of the admin chunk.
const ReceiptPrint = lazy(() => import("@/components/receipt/Receipt").then((m) => ({ default: m.ReceiptPrint })));

const FULFILMENT: OrderStatus[] = ["processing", "shipped", "delivered"];

const Row = ({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) => (
  <div className={cn("flex items-center justify-between py-1 text-sm", strong && "text-base font-semibold")}>
    <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const PaymentTimeline = ({
  payments, canRefund, onReverse,
}: { payments: Payment[]; canRefund: boolean; onReverse: (p: Payment) => void }) => {
  const { t, formatMoney, formatDate } = useI18n();
  if (payments.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t("admin.orderDetail.noPayments")}</p>;
  }
  return (
    <ol className="relative space-y-5 border-l pl-5">
      {payments.map((p) => (
        <li key={p.id} className="relative">
          <span
            className={cn(
              "absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background",
              p.status === "approved" ? "bg-success" : p.status === "failed" || p.status === "cancelled" ? "bg-destructive"
                : p.status === "reversed" ? "bg-umber" : "bg-warning",
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2">
            <WalletBadge wallet={p.wallet} />
            <StatusBadge status={p.status} />
            <span className="ml-auto text-sm font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span>
          </div>
          <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
            <span>{formatDate(p.created_at, true)}</span>
            {p.account_no && <span>{t("admin.payments.account")}: <span className="font-mono">{maskPhone(p.account_no)}</span></span>}
            {p.transaction_id && <span>{t("admin.payments.txnId")}: <span className="font-mono">{p.transaction_id}</span></span>}
            {p.issuer_transaction_id && <span>{t("admin.payments.issuerTxn")}: <span className="font-mono">{p.issuer_transaction_id}</span></span>}
            <span>{t("admin.payments.reference")}: <span className="font-mono">{p.reference_id}</span></span>
          </div>
          {p.response_msg && (
            <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">
              {p.response_code ? <span className="font-mono">[{p.response_code}] </span> : null}{p.response_msg}
            </p>
          )}
          {canRefund && p.status === "approved" && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => onReverse(p)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t("admin.orderDetail.reverse")}
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
};

const AdminOrderDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { t, lang, formatMoney, formatDate } = useI18n();
  const { can, user } = useAuth();
  const qc = useQueryClient();

  const [nextStatus, setNextStatus] = useState<string>("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const key = ["admin", "order", id];
  const q = useQuery({
    queryKey: key,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customer:customers(id, full_name, phone, email), items:order_items(*), payments(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const o = data as Order;
      o.payments = [...(o.payments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return o;
    },
  });

  // Live updates for this order and its payments
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`admin-order-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "order", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "order", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "payments"] });
  };

  const statusMut = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.rpc("update_order_status", { p_order_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("admin.orderDetail.statusUpdated")); setNextStatus(""); refresh(); },
    onError: (e) => toast.error(rpcErrorMessage(e, lang)),
  });

  const order = q.data;
  const clock = usePaymentClock(order);
  const printing = params.get("print") === "1";
  const closePrint = () => setParams((p) => { const n = new URLSearchParams(p); n.delete("print"); return n; }, { replace: true });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (q.isError) return <Card className="mx-auto max-w-3xl"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (!order) {
    return (
      <Card className="mx-auto max-w-3xl">
        <EmptyState
          icon={Package}
          title={t("admin.orderDetail.notFound")}
          action={<Button variant="outline" onClick={() => navigate("/admin/orders")}>{t("common.back")}</Button>}
        />
      </Card>
    );
  }

  const isClosed = order.status === "cancelled" || order.status === "refunded";
  const canManage = can("orders.manage");
  // Unpaid/failed, or 'pending' whose newest attempt is past PAYMENT_STALE_MINUTES.
  const paymentOpen = order.payment_status === "unpaid" || order.payment_status === "failed" || isPaymentStale(order, clock.now);
  const canCancel = !isClosed && paymentOpen && (canManage || (order.created_by === user?.id && can("pos.use")));
  const canRequestPay = can("payments.initiate") && !isClosed && paymentOpen;
  const canConfirmManual = can("payments.refund") && !isClosed && order.payment_status !== "paid"
    && order.payment_status !== "refunded" && confirmablePayments(order.payments).length > 0;
  const isPaid = order.payment_status === "paid";
  const statusOptions = FULFILMENT.filter((s) => s !== order.status);
  const cur = order.currency;

  return (
    <div className="mx-auto max-w-6xl">
      <Dialog open={printing} onOpenChange={(o) => !o && closePrint()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("admin.orderDetail.receipt")}</DialogTitle>
            <DialogDescription>{order.order_number}</DialogDescription>
          </DialogHeader>
          <Suspense fallback={<Skeleton className="h-[420px] w-full max-w-[320px]" />}>
            {printing && <ReceiptPrint orderId={order.id} />}
          </Suspense>
        </DialogContent>
      </Dialog>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
            <Link to="/admin/orders"><ArrowLeft className="mr-1 h-4 w-4" />{t("admin.orders.title")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold md:text-3xl">{order.order_number}</h1>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} label={`${t("admin.orders.payment")}: ${t(`status.${order.payment_status}`)}`} />
            <ChannelBadge channel={order.channel} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.orderDetail.placed", { date: formatDate(order.created_at, true) })}
            {order.paid_at && <> · {t("admin.orderDetail.paidAt", { date: formatDate(order.paid_at, true) })}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("print", "1"); return n; })}>
            <Printer className="mr-2 h-4 w-4" /> {t("admin.orderDetail.print")}
          </Button>
          {canRequestPay && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Send className="mr-2 h-4 w-4" /> {t("admin.orderDetail.requestPayment")}
            </Button>
          )}
          {canConfirmManual && (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              <BadgeCheck className="mr-2 h-4 w-4" /> {t("admin.orderDetail.confirmManual")}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="mr-2 h-4 w-4" /> {t("admin.orderDetail.cancelOrder")}
            </Button>
          )}
        </div>
      </div>

      {order.needs_review && (
        <Alert variant="destructive" className="mb-4 border-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("admin.orderDetail.needsReview")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="whitespace-pre-wrap">{order.review_reason || t("admin.orderDetail.needsReviewDefault")}</span>
            {can("orders.manage") && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const { error } = await supabase.rpc("resolve_order_review", { p_order_id: order.id, p_note: null });
                  if (error) toast.error(rpcErrorMessage(error, lang));
                  else {
                    toast.success(t("admin.orderDetail.reviewResolved"));
                    qc.invalidateQueries({ queryKey: ["admin", "order", order.id] });
                  }
                }}
              >
                {t("admin.orderDetail.markResolved")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {clock.inFlight && !isClosed && (
        <Alert className="mb-4 border-warning/40 bg-warning/10" role="status" aria-live="polite">
          <Timer className="h-4 w-4 !text-warning" />
          <AlertTitle>{t("admin.orderDetail.inFlight")}</AlertTitle>
          <AlertDescription className="tabular-nums">{t("admin.orderDetail.inFlightDesc", { time: formatCountdown(clock.secondsLeft) })}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t("admin.orderDetail.items", { n: order.items?.length ?? 0 })}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(order.items ?? []).map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="m-3 h-6 w-6 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[it.sku, ...Object.entries(it.variants ?? {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <div className="tabular-nums text-muted-foreground">{it.quantity} × {formatMoney(it.unit_price, cur)}</div>
                      <div className="font-medium tabular-nums">{formatMoney(it.line_total, cur)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <Separator className="my-3" />
              <div className="ml-auto max-w-xs">
                <Row label={t("common.subtotal")} value={formatMoney(order.subtotal, cur)} />
                {Number(order.discount) > 0 && <Row label={t("common.discount")} value={`-${formatMoney(order.discount, cur)}`} />}
                <Row label={t("common.shipping")} value={formatMoney(order.shipping_fee, cur)} />
                <Row label={t("common.tax")} value={formatMoney(order.tax, cur)} />
                <Separator className="my-1" />
                <Row label={t("common.total")} value={formatMoney(order.total, cur)} strong />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-muted-foreground" />{t("admin.orderDetail.payments")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentTimeline payments={order.payments ?? []} canRefund={can("payments.refund")} onReverse={setReverseTarget} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {canManage && !isClosed && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-muted-foreground" />{t("admin.orderDetail.fulfilment")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={nextStatus} onValueChange={setNextStatus} disabled={!isPaid}>
                  <SelectTrigger aria-label={t("admin.orderDetail.changeStatus")}><SelectValue placeholder={t("admin.orderDetail.changeStatus")} /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!isPaid && <p className="text-xs text-muted-foreground">{t("admin.orderDetail.payFirst")}</p>}
                <Button className="w-full" disabled={!isPaid || !nextStatus || statusMut.isPending} onClick={() => statusMut.mutate(nextStatus)}>
                  {statusMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("admin.orderDetail.updateStatus")}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-muted-foreground" />{t("admin.orders.customer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.customer ? (
                <>
                  <p className="font-medium">{order.customer.full_name}</p>
                  {order.customer.phone && <p className="text-muted-foreground">{formatSomaliPhone(order.customer.phone)}</p>}
                  {can(["customers.view", "customers.manage"]) && (
                    <Button asChild variant="link" size="sm" className="h-auto p-0">
                      <Link to={`/admin/customers?open=${order.customer.id}`}>{t("admin.orderDetail.viewCustomer")}</Link>
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{t("admin.orders.walkIn")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-muted-foreground" />{t("admin.orderDetail.shipping")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5 text-sm">
              {order.shipping_name || order.shipping_address || order.shipping_phone ? (
                <>
                  {order.shipping_name && <p className="font-medium">{order.shipping_name}</p>}
                  {order.shipping_phone && <p>{formatSomaliPhone(order.shipping_phone)}</p>}
                  {order.shipping_address && <p className="text-muted-foreground">{order.shipping_address}</p>}
                  {(order.shipping_district || order.shipping_city) && (
                    <p className="text-muted-foreground">{[order.shipping_district, order.shipping_city].filter(Boolean).join(", ")}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{t("admin.orderDetail.noShipping")}</p>
              )}
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><StickyNote className="h-4 w-4 text-muted-foreground" />{t("admin.orderDetail.notes")}</CardTitle>
              </CardHeader>
              <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{order.notes}</p></CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("admin.orderDetail.cancelTitle", { order: order.order_number })}
        description={t("admin.orderDetail.cancelDesc")}
        confirmLabel={t("admin.orderDetail.cancelOrder")}
        withReason
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc("cancel_order", { p_order_id: order.id, p_reason: reason || null });
          if (error) { toast.error(rpcErrorMessage(error, lang)); throw error; }
          toast.success(t("admin.orderDetail.cancelled"));
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!reverseTarget}
        onOpenChange={(o) => !o && setReverseTarget(null)}
        title={t("admin.orderDetail.reverseTitle")}
        description={reverseTarget ? t("admin.orderDetail.reverseDesc", { amount: formatMoney(reverseTarget.amount, reverseTarget.currency) }) : undefined}
        confirmLabel={t("admin.orderDetail.reverse")}
        withReason
        reasonRequired
        onConfirm={async (reason) => {
          if (!reverseTarget) return;
          const res = await payOrder({ action: "reverse", order_id: order.id, payment_id: reverseTarget.id, reason });
          const msg = serverPayMessage(res, lang);
          if (!res.ok) { toast.error(msg || t("admin.payment.failed")); throw new Error(msg); }
          toast.success(msg || t("admin.orderDetail.reversed"));
          refresh();
        }}
      />

      <RequestPaymentDialog order={order} open={payOpen} onOpenChange={setPayOpen} onDone={() => refresh()} />
      {canConfirmManual && (
        <ConfirmPaymentDialog order={order} open={confirmOpen} onOpenChange={setConfirmOpen} onDone={() => refresh()} />
      )}
    </div>
  );
};

export default AdminOrderDetail;
