import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Clock, FileQuestion, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useMyOrder } from "@/hooks/store/useOrders";
import { formatCountdown, usePaymentClock } from "@/hooks/usePaymentClock";
import EmptyState from "@/components/store/EmptyState";
import OrderItemsList from "@/components/store/OrderItemsList";
import OrderTotals from "@/components/store/OrderTotals";
import PaymentsList from "@/components/store/PaymentsList";
import PayOrderPanel from "@/components/store/PayOrderPanel";
import CancelOrderButton from "@/components/store/CancelOrderButton";
import ShippingAddress from "@/components/store/ShippingAddress";
import { StatusBadge } from "@/components/store/OrderBadges";

interface LocationState {
  justPaid?: boolean;
  payError?: string;
}

const OrderStatus = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as LocationState;
  const { t, formatDate } = useI18n();
  const { data: order, isLoading, isError, refetch } = useMyOrder(id);
  const payErrorRef = useRef(state.payError ?? null);
  // Set when the last attempt ended without a gateway answer (code UNKNOWN / still pending).
  const [noAnswer, setNoAnswer] = useState(!!state.payError);
  const clock = usePaymentClock(order);

  // Drop one-shot router state so a refresh doesn't replay the error banner.
  useEffect(() => {
    if (state.payError || state.justPaid) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState icon={AlertCircle} title={t("store.errors.loadFailed")} action={<Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>} />;
  }
  if (!order) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={t("store.order.notFound")}
        action={<Button asChild><Link to="/account?tab=orders">{t("store.nav.orders")}</Link></Button>}
      />
    );
  }

  const paid = order.payment_status === "paid";
  const payable = clock.payable;
  const inProgress = clock.inFlight;
  const cancelled = order.status === "cancelled";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 lg:px-8">
      {/* Status hero */}
      {paid ? (
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success">
            <CheckCircle2 className="h-9 w-9 text-success-foreground" />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-bold md:text-3xl">{t("store.order.thanks")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("store.order.paidDesc")}</p>
          <p className="mt-3 text-sm">
            {t("store.order.number")}: <span className="font-mono text-base font-bold">{order.order_number}</span>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild><Link to="/products">{t("store.cart.continue")}</Link></Button>
            <Button asChild variant="outline"><Link to="/account?tab=orders">{t("store.nav.orders")}</Link></Button>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold md:text-3xl">
              {t("store.order.title")} <span className="font-mono">{order.order_number}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(order.created_at, true)}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} />
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {payable && (
            <section className="rounded-xl border border-border bg-card p-6" aria-labelledby="pay-title">
              <h2 id="pay-title" className="font-heading text-lg font-bold">{t("store.order.completePayment")}</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("store.order.completePaymentDesc")}</p>
              <PayOrderPanel
                order={order}
                initialError={payErrorRef.current}
                onPaid={() => { payErrorRef.current = null; void refetch(); }}
                onFailed={(res) => setNoAnswer(res.code === "UNKNOWN" || res.code === "PAYMENT_IN_PROGRESS" || res.status === "pending")}
              />
            </section>
          )}
          {inProgress && (
            <section className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-warning" />
              <div role="status" aria-live="polite">
                {noAnswer ? (
                  <>
                    <p className="font-semibold">{t("store.pay.unknownTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("store.pay.unknownDesc", { time: formatCountdown(clock.secondsLeft) })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{t("store.order.inProgress")}</p>
                    <p className="text-sm text-muted-foreground">{t("store.order.inProgressDesc")}</p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{t("store.pay.retryIn", { time: formatCountdown(clock.secondsLeft) })}</p>
                  </>
                )}
              </div>
            </section>
          )}
          {cancelled && (
            <section className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold">{t("store.order.cancelledTitle")}</p>
                <p className="text-sm text-muted-foreground">{order.cancelled_at ? formatDate(order.cancelled_at, true) : null}</p>
              </div>
            </section>
          )}
          {paid && !cancelled && (
            <section className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold">{t("store.order.statusLabel")}: {t(`status.${order.status}`)}</p>
                <p className="text-sm text-muted-foreground">{t("store.order.nextSteps")}</p>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-bold">{t("store.order.items")}</h2>
            <OrderItemsList items={order.items ?? []} currency={order.currency} />
          </section>

          {(order.payments?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-heading text-lg font-bold">{t("store.order.payments")}</h2>
              <PaymentsList payments={order.payments ?? []} />
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-heading text-sm font-bold">{t("store.cart.summary")}</h2>
            <OrderTotals className="mt-3" subtotal={order.subtotal} shipping={order.shipping_fee} tax={order.tax} discount={order.discount} total={order.total} currency={order.currency} />
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-2 font-heading text-sm font-bold">{t("store.checkout.deliverTo")}</h2>
            <ShippingAddress order={order} />
          </section>
          {payable && <CancelOrderButton orderId={order.id} orderNumber={order.order_number} className="w-full" />}
        </aside>
      </div>
    </div>
  );
};

export default OrderStatus;
