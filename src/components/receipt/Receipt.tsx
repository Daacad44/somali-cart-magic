import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Loader2, Printer, AlertCircle } from "lucide-react";
import type { Order, Payment, StoreSettings } from "@/integrations/supabase/types";
import { WALLET_LABELS, maskPhone, normalizeSomaliPhone } from "@/lib/wallet";
import { useI18n, type Lang } from "@/lib/i18n";
import posDict from "@/i18n/pos";
import commonDict from "@/i18n/common";
import { useReceiptOrder, useStaffName, useStoreSettings } from "@/hooks/pos";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import "./receipt.css";
import receiptCss from "./receipt.css?inline";

export type ReceiptSize = "80mm" | "a4";

export interface ReceiptViewProps {
  order: Order;
  settings: StoreSettings;
  cashierName?: string | null;
  size?: ReceiptSize;
  /** Defaults to Somali. Pure component: does not need the I18n provider. */
  lang?: Lang;
}

function label(lang: Lang, key: string): string {
  const d = lang === "en" ? { ...commonDict.en, ...posDict.en } : { ...commonDict.so, ...posDict.so };
  return d[key] ?? commonDict.en[key] ?? posDict.en[key] ?? key;
}

function money(n: number | string | null | undefined, currency: string): string {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

function dateTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === "so" ? "so-SO" : "en-GB", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** The payment that settled the order (latest approved), else the latest attempt. */
export function settlingPayment(payments: Payment[] | undefined): Payment | null {
  if (!payments?.length) return null;
  const sorted = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((p) => p.status === "approved") ?? sorted[0];
}

function maskedAccount(acc: string | null): string | null {
  if (!acc) return null;
  const n = normalizeSomaliPhone(acc);
  return n ? maskPhone(n) : maskPhone(acc);
}

export function ReceiptView({ order, settings, cashierName, size = "80mm", lang = "so" }: ReceiptViewProps) {
  const L = (k: string) => label(lang, k);
  const currency = order.currency || settings.currency || "USD";
  const pay = settlingPayment(order.payments);
  const paid = order.payment_status === "paid";
  const customerName = order.customer?.full_name ?? order.shipping_name ?? null;
  const customerPhone = order.customer?.phone ?? order.shipping_phone ?? null;
  const items = order.items ?? [];
  const methodLabel = pay?.wallet ? WALLET_LABELS[pay.wallet] ?? pay.wallet : null;

  return (
    <div className={`rcpt${size === "a4" ? " rcpt--a4" : ""}`} data-receipt={order.order_number}>
      <div className="rcpt-center">
        <p className="rcpt-store">{settings.store_name}</p>
        {settings.address && <div className="rcpt-muted">{settings.address}</div>}
        {settings.phone && <div className="rcpt-muted">{L("pos.receipt.tel")}: {settings.phone}</div>}
      </div>
      <hr className="rcpt-sep" />

      <div className="rcpt-meta">
        <div className="rcpt-row"><span>{L("pos.receipt.order")}</span><strong>{order.order_number}</strong></div>
        <div className="rcpt-row"><span>{L("common.date")}</span><span>{dateTime(order.paid_at ?? order.created_at, lang)}</span></div>
        {cashierName && <div className="rcpt-row"><span>{L("pos.receipt.cashier")}</span><span>{cashierName}</span></div>}
        <div className="rcpt-row">
          <span>{L("pos.receipt.customer")}</span>
          <span>{customerName || L("pos.customer.walkIn")}</span>
        </div>
        {customerPhone && (
          <div className="rcpt-row"><span>{L("common.phone")}</span><span>{maskedAccount(customerPhone)}</span></div>
        )}
      </div>
      <hr className="rcpt-sep" />

      <div>
        {items.map((it) => {
          const variants = Object.entries(it.variants ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
          return (
            <div className="rcpt-item" key={it.id}>
              <div className="rcpt-item-name">{it.product_name}</div>
              {variants && <div className="rcpt-item-variants">{variants}</div>}
              <div className="rcpt-row">
                <span>{it.quantity} × {money(it.unit_price, currency)}</span>
                <span>{money(it.line_total, currency)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <hr className="rcpt-sep" />

      <div className="rcpt-row"><span>{L("common.subtotal")}</span><span>{money(order.subtotal, currency)}</span></div>
      {Number(order.discount) > 0 && (
        <div className="rcpt-row"><span>{L("common.discount")}</span><span>-{money(order.discount, currency)}</span></div>
      )}
      {Number(order.shipping_fee) > 0 && (
        <div className="rcpt-row"><span>{L("common.shipping")}</span><span>{money(order.shipping_fee, currency)}</span></div>
      )}
      <div className="rcpt-row">
        <span>{L("common.tax")}{settings.tax_rate ? ` (${+(Number(settings.tax_rate) * 100).toFixed(2)}%)` : ""}</span>
        <span>{money(order.tax, currency)}</span>
      </div>
      <hr className="rcpt-sep rcpt-sep--solid" />
      <div className="rcpt-row rcpt-total"><span>{L("common.total")}</span><span>{money(order.total, currency)}</span></div>
      <hr className="rcpt-sep" />

      {pay && (
        <div className="rcpt-meta">
          <div className="rcpt-row">
            <span>{L("pos.receipt.paymentMethod")}</span>
            <span>{pay.provider === "cash" ? L("pos.pay.cash") : methodLabel ?? L("pos.pay.wallet")}</span>
          </div>
          {pay.provider !== "cash" && pay.account_no && (
            <div className="rcpt-row"><span>{L("pos.receipt.account")}</span><span>{maskedAccount(pay.account_no)}</span></div>
          )}
          {pay.transaction_id && (
            <div className="rcpt-row"><span>{L("pos.receipt.txn")}</span><span>{pay.transaction_id}</span></div>
          )}
          <div className="rcpt-row"><span>{L("pos.receipt.amount")}</span><span>{money(pay.amount, pay.currency || currency)}</span></div>
        </div>
      )}

      <div className="rcpt-center">
        <span className={`rcpt-badge${paid ? "" : " rcpt-badge--unpaid"}`}>
          {paid ? L("pos.receipt.paidStamp") : L(`status.${order.payment_status}`).toUpperCase()}
        </span>
      </div>

      {order.notes && <div className="rcpt-small rcpt-muted" style={{ marginTop: 6 }}>{order.notes}</div>}
      <div className="rcpt-footer">{settings.receipt_footer || L("pos.receipt.thanks")}</div>
      <div className="rcpt-center rcpt-small rcpt-muted" style={{ marginTop: 4 }}>{order.id.slice(0, 8).toUpperCase()}</div>
    </div>
  );
}

export interface PrintReceiptOptions {
  cashierName?: string | null;
  size?: ReceiptSize;
  lang?: Lang;
}

function pageCss(size: ReceiptSize): string {
  return size === "a4"
    ? "@page { size: A4; margin: 14mm; } html,body{margin:0;padding:0;background:#fff;}"
    : "@page { size: 80mm auto; margin: 0; } html,body{margin:0;padding:0;background:#fff;width:80mm;} .rcpt{width:80mm;padding:3mm 4mm 6mm;}";
}

/**
 * Prints a receipt via a hidden iframe so the app's own layout never
 * leaks into the printout. Resolves once the print dialog has closed
 * (or after a safety timeout in browsers where print() doesn't block).
 */
export function printReceipt(order: Order, settings: StoreSettings, opts: PrintReceiptOptions = {}): Promise<void> {
  const size = opts.size ?? "80mm";
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "receipt-print";
    Object.assign(iframe.style, {
      position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden",
    });
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument ?? win?.document;
    if (!win || !doc) {
      iframe.remove();
      reject(new Error("PRINT_UNAVAILABLE"));
      return;
    }

    doc.open();
    doc.write(
      `<!doctype html><html lang="${opts.lang ?? "so"}"><head><meta charset="utf-8"><title>${order.order_number}</title>` +
        `<style>${receiptCss}\n${pageCss(size)}</style></head><body><div id="r"></div></body></html>`,
    );
    doc.close();

    const root = createRoot(doc.getElementById("r")!);
    flushSync(() => {
      root.render(
        <ReceiptView order={order} settings={settings} cashierName={opts.cashierName} size={size} lang={opts.lang} />,
      );
    });

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        root.unmount();
        iframe.remove();
        resolve();
      }, 300);
    };
    win.addEventListener("afterprint", cleanup);

    // Let layout/fonts settle before printing.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        done = true;
        root.unmount();
        iframe.remove();
        reject(e);
        return;
      }
      // Fallback for browsers that don't fire afterprint in iframes.
      setTimeout(cleanup, 60_000);
    }, 120);
  });
}

/**
 * Loads an order (items, payments, customer) and store settings and shows a
 * receipt preview with size toggle + Print button. Props are a stable contract
 * (used from the admin order detail page).
 */
export function ReceiptPrint({ orderId }: { orderId: string }) {
  const { t, lang } = useI18n();
  const [size, setSize] = useState<ReceiptSize>("80mm");
  const [printing, setPrinting] = useState(false);
  const orderQ = useReceiptOrder(orderId);
  const settingsQ = useStoreSettings();
  const cashierQ = useStaffName(orderQ.data?.created_by);

  if (orderQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-[420px] w-full max-w-[320px]" />
      </div>
    );
  }
  if (orderQ.error || !orderQ.data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{t("pos.receipt.loadError")}</span>
          <Button size="sm" variant="outline" onClick={() => orderQ.refetch()}>{t("common.retry")}</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const order = orderQ.data;
  const settings = settingsQ.data ?? ({ store_name: "", currency: order.currency, tax_rate: 0 } as StoreSettings);

  const onPrint = async () => {
    setPrinting(true);
    try {
      await printReceipt(order, settings, { size, lang, cashierName: cashierQ.data });
    } catch {
      /* the browser shows its own error */
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={size}
          onValueChange={(v) => v && setSize(v as ReceiptSize)}
          aria-label={t("pos.receipt.size")}
        >
          <ToggleGroupItem value="80mm">{t("pos.receipt.size80")}</ToggleGroupItem>
          <ToggleGroupItem value="a4">A4</ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={onPrint} disabled={printing}>
          {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          {t("pos.receipt.print")}
        </Button>
      </div>
      <div className={`rcpt-preview ${size === "a4" ? "max-w-[720px] p-6" : "max-w-[340px]"}`}>
        <ReceiptView order={order} settings={settings} cashierName={cashierQ.data} size={size} lang={lang} />
      </div>
    </div>
  );
}

export default ReceiptPrint;
