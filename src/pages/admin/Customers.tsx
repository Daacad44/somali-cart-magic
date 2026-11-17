import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, ShoppingBag, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Customer, Order } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSomaliPhone, normalizeSomaliPhone } from "@/lib/wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { DataPagination, EmptyState, ErrorState, PageHeader, StatusBadge, TableSkeleton } from "@/components/admin/shared";
import { pageToRange, sanitizeSearch, totalPages } from "@/components/admin/utils";
import { useDebounced } from "@/hooks/admin/useDebounced";
import { useStoreSettings } from "@/hooks/admin/useStoreData";

const PAGE_SIZE = 20;

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().optional().refine((v) => !v || !!normalizeSomaliPhone(v), { message: "phone" }),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});
type Values = z.infer<typeof schema>;

const toValues = (c?: Customer | null): Values => ({
  full_name: c?.full_name ?? "",
  phone: c?.phone ? formatSomaliPhone(c.phone) : "",
  email: c?.email ?? "",
  address: c?.address ?? "",
  city: c?.city ?? "",
  district: c?.district ?? "",
  notes: c?.notes ?? "",
});

const CustomerDialog = ({
  open, onOpenChange, customer, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; customer: Customer | null; onSaved: (c: Customer) => void }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(customer) });
  useEffect(() => { if (open) form.reset(toValues(customer)); }, [open, customer, form]);

  const submit = async (v: Values) => {
    const phone = v.phone ? normalizeSomaliPhone(v.phone) : null;
    if (phone) {
      // Soft duplicate check by normalized phone
      let dq = supabase.from("customers").select("id, full_name").eq("phone", phone).limit(1);
      if (customer) dq = dq.neq("id", customer.id);
      const { data: dup } = await dq;
      if (dup && dup.length) {
        form.setError("phone", { message: "duplicate" });
        toast.error(t("admin.customers.duplicatePhone", { name: (dup[0] as { full_name: string }).full_name }));
        return;
      }
    }
    const payload = {
      full_name: v.full_name.trim(),
      phone,
      email: v.email?.trim() || null,
      address: v.address?.trim() || null,
      city: v.city?.trim() || null,
      district: v.district?.trim() || null,
      notes: v.notes?.trim() || null,
    };
    const res = customer
      ? await supabase.from("customers").update(payload).eq("id", customer.id).select().single()
      : await supabase.from("customers").insert({ ...payload, created_by: user?.id ?? null }).select().single();
    if (res.error) return toast.error(res.error.message);
    toast.success(t("admin.common.saved"));
    onSaved(res.data as Customer);
    onOpenChange(false);
  };

  const fieldErr = (msg?: string) => {
    if (!msg) return null;
    const text = msg === "phone" ? t("admin.validation.phone") : msg === "duplicate" ? t("admin.customers.duplicateShort")
      : msg.toLowerCase().includes("email") ? t("admin.validation.email") : t("admin.validation.required");
    return <p className="text-sm font-medium text-destructive">{text}</p>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !form.formState.isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? t("admin.customers.edit") : t("admin.customers.new")}</DialogTitle>
          <DialogDescription>{t("admin.customers.formDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField control={form.control} name="full_name" render={({ field, fieldState }) => (
              <FormItem><FormLabel>{t("admin.customers.fullName")}</FormLabel><FormControl><Input autoComplete="off" {...field} /></FormControl>{fieldErr(fieldState.error?.message && "required")}</FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="phone" render={({ field, fieldState }) => (
                <FormItem><FormLabel>{t("common.phone")}</FormLabel><FormControl><Input inputMode="tel" placeholder="61 234 5678" {...field} /></FormControl>{fieldErr(fieldState.error?.message)}</FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field, fieldState }) => (
                <FormItem><FormLabel>{t("common.email")}</FormLabel><FormControl><Input type="email" {...field} /></FormControl>{fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.email")}</p>}</FormItem>
              )} />
            </div>
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem><FormLabel>{t("admin.customers.address")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="district" render={({ field }) => (
                <FormItem><FormLabel>{t("admin.customers.district")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem><FormLabel>{t("admin.customers.city")}</FormLabel><FormControl><Input placeholder="Muqdisho" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>{t("admin.customers.notes")}</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {customer ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const CustomerDrawer = ({
  customerId, onOpenChange, onEdit,
}: { customerId: string | null; onOpenChange: (o: boolean) => void; onEdit?: (c: Customer) => void }) => {
  const { t, formatMoney, formatDate } = useI18n();
  const { can } = useAuth();
  const { data: settings } = useStoreSettings();
  const canOrders = can(["orders.view", "orders.manage"]);

  const cust = useQuery({
    queryKey: ["admin", "customer", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId!).maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
  });
  const orders = useQuery({
    queryKey: ["admin", "customer", customerId, "orders"],
    enabled: !!customerId && canOrders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, payment_status, total, currency, created_at, channel")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const paid = (orders.data ?? []).filter((o) => o.payment_status === "paid");
  const spent = paid.reduce((a, o) => a + Number(o.total), 0);
  const c = cust.data;

  return (
    <Sheet open={!!customerId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {cust.isLoading ? (
          <div className="space-y-3 pt-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
        ) : !c ? (
          <EmptyState title={t("admin.customers.notFound")} />
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-heading text-xl">{c.full_name}</SheetTitle>
              <SheetDescription>{t("admin.customers.since", { date: formatDate(c.created_at) })}{c.user_id && <Badge variant="outline" className="ml-2">{t("admin.customers.hasAccount")}</Badge>}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-2 text-sm">
              {c.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{formatSomaliPhone(c.phone)}</p>}
              {c.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{c.email}</p>}
              {(c.address || c.city || c.district) && (
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />{[c.address, c.district, c.city].filter(Boolean).join(", ")}</p>
              )}
              {c.notes && <p className="rounded-md bg-muted p-2 text-muted-foreground">{c.notes}</p>}
              {onEdit && <Button variant="outline" size="sm" className="mt-2" onClick={() => onEdit(c)}><Pencil className="mr-2 h-4 w-4" />{t("common.edit")}</Button>}
            </div>

            {canOrders && (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t("admin.customers.totalSpent")}</p>
                    <p className="text-xl font-semibold tabular-nums">{orders.isLoading ? "…" : formatMoney(spent, settings?.currency ?? "USD")}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t("admin.customers.orders")}</p>
                    <p className="text-xl font-semibold tabular-nums">{orders.isLoading ? "…" : `${paid.length}/${orders.data?.length ?? 0}`}</p>
                    <p className="text-[11px] text-muted-foreground">{t("admin.customers.paidOfTotal")}</p>
                  </div>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-semibold">{t("admin.customers.orderHistory")}</h3>
                {orders.isLoading ? <Skeleton className="h-32" /> : orders.isError ? <ErrorState error={orders.error} /> : (orders.data ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("admin.customers.noOrders")}</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {orders.data!.map((o) => (
                      <li key={o.id}>
                        <Link to={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                          <div>
                            <div className="font-medium text-primary">{o.order_number}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(o.created_at, true)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={o.payment_status} />
                            <span className="w-20 text-right tabular-nums">{formatMoney(o.total, o.currency)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const AdminCustomers = () => {
  const { t, formatDate } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("customers.manage");
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search, 350);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const openId = params.get("open");

  useEffect(() => { setPage(1); }, [debounced]);

  const list = useQuery({
    queryKey: ["admin", "customers", debounced, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageToRange(page, PAGE_SIZE);
      let q = supabase.from("customers").select("*", { count: "exact" });
      const s = sanitizeSearch(debounced);
      if (s) {
        const parts = [`full_name.ilike.%${s}%`, `phone.ilike.%${s}%`, `email.ilike.%${s}%`, `city.ilike.%${s}%`];
        const p = normalizeSomaliPhone(s);
        if (p) parts.push(`phone.eq.${p}`);
        else if (/^\d{3,}$/.test(s.replace(/\s/g, ""))) parts.push(`phone.ilike.%${s.replace(/\s/g, "").replace(/^0/, "")}%`);
        q = q.or(parts.join(","));
      }
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as Customer[], count: count ?? 0 };
    },
  });

  const setOpen = (id: string | null) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (id) n.set("open", id); else n.delete("open");
    return n;
  }, { replace: true });

  const openEdit = (c: Customer | null) => { setEditing(c); setDialogOpen(true); };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("admin.customers.title")}
        description={t("admin.customers.subtitle")}
        actions={canManage && <Button size="sm" onClick={() => openEdit(null)}><Plus className="mr-2 h-4 w-4" />{t("admin.customers.new")}</Button>}
      />
      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.customers.searchPh")} aria-label={t("common.search")} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        {list.isLoading ? <TableSkeleton rows={8} cols={4} /> : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debounced ? t("common.noResults") : t("admin.customers.empty")}
            action={canManage && !debounced && <Button size="sm" onClick={() => openEdit(null)}><Plus className="mr-2 h-4 w-4" />{t("admin.customers.new")}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.phone")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("admin.customers.city")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("admin.customers.created")}</TableHead>
                    <TableHead className="w-24 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data!.rows.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-soft text-navy"><UserRound className="h-4 w-4" /></span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.full_name}</div>
                            {c.email && <div className="truncate text-xs text-muted-foreground">{c.email}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{c.phone ? formatSomaliPhone(c.phone) : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{[c.district, c.city].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatDate(c.created_at)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(c.id)} aria-label={t("admin.customers.viewOrders")}><ShoppingBag className="h-4 w-4" /></Button>
                        {canManage && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataPagination page={page} pageCount={totalPages(list.data!.count, PAGE_SIZE)} total={list.data!.count} loading={list.isFetching} onPage={setPage} />
          </>
        )}
      </Card>

      <CustomerDrawer customerId={openId} onOpenChange={(o) => !o && setOpen(null)} onEdit={canManage ? openEdit : undefined} />
      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={editing}
        onSaved={(c) => {
          qc.invalidateQueries({ queryKey: ["admin", "customers"] });
          qc.invalidateQueries({ queryKey: ["admin", "customer", c.id] });
        }}
      />
    </div>
  );
};

export default AdminCustomers;
