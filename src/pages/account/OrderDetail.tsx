import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, CreditCard, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useMyOrder } from "@/hooks/store/useOrders";
import { formatCountdown, usePaymentClock } from "@/hooks/usePaymentClock";
import EmptyState from "@/components/store/EmptyState";
import OrderItemsList from "@/components/store/OrderItemsList";
import OrderTotals from "@/components/store/OrderTotals";
import PaymentsList from "@/components/store/PaymentsList";
import CancelOrderButton from "@/components/store/CancelOrderButton";
import ShippingAddress from "@/components/store/ShippingAddress";
import { StatusBadge } from "@/components/store/OrderBadges";

const AccountOrderDetail = () => {
  const { id } = useParams();
  const { t, formatDate, formatMoney } = useI18n();
  const { data: order, isLoading, isError, refetch } = useMyOrder(id);
  const clock = usePaymentClock(order);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (isError) return <EmptyState icon={AlertCircle} title={t("store.errors.loadFailed")} action={<Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>} />;
  if (!order) return <EmptyState icon={FileQuestion} title={t("store.order.notFound")} action={<Button asChild><Link to="/account?tab=orders">{t("store.nav.orders")}</Link></Button>} />;

  const payable = clock.payable;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <Link to="/account?tab=orders" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("store.nav.orders")}
      </Link>
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

      {payable && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{t("store.account.awaitingPayment")}</p>
            <p className="text-sm text-muted-foreground">{t("store.order.completePaymentDesc")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/order/${order.id}`}><CreditCard className="mr-2 h-4 w-4" /> {t("store.pay.payNow", { amount: formatMoney(order.total, order.currency) })}</Link>
            </Button>
            <CancelOrderButton orderId={order.id} orderNumber={order.order_number} />
          </div>
        </div>
      )}

      {clock.inFlight && (
        <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 p-5" role="status" aria-live="polite">
          <p className="font-semibold">{t("store.order.inProgress")}</p>
          <p className="text-sm text-muted-foreground">{t("store.order.inProgressDesc")}</p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">{t("store.pay.retryIn", { time: formatCountdown(clock.secondsLeft) })}</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-bold">{t("store.order.items")}</h2>
            <OrderItemsList items={order.items ?? []} currency={order.currency} />
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 font-heading text-lg font-bold">{t("store.order.payments")}</h2>
            <PaymentsList payments={order.payments ?? []} />
          </section>
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
        </aside>
      </div>
    </div>
  );
};

export default AccountOrderDetail;
