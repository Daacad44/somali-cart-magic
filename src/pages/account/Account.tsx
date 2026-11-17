import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, ChevronRight, Heart, KeyRound, Loader2, Package, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { rpcErrorMessage } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { normalizeSomaliPhone } from "@/lib/wallet";
import { useMyCustomer } from "@/hooks/store/useCustomer";
import { isOrderPayable, useMyOrders } from "@/hooks/store/useOrders";
import { productImage } from "@/hooks/store/query-utils";
import EmptyState from "@/components/store/EmptyState";
import { StatusBadge } from "@/components/store/OrderBadges";

const ProfileTab = () => {
  const { t, lang } = useI18n();
  const { user, profile } = useAuth();
  const customer = useMyCustomer();
  const schema = useMemo(() => z.object({
    full_name: z.string().trim().min(2, t("store.checkout.v.name")).max(100),
    phone: z.string().trim().refine((v) => v === "" || !!normalizeSomaliPhone(v), t("store.v.phone")),
    city: z.string().trim().max(60),
    district: z.string().trim().max(60),
    address: z.string().trim().max(200),
  }), [t]);
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", phone: "", city: "", district: "", address: "" } });

  useEffect(() => {
    if (form.formState.isDirty) return;
    const c = customer.data;
    form.reset({
      full_name: c?.full_name || profile?.full_name || "",
      phone: c?.phone || profile?.phone || "",
      city: c?.city || "",
      district: c?.district || "",
      address: c?.address || "",
    });
  }, [customer.data, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async (v) => {
    try {
      await customer.update.mutateAsync({
        full_name: v.full_name,
        phone: v.phone ? normalizeSomaliPhone(v.phone) : null,
        city: v.city || null,
        district: v.district || null,
        address: v.address || null,
      });
      form.reset(v);
      toast.success(t("store.account.saved"));
    } catch (e) {
      toast.error(rpcErrorMessage(e, lang));
    }
  });

  if (customer.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField control={form.control} name="full_name" render={({ field }) => (
          <FormItem><FormLabel>{t("store.checkout.fullName")}</FormLabel><FormControl><Input autoComplete="name" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>{t("common.phone")}</FormLabel><FormControl><Input type="tel" inputMode="tel" placeholder="+252 61 234 5678" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="acc-email">{t("common.email")}</label>
          <Input id="acc-email" value={user?.email ?? ""} disabled readOnly />
        </div>
        {customer.data && (
          <>
            <FormField control={form.control} name="city" render={({ field }) => (
              <FormItem><FormLabel>{t("store.checkout.city")}</FormLabel><FormControl><Input autoComplete="address-level2" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="district" render={({ field }) => (
              <FormItem><FormLabel>{t("store.checkout.district")}</FormLabel><FormControl><Input autoComplete="address-level3" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem className="sm:col-span-2"><FormLabel>{t("store.checkout.address")}</FormLabel><FormControl><Input autoComplete="street-address" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("common.save")}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/auth?mode=update-password"><KeyRound className="mr-2 h-4 w-4" /> {t("store.account.changePassword")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  );
};

const OrdersTab = () => {
  const { t, formatMoney, formatDate } = useI18n();
  const { data: orders, isLoading, isError, refetch } = useMyOrders();

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  if (isError) return <EmptyState icon={AlertCircle} title={t("store.errors.loadFailed")} action={<Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>} />;
  if (!orders?.length) {
    return (
      <EmptyState
        icon={Package}
        title={t("store.account.noOrders")}
        description={t("store.account.noOrdersDesc")}
        action={<Button asChild><Link to="/products">{t("store.cart.startShopping")}</Link></Button>}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const count = (o.items ?? []).reduce((s, i) => s + i.quantity, 0);
        return (
          <li key={o.id}>
            <Link to={`/account/orders/${o.id}`} className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-premium">
              <div className="flex -space-x-3">
                {(o.items ?? []).slice(0, 3).map((i) => (
                  <img key={i.id} src={productImage(i.image ? [i.image] : [])} alt="" className="h-12 w-12 rounded-lg border-2 border-card bg-muted object-cover" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{o.order_number}</span>
                  <StatusBadge status={o.status} />
                  {o.payment_status !== "paid" && o.status !== "cancelled" && <StatusBadge status={o.payment_status} />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(o.created_at)} · {t("store.account.itemsCount", { n: count })}
                </p>
                {isOrderPayable(o) && <p className="mt-1 text-xs font-medium text-warning">{t("store.account.awaitingPayment")}</p>}
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</p>
                <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

const Account = () => {
  const { t } = useI18n();
  const { profile, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "orders" ? "orders" : "profile";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">{t("store.nav.myAccount")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("store.account.hello", { name: profile?.full_name || user?.email || "" })}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/wishlist"><Heart className="mr-2 h-4 w-4" /> {t("store.nav.wishlist")}</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams(v === "profile" ? {} : { tab: v }, { replace: true })} className="mt-6">
        <TabsList>
          <TabsTrigger value="profile"><User className="mr-2 h-4 w-4" /> {t("store.account.profile")}</TabsTrigger>
          <TabsTrigger value="orders"><Package className="mr-2 h-4 w-4" /> {t("store.nav.orders")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6 rounded-xl border border-border bg-card p-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-6">
          <OrdersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Account;
