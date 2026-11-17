import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Banknote, BarChart3, Loader2, Lock, Printer, Save, ShoppingCart, Smartphone, X,
} from "lucide-react";
import { supabase, rpcErrorMessage } from "@/integrations/supabase/client";
import type { Order } from "@/integrations/supabase/types";
import { payOrder, subscribeToOrderPayments } from "@/lib/payments";
import { PAYMENT_STALE_MS, serverPayMessage } from "@/lib/payment-state";
import { formatSomaliPhone, normalizeSomaliPhone, type Wallet } from "@/lib/wallet";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_SETTINGS, fetchOrderForReceipt, usePosCategories, usePosProducts, useStoreSettings, useWalletPrefixes,
  type PosCustomer, type PosProduct,
} from "@/hooks/pos";
import {
  addLine, clampDiscount, computeTotals, hasVariants, initialPayState, isBusy, isTicketLocked, maxDiscountFor, payReducer,
  remainingStock, removeLine, setLineQty, toRpcItems, validateSale,
  type PayMethod, type SaleError, type TicketLine, type Variants,
} from "@/components/pos/ticket";
import { detectFor } from "@/components/pos/walletDetect";
import { ProductPanel } from "@/components/pos/ProductPanel";
import { VariantPicker } from "@/components/pos/VariantPicker";
import { TicketLines } from "@/components/pos/TicketLines";
import { CustomerPicker } from "@/components/pos/CustomerPicker";
import { WalletFields } from "@/components/pos/WalletFields";
import { PaymentStatusDialog } from "@/components/pos/PaymentStatusDialog";
import { SalesTodaySheet } from "@/components/pos/SalesTodaySheet";
import { Kbd } from "@/components/pos/Kbd";
import { printReceipt } from "@/components/receipt/Receipt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** True when any modal / popover / menu is currently open (so global shortcuts stay out of the way). */
function overlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[data-radix-popper-content-wrapper]',
    ),
  );
}

const AdminPos = () => {
  const { t, lang, formatMoney } = useI18n();
  const { user, profile, can } = useAuth();
  // Without payments.initiate the server refuses every payment (wallet or cash), so a sale can't be saved.
  const canTakePayments = can("payments.initiate");
  const canManageOrders = can("orders.manage");
  const qc = useQueryClient();

  const productsQ = usePosProducts();
  const categoriesQ = usePosCategories();
  const settingsQ = useStoreSettings();
  const prefixesQ = useWalletPrefixes();
  const settings = settingsQ.data ?? DEFAULT_SETTINGS;
  const currency = settings.currency || "USD";
  const cashierName = profile?.full_name || user?.email || null;

  // Ticket
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [notes, setNotes] = useState("");
  // Payment
  const [method, setMethod] = useState<PayMethod>("wallet");
  const [phone, setPhone] = useState("");
  const [override, setOverride] = useState<Wallet | null>(null);
  const [state, dispatch] = useReducer(payReducer, initialPayState);
  // UI
  const [variantProduct, setVariantProduct] = useState<PosProduct | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [failedOpen, setFailedOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Order | null>(null);
  const [checking, setChecking] = useState(false);
  const [reprinting, setReprinting] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const finalized = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const busy = isBusy(state);
  const locked = isTicketLocked(state);
  const order = state.order;

  const rawSubtotal = useMemo(() => computeTotals(lines, 0, 0).subtotal, [lines]);
  // Total must stay > 0; cashiers without orders.manage are capped at max_cashier_discount_pct of the subtotal.
  const maxDiscountPct = Number(settings.max_cashier_discount_pct ?? 0.2);
  const maxDiscount = maxDiscountFor(rawSubtotal, { canManage: canManageOrders, maxPct: maxDiscountPct });
  const discount = clampDiscount(discountInput, rawSubtotal, maxDiscount);
  const typedDiscount = parseFloat(discountInput.replace(",", "."));
  const discountClamped = discountInput.trim() !== "" && Number.isFinite(typedDiscount) && typedDiscount > maxDiscount;
  const discountPctLabel = +(Math.min(Math.max(maxDiscountPct, 0), 1) * 100).toFixed(2);
  const totals = useMemo(() => computeTotals(lines, discount, settings.tax_rate), [lines, discount, settings.tax_rate]);
  // Once the order exists the server's numbers are the truth.
  const shown = order
    ? { ...totals, subtotal: Number(order.subtotal), discount: Number(order.discount), tax: Number(order.tax), total: Number(order.total) }
    : totals;

  const det = detectFor(phone, prefixesQ.data, override);

  /* ----------------------------- ticket ops ----------------------------- */

  const addToTicket = useCallback((p: PosProduct, variants: Variants, qty: number) => {
    setLines((cur) => {
      const r = addLine(cur, p, variants, qty);
      if (r.added === 0) toast.warning(t("pos.toast.noMoreStock"));
      return r.lines;
    });
  }, [t]);

  const handlePick = useCallback((p: PosProduct) => {
    if (isTicketLocked(stateRef.current)) {
      toast.info(t("pos.toast.locked"));
      return;
    }
    if (p.stock <= 0) {
      toast.warning(t("pos.products.outOfStock"));
      return;
    }
    if (hasVariants(p)) setVariantProduct(p);
    else addToTicket(p, {}, 1);
  }, [addToTicket, t]);

  const selectCustomer = (c: PosCustomer | null) => {
    setCustomer(c);
    if (c?.phone && normalizeSomaliPhone(c.phone)) {
      setPhone(formatSomaliPhone(c.phone));
      setOverride(null);
    }
  };

  const resetTicket = useCallback(() => {
    setLines([]);
    setCustomer(null);
    setDiscountInput("");
    setNotes("");
    setPhone("");
    setOverride(null);
    setMethod("wallet");
    setFailedOpen(false);
    dispatch({ type: "RESET" });
  }, []);

  /* ------------------------------ payments ------------------------------ */

  const doPrint = useCallback(async (o: Order) => {
    try {
      await printReceipt(o, settings, { cashierName, lang });
    } catch {
      toast.error(t("pos.receipt.printError"));
    }
  }, [settings, cashierName, lang, t]);

  const finalizeApproved = useCallback(async (orderId: string, print: boolean) => {
    if (finalized.current === orderId) return;
    finalized.current = orderId;
    dispatch({ type: "PAY_APPROVED" });
    let full: Order | null = null;
    try {
      full = await fetchOrderForReceipt(orderId);
    } catch {
      /* receipt can still be reprinted later from "My sales today" */
    }
    const number = full?.order_number ?? stateRef.current.order?.order_number ?? "";
    const total = full?.total ?? stateRef.current.order?.total ?? 0;
    toast.success(t("pos.flow.approved", { order: number, total: formatMoney(total, currency) }));
    if (full) setLastSale(full);
    resetTicket();
    qc.invalidateQueries({ queryKey: ["pos", "products"] });
    qc.invalidateQueries({ queryKey: ["pos", "sales-today"] });
    if (print) {
      if (full) await doPrint(full);
      else toast.error(t("pos.receipt.printError"));
    }
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [currency, doPrint, formatMoney, qc, resetTicket, t]);

  const validationMessage = (e: SaleError) => t(`pos.validate.${e}`);

  const submit = useCallback(async (print: boolean, opts: { method?: PayMethod } = {}) => {
    if (inFlight.current) return;
    const s = stateRef.current;
    if (isBusy(s)) return;
    const m = opts.method ?? method;
    if (!canTakePayments) {
      toast.error(t("pos.noPay.title"));
      return;
    }
    const errors = validateSale({
      lines,
      method: m,
      normalizedPhone: det.normalized,
      detectedWallet: det.detected?.wallet ?? null,
      overrideWallet: override,
      discount,
      maxDiscount,
    });
    if (errors.length) {
      toast.error(validationMessage(errors[0]));
      if (errors[0] === "EMPTY_TICKET") searchRef.current?.focus();
      else if (errors[0] === "DISCOUNT_TOO_HIGH") document.getElementById("pos-discount")?.focus();
      else if (errors[0] !== "INVALID_QUANTITY") phoneRef.current?.focus();
      return;
    }

    inFlight.current = true;
    try {
      let current = s.order;
      if (!current) {
        dispatch({ type: "CREATE_START", print });
        const { data, error } = await supabase.rpc("create_order", {
          p_items: toRpcItems(lines),
          p_shipping: {
            name: customer?.full_name ?? null,
            phone: m === "wallet" ? det.normalized : normalizeSomaliPhone(customer?.phone) ?? null,
            notes: notes.trim() || null,
          },
          p_channel: "pos",
          p_customer_id: customer?.id ?? null,
          p_discount: discount,
        });
        if (error || !data) {
          const msg = rpcErrorMessage(error ?? new Error("CREATE_FAILED"), lang);
          dispatch({ type: "CREATE_FAIL", error: { code: "CREATE_FAILED", message: msg } });
          toast.error(msg);
          if (String(error?.message ?? "").startsWith("OUT_OF_STOCK")) productsQ.refetch();
          return;
        }
        current = (Array.isArray(data) ? data[0] : data) as Order;
        dispatch({ type: "CREATE_SUCCESS", order: current });
      }

      dispatch({
        type: "PAY_START",
        print,
        attempt: {
          method: m,
          phone: m === "wallet" ? det.normalized : null,
          wallet: m === "cash" ? "CASH" : det.effective,
          startedAt: Date.now(),
        },
      });
      setFailedOpen(false);

      const res = await payOrder(
        m === "cash"
          ? { action: "cash", order_id: current.id }
          : { action: "purchase", order_id: current.id, phone: det.normalized!, ...(override ? { wallet: override } : {}) },
      );

      if (res.ok && (res.status === "approved" || res.order?.payment_status === "paid")) {
        await finalizeApproved(current.id, print);
      } else if (finalized.current !== current.id) {
        // UNKNOWN (or a bare 'pending'): no gateway answer, the attempt stays pending until it goes stale.
        const noAnswer = res.code === "UNKNOWN" || (!res.code && res.status === "pending");
        dispatch({
          type: "PAY_FAILED",
          error: {
            code: res.code ?? (res.status === "pending" ? "UNKNOWN" : "DECLINED"),
            message: serverPayMessage(res, lang),
            ...(noAnswer ? { retryAt: (stateRef.current.attempt?.startedAt ?? Date.now()) + PAYMENT_STALE_MS } : {}),
          },
        });
        setFailedOpen(true);
      }
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, lines, det.normalized, det.detected, det.effective, override, customer, notes, discount, maxDiscount,
    canTakePayments, lang, finalizeApproved]);

  const checkStatus = useCallback(async () => {
    const s = stateRef.current;
    if (!s.order) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.from("orders").select("payment_status").eq("id", s.order.id).single();
      if (error) throw error;
      if (data?.payment_status === "paid") await finalizeApproved(s.order.id, s.print);
      else toast.info(t("pos.flow.stillUnpaid", { status: t(`status.${data?.payment_status ?? "unpaid"}`) }));
    } catch (e) {
      toast.error(rpcErrorMessage(e, lang));
    } finally {
      setChecking(false);
    }
  }, [finalizeApproved, lang, t]);

  const confirmCancel = useCallback(async () => {
    const s = stateRef.current;
    if (isBusy(s) || inFlight.current) return;
    if (s.order) {
      inFlight.current = true;
      dispatch({ type: "CANCEL_START" });
      const { error } = await supabase.rpc("cancel_order", { p_order_id: s.order.id, p_reason: "POS: cancelled by cashier" });
      inFlight.current = false;
      if (error) {
        const msg = rpcErrorMessage(error, lang);
        dispatch({ type: "CANCEL_FAIL", error: { code: "CANCEL_FAILED", message: msg } });
        setCancelOpen(false);
        if (error.message?.includes("ORDER_ALREADY_PAID")) {
          await finalizeApproved(s.order.id, s.print);
          return;
        }
        toast.error(msg);
        setFailedOpen(true);
        return;
      }
      dispatch({ type: "CANCEL_DONE" });
      toast.success(t("pos.flow.orderCancelled", { order: s.order.order_number }));
    }
    setCancelOpen(false);
    resetTicket();
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [finalizeApproved, lang, resetTicket, t]);

  const requestCancel = useCallback(() => {
    const s = stateRef.current;
    if (isBusy(s)) return;
    if (lines.length === 0 && !s.order) return;
    setCancelOpen(true);
  }, [lines.length]);

  const reprint = useCallback(async (orderId: string) => {
    try {
      const o = lastSale && lastSale.id === orderId ? lastSale : await fetchOrderForReceipt(orderId);
      await doPrint(o);
    } catch (e) {
      toast.error(rpcErrorMessage(e, lang));
    }
  }, [doPrint, lang, lastSale]);

  const reprintLast = async () => {
    if (!lastSale) return;
    setReprinting(true);
    try { await reprint(lastSale.id); } finally { setReprinting(false); }
  };

  /* ------------------------ realtime safety net ------------------------ */
  // If the edge-function response is lost (network drop) but the payment is
  // approved server-side, Realtime still tells us so we never double-charge.
  const watchId = order && (state.phase === "awaiting_payment" || state.phase === "failed") ? order.id : null;
  useEffect(() => {
    if (!watchId) return;
    return subscribeToOrderPayments(watchId, (p) => {
      if (p?.status === "approved") void finalizeApproved(watchId, stateRef.current.print);
    });
  }, [watchId, finalizeApproved]);

  /* ----------------------------- shortcuts ----------------------------- */
  const keyHandlers = useRef({ submit, requestCancel });
  keyHandlers.current = { submit, requestCancel };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (!overlayOpen()) {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      } else if (e.key === "F8" || e.key === "F9") {
        e.preventDefault();
        if (overlayOpen()) return;
        void keyHandlers.current.submit(e.key === "F9");
      } else if (e.key === "Escape") {
        if (e.defaultPrevented || overlayOpen()) return;
        keyHandlers.current.requestCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warn before leaving with a payment in flight or an unpaid order open.
  useEffect(() => {
    if (!busy && !order) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy, order]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  /* -------------------------------- view -------------------------------- */

  const dialogOpen = busy || (state.phase === "failed" && failedOpen);
  const canSubmit = !busy && lines.length > 0 && canTakePayments;
  const variantAvailable = variantProduct ? remainingStock(lines, variantProduct) : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-3 pb-24 sm:p-4 lg:p-6 lg:pb-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{t("pos.title")}</h1>
          <p className="hidden text-sm text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <span className="inline-flex items-center gap-1"><Kbd>F2</Kbd> {t("pos.hint.search")}</span>
            <span className="inline-flex items-center gap-1"><Kbd>F8</Kbd> {t("pos.actions.save")}</span>
            <span className="inline-flex items-center gap-1"><Kbd>F9</Kbd> {t("pos.actions.saveAndPrint")}</span>
            <span className="inline-flex items-center gap-1"><Kbd>Esc</Kbd> {t("pos.actions.cancel")}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reprintLast} disabled={!lastSale || reprinting}
            title={lastSale ? `${t("pos.reprintLast")} · ${lastSale.order_number}` : t("pos.reprintLastNone")}>
            {reprinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            <span className="hidden sm:inline">{t("pos.reprintLast")}</span>
            {lastSale && <span className="ml-1 hidden text-xs text-muted-foreground md:inline">({lastSale.order_number})</span>}
          </Button>
          <Button variant="outline" onClick={() => setSalesOpen(true)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>{t("pos.sales.button")}</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_450px]">
        <ProductPanel
          products={productsQ.data}
          categories={categoriesQ.data}
          loading={productsQ.isLoading}
          error={productsQ.error}
          onRetry={() => productsQ.refetch()}
          lines={lines}
          currency={currency}
          locked={locked}
          searchRef={searchRef}
          onPick={handlePick}
          onNotFound={(q) => toast.warning(t("pos.toast.notFound", { q }))}
        />

        <aside ref={ticketRef} aria-label={t("pos.ticket.title")} className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="flex flex-col overflow-hidden lg:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
                <ShoppingCart className="h-5 w-5 text-primary" /> {t("pos.ticket.title")}
                {totals.itemCount > 0 && <Badge variant="secondary">{totals.itemCount}</Badge>}
              </h2>
              {order && <Badge variant="outline" className="font-mono">{order.order_number}</Badge>}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {order && state.phase === "failed" && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="flex-1">
                    <p>{t("pos.ticket.unpaidOrder", { order: order.order_number })}</p>
                    <Button variant="link" className="h-auto p-0" onClick={() => setFailedOpen(true)}>
                      {t("pos.ticket.openPaymentOptions")}
                    </Button>
                  </div>
                </div>
              )}

              <TicketLines
                lines={lines}
                currency={currency}
                locked={locked}
                onQty={(k, q) => setLines((cur) => setLineQty(cur, k, q))}
                onRemove={(k) => setLines((cur) => removeLine(cur, k))}
              />

              <Separator />

              <div className="space-y-1.5">
                <Label>{t("pos.customer.label")}</Label>
                <CustomerPicker value={customer} onChange={selectCustomer} disabled={locked} />
              </div>

              <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pos-discount">{t("common.discount")}</Label>
                  <Input
                    id="pos-discount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value.replace(/[^\d.,]/g, ""))}
                    disabled={locked || lines.length === 0}
                    className="h-11 tabular-nums"
                    aria-describedby="pos-discount-hint"
                  />
                  {discountClamped ? (
                    <p id="pos-discount-hint" className="text-[11px] text-warning">
                      {!canManageOrders && discountPctLabel < 100
                        ? t("pos.ticket.discountLimitHit", { amount: formatMoney(maxDiscount, currency), pct: discountPctLabel })
                        : t("pos.ticket.discountClamped")}
                    </p>
                  ) : !canManageOrders && lines.length > 0 ? (
                    <p id="pos-discount-hint" className="text-[11px] text-muted-foreground">
                      {t("pos.ticket.discountLimit", { pct: discountPctLabel, amount: formatMoney(maxDiscount, currency) })}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pos-notes">{t("pos.ticket.notes")}</Label>
                  <Textarea
                    id="pos-notes"
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={locked}
                    className="min-h-[44px] resize-none"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t bg-muted/30 px-4 py-3">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("common.subtotal")}</dt><dd className="tabular-nums">{formatMoney(shown.subtotal, currency)}</dd></div>
                {shown.discount > 0 && (
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("common.discount")}</dt><dd className="tabular-nums text-success">-{formatMoney(shown.discount, currency)}</dd></div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {t("common.tax")} {settings.tax_rate ? `(${+(settings.tax_rate * 100).toFixed(2)}%)` : ""}
                  </dt>
                  <dd className="tabular-nums">{formatMoney(shown.tax, currency)}</dd>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="font-semibold">{t("common.total")}</dt>
                  <dd className="text-2xl font-bold tabular-nums text-primary" aria-live="polite">{formatMoney(shown.total, currency)}</dd>
                </div>
              </dl>

              {!canTakePayments && (
                <Alert variant="destructive" role="alert">
                  <Lock className="h-4 w-4" />
                  <AlertTitle>{t("pos.noPay.title")}</AlertTitle>
                  <AlertDescription className="text-xs">{t("pos.noPay.desc")}</AlertDescription>
                </Alert>
              )}

              <ToggleGroup
                type="single"
                variant="outline"
                value={method}
                onValueChange={(v) => v && setMethod(v as PayMethod)}
                disabled={busy}
                className="grid grid-cols-2"
                aria-label={t("pos.pay.method")}
              >
                <ToggleGroupItem value="wallet" className="h-11 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
                  <Smartphone className="mr-2 h-4 w-4" /> {t("pos.pay.wallet")}
                </ToggleGroupItem>
                <ToggleGroupItem value="cash" className="h-11 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
                  <Banknote className="mr-2 h-4 w-4" /> {t("pos.pay.cash")}
                </ToggleGroupItem>
              </ToggleGroup>

              {method === "wallet" ? (
                <WalletFields
                  phone={phone}
                  onPhoneChange={setPhone}
                  override={override}
                  onOverrideChange={setOverride}
                  prefixes={prefixesQ.data}
                  prefixesLoading={prefixesQ.isLoading}
                  disabled={busy}
                  phoneInputRef={phoneRef}
                />
              ) : (
                <p className="rounded-md bg-background px-3 py-2 text-sm text-muted-foreground">{t("pos.pay.cashHint")}</p>
              )}

              <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 flex-col gap-0.5 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={requestCancel}
                  disabled={busy || (lines.length === 0 && !order)}
                >
                  <span className="flex items-center"><X className="mr-1 h-4 w-4" />{t("pos.actions.cancel")}</span>
                  <Kbd className="sm:inline-block">Esc</Kbd>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-14 flex-col gap-0.5"
                  onClick={() => submit(false)}
                  disabled={!canSubmit}
                >
                  <span className="flex items-center">
                    {busy && !state.print
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      : <Save className="mr-1.5 h-4 w-4" />}
                    {t("pos.actions.save")}
                  </span>
                  <Kbd>F8</Kbd>
                </Button>
                <Button
                  type="button"
                  className="h-14 flex-col gap-0.5"
                  onClick={() => submit(true)}
                  disabled={!canSubmit}
                >
                  <span className="flex items-center">
                    {busy && state.print
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      : <Printer className="mr-1.5 h-4 w-4" />}
                    {t("pos.actions.saveAndPrint")}
                  </span>
                  <Kbd className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground">F9</Kbd>
                </Button>
              </div>
              {order && state.phase === "failed" && (
                <p className="text-center text-[11px] text-muted-foreground">{t("pos.ticket.retryHint")}</p>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* Mobile: jump to the ticket */}
      {lines.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-30 lg:hidden">
          <Button
            className="h-14 w-full justify-between rounded-xl text-base shadow-lg"
            onClick={() => ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> {t("pos.ticket.viewTicket", { n: totals.itemCount })}</span>
            <span className="tabular-nums">{formatMoney(shown.total, currency)}</span>
          </Button>
        </div>
      )}

      <VariantPicker
        product={variantProduct}
        available={variantAvailable}
        currency={currency}
        onClose={() => setVariantProduct(null)}
        onConfirm={(p, v, q) => {
          addToTicket(p, v, q);
          setVariantProduct(null);
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      />

      <PaymentStatusDialog
        state={state}
        open={dialogOpen}
        onOpenChange={(o) => { if (!o) setFailedOpen(false); }}
        total={shown.total}
        currency={currency}
        phone={phone}
        onPhoneChange={setPhone}
        override={override}
        onOverrideChange={setOverride}
        prefixes={prefixesQ.data}
        checking={checking}
        onRetry={() => { setMethod("wallet"); void submit(state.print, { method: "wallet" }); }}
        onPayCash={() => { setMethod("cash"); void submit(state.print, { method: "cash" }); }}
        onCancelOrder={() => setCancelOpen(true)}
        onCheckStatus={checkStatus}
      />

      <AlertDialog open={cancelOpen} onOpenChange={(o) => state.phase !== "cancelling" && setCancelOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {order ? t("pos.cancel.titleOrder", { order: order.order_number }) : t("pos.cancel.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {order ? t("pos.cancel.descOrder") : t("pos.cancel.desc", { n: totals.itemCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={state.phase === "cancelling"}>{t("pos.cancel.keep")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={state.phase === "cancelling"}
              onClick={(e) => { e.preventDefault(); void confirmCancel(); }}
            >
              {state.phase === "cancelling" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pos.cancel.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SalesTodaySheet open={salesOpen} onOpenChange={setSalesOpen} currency={currency} onReprint={reprint} />
    </div>
  );
};

export default AdminPos;
