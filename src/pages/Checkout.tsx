import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Check, CreditCard, MapPin, Pencil, ShoppingCart, Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase, rpcErrorMessage } from "@/integrations/supabase/client";
import type { Order } from "@/integrations/supabase/types";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { previewTotals } from "@/lib/cart-utils";
import { WALLET_LABELS, formatSomaliPhone, normalizeSomaliPhone } from "@/lib/wallet";
import { useStoreSettings } from "@/hooks/store/useCatalog";
import { useMyCustomer } from "@/hooks/store/useCustomer";
import { usePayErrorMessage, usePayOrder } from "@/hooks/store/usePayOrder";
import { productImage } from "@/hooks/store/query-utils";
import EmptyState from "@/components/store/EmptyState";
import OrderTotals from "@/components/store/OrderTotals";
import CartNotice from "@/components/store/CartNotice";
import PaymentWaiting from "@/components/store/PaymentWaiting";
import WalletPhoneInput from "@/components/store/WalletPhoneInput";
import { useWalletDetection } from "@/hooks/store/useWalletDetection";

type Step = "shipping" | "payment";

function useShippingSchema() {
  const { t } = useI18n();
  return useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t("store.checkout.v.name")).max(100),
        phone: z.string().trim().refine((v) => !!normalizeSomaliPhone(v), t("store.v.phone")),
        city: z.string().trim().min(2, t("store.checkout.v.city")).max(60),
        district: z.string().trim().max(60).optional().or(z.literal("")),
        address: z.string().trim().min(3, t("store.checkout.v.address")).max(200),
        notes: z.string().trim().max(500).optional().or(z.literal("")),
      }),
    [t],
  );
}
type ShippingValues = z.infer<ReturnType<typeof useShippingSchema>>;

const Checkout = () => {
  const { items, subtotal, clearCart, revalidate, revalidating } = useCart();
  const { profile } = useAuth();
  const { t, lang, pick, formatMoney } = useI18n();
  const navigate = useNavigate();
  const { data: settings } = useStoreSettings();
  const customer = useMyCustomer();
  const schema = useShippingSchema();
  const { pay, paying, startedAt } = usePayOrder();
  const payErrorMessage = usePayErrorMessage();

  const [step, setStep] = useState<Step>("shipping");
  const [shipping, setShipping] = useState<ShippingValues | null>(null);
  const [payPhone, setPayPhone] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const detection = useWalletDetection(payPhone);

  const currency = settings?.currency ?? "USD";
  const totals = previewTotals(subtotal, settings);

  const form = useForm<ShippingValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", city: "", district: "", address: "", notes: "" },
  });

  // Make sure prices/stock are fresh before the customer reviews the order.
  useEffect(() => {
    void revalidate();
  }, [revalidate]);

  // Prefill from the customer profile (only if the user hasn't typed yet).
  useEffect(() => {
    if (form.formState.isDirty) return;
    const c = customer.data;
    if (!c && !profile) return;
    form.reset({
      name: c?.full_name || profile?.full_name || "",
      phone: c?.phone || profile?.phone || "",
      city: c?.city || "",
      district: c?.district || "",
      address: c?.address || "",
      notes: "",
    });
  }, [customer.data, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const onShippingSubmit = (values: ShippingValues) => {
    setShipping(values);
    if (!payPhone) setPayPhone(values.phone);
    setStep("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const placeOrder = async () => {
    if (!shipping || placing || !detection.canPay || !detection.normalized) return;
    setPlacing(true);
    const shipPhone = normalizeSomaliPhone(shipping.phone) ?? shipping.phone;
    let order: Order;
    try {
      const { data, error } = await supabase.rpc("create_order", {
        p_items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity, variants: i.variants })),
        p_shipping: {
          name: shipping.name,
          phone: shipPhone,
          address: shipping.address,
          city: shipping.city,
          district: shipping.district || null,
          notes: shipping.notes || null,
        },
        p_channel: "online",
      });
      if (error) throw error;
      order = data as Order;
    } catch (err) {
      toast.error(rpcErrorMessage(err, lang));
      void revalidate();
      setPlacing(false);
      return;
    }

    // The order now holds the items (with server prices): empty the cart so it can't be ordered twice.
    setCreatedOrder(order);
    clearCart();

    if (saveAddress && customer.data) {
      customer.update.mutate({
        full_name: shipping.name,
        phone: shipPhone,
        address: shipping.address,
        city: shipping.city,
        district: shipping.district || null,
      });
    }

    const res = await pay(order.id, detection.normalized);
    setPlacing(false);
    if (res.ok) {
      toast.success(t("store.pay.success"));
      navigate(`/order/${order.id}`, { replace: true, state: { justPaid: true } });
    } else {
      navigate(`/order/${order.id}`, { replace: true, state: { payError: payErrorMessage(res) } });
    }
  };

  // While an order is being paid the cart is already empty — keep showing the waiting state.
  if (createdOrder) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-3">{t("store.checkout.orderCreated", { number: createdOrder.order_number })}</p>
        </div>
        <PaymentWaiting
          open={paying}
          startedAt={startedAt}
          walletLabel={detection.wallet ? WALLET_LABELS[detection.wallet.wallet] : null}
          phone={detection.normalized}
          amount={formatMoney(createdOrder.total, createdOrder.currency)}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title={t("store.checkout.emptyTitle")}
        description={t("store.cart.emptyDesc")}
        action={<Button asChild><Link to="/products">{t("store.cart.startShopping")}</Link></Button>}
      />
    );
  }

  const steps: { id: Step; label: string }[] = [
    { id: "shipping", label: t("store.checkout.stepShipping") },
    { id: "payment", label: t("store.checkout.stepPayment") },
  ];
  const stepIdx = steps.findIndex((s) => s.id === step);

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Link to="/cart" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("store.checkout.backToCart")}
      </Link>
      <h1 className="font-heading text-3xl font-bold">{t("store.checkout.title")}</h1>

      <ol className="mt-6 flex items-center gap-2 text-sm" aria-label={t("store.checkout.progress")}>
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2" aria-current={step === s.id ? "step" : undefined}>
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                step === s.id ? "bg-primary text-primary-foreground" : i < stepIdx ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={step === s.id ? "font-semibold text-foreground" : "text-muted-foreground"}>{s.label}</span>
            {i < steps.length - 1 && <div className="mx-1 h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      <div className="mt-4"><CartNotice /></div>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {step === "shipping" && (
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-6">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                <MapPin className="h-5 w-5 text-accent" aria-hidden /> {t("store.checkout.shippingTitle")}
              </h2>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onShippingSubmit)} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("store.checkout.fullName")}</FormLabel>
                      <FormControl><Input autoComplete="name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.phone")}</FormLabel>
                      <FormControl><Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+252 61 234 5678" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("store.checkout.city")}</FormLabel>
                      <FormControl><Input autoComplete="address-level2" placeholder={t("store.checkout.cityPh")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="district" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("store.checkout.district")}</FormLabel>
                      <FormControl><Input autoComplete="address-level3" placeholder={t("store.checkout.districtPh")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("store.checkout.address")}</FormLabel>
                      <FormControl><Input autoComplete="street-address" placeholder={t("store.checkout.addressPh")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("store.checkout.notes")}</FormLabel>
                      <FormControl><Textarea rows={3} placeholder={t("store.checkout.notesPh")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {customer.data && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Checkbox id="save-address" checked={saveAddress} onCheckedChange={(v) => setSaveAddress(v === true)} />
                      <Label htmlFor="save-address" className="text-sm font-normal">{t("store.checkout.saveAddress")}</Label>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Button type="submit" size="lg">{t("store.checkout.continueToPayment")}</Button>
                  </div>
                </form>
              </Form>
            </motion.section>
          )}

          {step === "payment" && shipping && (
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                    <MapPin className="h-5 w-5 text-accent" aria-hidden /> {t("store.checkout.deliverTo")}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setStep("shipping")} disabled={placing}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> {t("common.edit")}
                  </Button>
                </div>
                <address className="mt-2 text-sm not-italic text-muted-foreground">
                  <span className="font-semibold text-foreground">{shipping.name}</span> · {formatSomaliPhone(shipping.phone)}<br />
                  {shipping.address}, {[shipping.district, shipping.city].filter(Boolean).join(", ")}
                  {shipping.notes && <><br /><em>{shipping.notes}</em></>}
                </address>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                  <CreditCard className="h-5 w-5 text-accent" aria-hidden /> {t("store.checkout.paymentTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("store.checkout.paymentDesc")}</p>
                <div className="mt-4">
                  <WalletPhoneInput value={payPhone} onChange={setPayPhone} detection={detection} disabled={placing} />
                </div>
                <Button
                  size="lg"
                  variant="secondary"
                  className="mt-4 w-full font-bold"
                  disabled={placing || revalidating || !detection.canPay}
                  onClick={placeOrder}
                >
                  {placing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  {t("store.checkout.placeOrder", { amount: formatMoney(totals.total, currency) })}
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">{t("store.checkout.placeOrderHint")}</p>
              </div>
            </motion.section>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-20">
          <h2 className="font-heading text-sm font-bold">{t("store.cart.summary")}</h2>
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.key} className="flex gap-3 text-sm">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  <img src={productImage(item.product.images)} alt="" className="h-full w-full object-cover" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{item.quantity}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-medium">{pick(item.product.name, item.product.name_so)}</p>
                  {Object.keys(item.variants).length > 0 && (
                    <p className="text-xs text-muted-foreground">{Object.values(item.variants).join(" · ")}</p>
                  )}
                </div>
                <span className="tabular-nums">{formatMoney(item.product.price * item.quantity, currency)}</span>
              </li>
            ))}
          </ul>
          <OrderTotals className="mt-4 border-t border-border pt-4" subtotal={totals.subtotal} shipping={totals.shipping} tax={totals.tax} total={totals.total} currency={currency} estimated />
        </aside>
      </div>
    </div>
  );
};

export default Checkout;
