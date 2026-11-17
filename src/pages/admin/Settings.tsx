import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, Pencil, Plus, Smartphone, Store, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { StoreSettings, WalletPrefixRow } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { WALLET_LABELS, type Wallet } from "@/lib/wallet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/admin/shared";
import { AuditLog } from "@/components/admin/AuditLog";
import { storeSettingsKey, useAllWalletPrefixes, useStoreSettings, walletPrefixesKey } from "@/hooks/admin/useStoreData";

const CURRENCIES = ["USD", "SOS", "SLSH", "KES", "ETB", "EUR"];
const WALLETS: Wallet[] = ["EVC_PLUS", "ZAAD", "SAHAL", "WAAFI", "JEEB", "EDAHAB"];

/* ---------------- Store settings ---------------- */
const optionalNum = z.union([z.literal(""), z.coerce.number().min(0)]);
const storeSchema = z.object({
  store_name: z.string().trim().min(2).max(80),
  currency: z.string().min(3).max(4),
  shipping_fee: z.coerce.number().min(0),
  free_shipping_over: optionalNum,
  tax_percent: z.coerce.number().min(0).max(100),
  phone: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  receipt_footer: z.string().max(300).optional(),
});
type StoreValues = z.infer<typeof storeSchema>;

const toStoreValues = (s: StoreSettings | null | undefined): StoreValues => ({
  store_name: s?.store_name ?? "",
  currency: s?.currency ?? "USD",
  shipping_fee: Number(s?.shipping_fee ?? 0),
  free_shipping_over: s?.free_shipping_over ?? "",
  tax_percent: Math.round(Number(s?.tax_rate ?? 0) * 10000) / 100,
  phone: s?.phone ?? "",
  address: s?.address ?? "",
  receipt_footer: s?.receipt_footer ?? "",
});

const StoreSettingsForm = () => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const settings = useStoreSettings();
  const form = useForm<StoreValues>({ resolver: zodResolver(storeSchema), defaultValues: toStoreValues(settings.data) });
  useEffect(() => { if (settings.data) form.reset(toStoreValues(settings.data)); }, [settings.data, form]);

  if (settings.isLoading) return <Card><CardContent className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</CardContent></Card>;
  if (settings.isError) return <Card><ErrorState error={settings.error} onRetry={() => settings.refetch()} /></Card>;

  const submit = async (v: StoreValues) => {
    const payload = {
      store_name: v.store_name.trim(),
      currency: v.currency,
      shipping_fee: Number(v.shipping_fee),
      free_shipping_over: v.free_shipping_over === "" ? null : Number(v.free_shipping_over),
      tax_rate: Math.round(Number(v.tax_percent) * 100) / 10000,
      phone: v.phone?.trim() || null,
      address: v.address?.trim() || null,
      receipt_footer: v.receipt_footer?.trim() || null,
    };
    const { error } = await supabase.from("store_settings").update(payload).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(t("admin.common.saved"));
    qc.invalidateQueries({ queryKey: storeSettingsKey });
  };

  const errText = (has: boolean, key = "admin.validation.nonNegative") => has ? <p className="text-sm font-medium text-destructive">{t(key)}</p> : null;

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)}>
          <CardHeader>
            <CardTitle className="text-lg">{t("admin.settings.storeTitle")}</CardTitle>
            <CardDescription>{t("admin.settings.storeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="store_name" render={({ field, fieldState }) => (
              <FormItem><FormLabel>{t("admin.settings.storeName")}</FormLabel><FormControl><Input {...field} /></FormControl>{errText(!!fieldState.error, "admin.validation.required")}</FormItem>
            )} />
            <FormField control={form.control} name="currency" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("admin.settings.currency")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{[...new Set([field.value, ...CURRENCIES])].filter(Boolean).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <FormDescription className="text-xs">{t("admin.settings.currencyHint")}</FormDescription>
              </FormItem>
            )} />
            <FormField control={form.control} name="shipping_fee" render={({ field, fieldState }) => (
              <FormItem><FormLabel>{t("admin.settings.shippingFee")}</FormLabel><FormControl><Input type="number" step="0.01" min="0" inputMode="decimal" {...field} /></FormControl>{errText(!!fieldState.error)}</FormItem>
            )} />
            <FormField control={form.control} name="free_shipping_over" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t("admin.settings.freeShippingOver")}</FormLabel>
                <FormControl><Input type="number" step="0.01" min="0" inputMode="decimal" placeholder={t("admin.settings.disabled")} {...field} value={field.value ?? ""} /></FormControl>
                {errText(!!fieldState.error) ?? <FormDescription className="text-xs">{t("admin.settings.freeShippingHint")}</FormDescription>}
              </FormItem>
            )} />
            <FormField control={form.control} name="tax_percent" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t("admin.settings.taxRate")}</FormLabel>
                <div className="relative">
                  <FormControl><Input type="number" step="0.01" min="0" max="100" inputMode="decimal" className="pr-8" {...field} /></FormControl>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                {errText(!!fieldState.error, "admin.validation.percent")}
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>{t("admin.settings.storePhone")}</FormLabel><FormControl><Input inputMode="tel" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem className="sm:col-span-2"><FormLabel>{t("admin.customers.address")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="receipt_footer" render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("admin.settings.receiptFooter")}</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormDescription className="text-xs">{t("admin.settings.receiptFooterHint")}</FormDescription>
              </FormItem>
            )} />
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" disabled={!form.formState.isDirty || form.formState.isSubmitting} onClick={() => form.reset(toStoreValues(settings.data))}>{t("admin.common.reset")}</Button>
            <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

/* ---------------- Wallet prefixes ---------------- */
const PrefixDialog = ({
  open, onOpenChange, row, existing,
}: { open: boolean; onOpenChange: (o: boolean) => void; row: WalletPrefixRow | null; existing: string[] }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState("");
  const [wallet, setWallet] = useState<Wallet>("EVC_PLUS");
  const [provider, setProvider] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPrefix(row?.prefix ?? ""); setWallet(row?.wallet ?? "EVC_PLUS");
      setProvider(row?.provider_name ?? ""); setActive(row?.is_active ?? true);
    }
  }, [open, row]);

  const prefixOk = /^[0-9]{1,4}$/.test(prefix);
  const dup = !row && existing.includes(prefix);
  const valid = prefixOk && !dup && provider.trim().length >= 2;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const payload = { wallet, provider_name: provider.trim(), is_active: active };
    const { error } = row
      ? await supabase.from("wallet_prefixes").update(payload).eq("prefix", row.prefix)
      : await supabase.from("wallet_prefixes").insert({ prefix, ...payload });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("admin.common.saved"));
    qc.invalidateQueries({ queryKey: walletPrefixesKey });
    qc.invalidateQueries({ queryKey: ["wallet-prefixes"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? t("admin.settings.editPrefix") : t("admin.settings.addPrefix")}</DialogTitle>
          <DialogDescription>{t("admin.settings.prefixDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="px">{t("admin.settings.prefix")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">+252</span>
              <Input id="px" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={!!row} inputMode="numeric" className="font-mono" placeholder="61" aria-invalid={!!prefix && (!prefixOk || dup)} />
            </div>
            {dup && <p className="text-xs text-destructive">{t("admin.settings.prefixExists")}</p>}
            {!dup && <p className="text-xs text-muted-foreground">{t("admin.settings.prefixHint")}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t("common.wallet")}</Label>
            <Select value={wallet} onValueChange={(v) => setWallet(v as Wallet)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WALLETS.map((w) => <SelectItem key={w} value={w}>{WALLET_LABELS[w]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prov">{t("admin.settings.provider")}</Label>
            <Input id="prov" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Hormuud" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="px-active">{t("admin.common.active")}</Label>
            <Switch id="px-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={!valid || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WalletPrefixes = () => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const prefixes = useAllWalletPrefixes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WalletPrefixRow | null>(null);
  const [toDelete, setToDelete] = useState<WalletPrefixRow | null>(null);
  const rows = prefixes.data ?? [];

  const toggle = async (r: WalletPrefixRow, v: boolean) => {
    const { error } = await supabase.from("wallet_prefixes").update({ is_active: v }).eq("prefix", r.prefix);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: walletPrefixesKey });
    qc.invalidateQueries({ queryKey: ["wallet-prefixes"] });
  };

  return (
    <div className="space-y-4">
      <Alert className="border-warning/40 bg-warning/10">
        <AlertTriangle className="h-4 w-4 !text-amber-600" />
        <AlertTitle>{t("admin.settings.verifyTitle")}</AlertTitle>
        <AlertDescription>{t("admin.settings.verifyDesc")}</AlertDescription>
      </Alert>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">{t("admin.settings.prefixesTitle")}</CardTitle>
            <CardDescription>{t("admin.settings.prefixesDesc")}</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("admin.settings.addPrefix")}</Button>
        </CardHeader>
        {prefixes.isLoading ? <TableSkeleton rows={4} cols={4} /> : prefixes.isError ? (
          <ErrorState error={prefixes.error} onRetry={() => prefixes.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Smartphone} title={t("admin.settings.noPrefixes")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.settings.prefix")}</TableHead>
                <TableHead>{t("common.wallet")}</TableHead>
                <TableHead>{t("admin.settings.provider")}</TableHead>
                <TableHead className="text-center">{t("admin.common.active")}</TableHead>
                <TableHead className="w-24 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.prefix} className={cn(!r.is_active && "opacity-60")}>
                  <TableCell className="font-mono">+252 {r.prefix}…</TableCell>
                  <TableCell className="font-medium">{WALLET_LABELS[r.wallet] ?? r.wallet}</TableCell>
                  <TableCell>{r.provider_name}</TableCell>
                  <TableCell className="text-center"><Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} aria-label={t("admin.common.active")} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setOpen(true); }} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setToDelete(r)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <PrefixDialog open={open} onOpenChange={setOpen} row={editing} existing={rows.map((r) => r.prefix)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("admin.settings.deletePrefixTitle", { prefix: toDelete?.prefix ?? "" })}
        description={t("admin.settings.deletePrefixDesc")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          const { error } = await supabase.from("wallet_prefixes").delete().eq("prefix", toDelete!.prefix);
          if (error) { toast.error(error.message); throw error; }
          toast.success(t("admin.common.deleted"));
          qc.invalidateQueries({ queryKey: walletPrefixesKey });
          qc.invalidateQueries({ queryKey: ["wallet-prefixes"] });
        }}
      />
    </div>
  );
};

/* ---------------- Gateway info ---------------- */
const GatewayInfo = () => {
  const { t } = useI18n();
  const secrets = ["WAAFI_MERCHANT_UID", "WAAFI_API_USER_ID", "WAAFI_API_KEY", "WAAFI_ENV", "WAAFI_MODE"];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-muted-foreground" />{t("admin.settings.gatewayTitle")}</CardTitle>
        <CardDescription>{t("admin.settings.gatewayDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{t("admin.settings.gatewaySecrets")}</p>
        <ul className="flex flex-wrap gap-2">
          {secrets.map((s) => <li key={s} className="rounded bg-muted px-2 py-1 font-mono text-xs">{s}</li>)}
        </ul>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">supabase secrets set WAAFI_MERCHANT_UID=… WAAFI_API_USER_ID=… WAAFI_API_KEY=… WAAFI_ENV=production WAAFI_MODE=live</pre>
        <p className="text-muted-foreground">{t("admin.settings.gatewayMock")}</p>
        <Alert>
          <AlertDescription>{t("admin.settings.gatewayNoKeys")}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

const AdminSettings = () => {
  const { t } = useI18n();
  const { can } = useAuth();
  const canAudit = can(["reports.view", "users.manage"]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("admin.settings.title")} description={t("admin.settings.subtitle")} />
      <Tabs defaultValue="store">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="store"><Store className="mr-1.5 h-4 w-4" />{t("admin.settings.tabStore")}</TabsTrigger>
          <TabsTrigger value="wallets"><Smartphone className="mr-1.5 h-4 w-4" />{t("admin.settings.tabWallets")}</TabsTrigger>
          <TabsTrigger value="gateway"><KeyRound className="mr-1.5 h-4 w-4" />{t("admin.settings.tabGateway")}</TabsTrigger>
          {canAudit && <TabsTrigger value="audit"><History className="mr-1.5 h-4 w-4" />{t("admin.audit.title")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="store" className="mt-0"><StoreSettingsForm /></TabsContent>
        <TabsContent value="wallets" className="mt-0"><WalletPrefixes /></TabsContent>
        <TabsContent value="gateway" className="mt-0"><GatewayInfo /></TabsContent>
        {canAudit && <TabsContent value="audit" className="mt-0"><AuditLog /></TabsContent>}
      </Tabs>
    </div>
  );
};

export default AdminSettings;
