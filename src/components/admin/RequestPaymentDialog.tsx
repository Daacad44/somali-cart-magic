import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Order, PayResponse } from "@/integrations/supabase/types";
import { fetchWalletPrefixes, payOrder } from "@/lib/payments";
import { PAYMENT_STALE_MS, serverPayMessage } from "@/lib/payment-state";
import { formatCountdown, useCountdown } from "@/hooks/usePaymentClock";
import { detectWallet, normalizeSomaliPhone, WALLET_LABELS, type Wallet } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const AUTO = "auto";
const WALLETS: Wallet[] = ["EVC_PLUS", "ZAAD", "SAHAL", "WAAFI", "JEEB", "EDAHAB"];

/** Sends a WaafiPay purchase request for an existing order and waits for the payer's approval. */
export const RequestPaymentDialog = ({
  order, open, onOpenChange, onDone,
}: { order: Order; open: boolean; onOpenChange: (o: boolean) => void; onDone?: (r: PayResponse) => void }) => {
  const { t, lang, formatMoney } = useI18n();
  const [phone, setPhone] = useState(order.shipping_phone ?? order.customer?.phone ?? "");
  const [wallet, setWallet] = useState<string>(AUTO);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PayResponse | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const retryIn = useCountdown(retryAt);

  useEffect(() => {
    if (open) {
      setPhone(order.shipping_phone ?? order.customer?.phone ?? "");
      setWallet(AUTO);
      setResult(null);
      setRetryAt(null);
    }
  }, [open, order.shipping_phone, order.customer?.phone]);

  const prefixes = useQuery({ queryKey: ["wallet-prefixes", "active"], queryFn: fetchWalletPrefixes, staleTime: 5 * 60_000 });
  const normalized = normalizeSomaliPhone(phone);
  const detected = useMemo(() => detectWallet(phone, prefixes.data ?? []), [phone, prefixes.data]);
  const canSubmit = !!normalized && (wallet !== AUTO || !!detected) && !busy;

  const submit = async () => {
    if (!normalized) return;
    setBusy(true);
    setResult(null);
    const startedAt = Date.now();
    const res = await payOrder({
      action: "purchase",
      order_id: order.id,
      phone: normalized,
      ...(wallet !== AUTO ? { wallet: wallet as Wallet } : {}),
    });
    setBusy(false);
    setResult(res);
    // No gateway answer: the attempt stays pending until it goes stale.
    const noAnswer = !res.ok && (res.code === "UNKNOWN" || res.status === "pending");
    setRetryAt(noAnswer ? startedAt + PAYMENT_STALE_MS : null);
    const msg = serverPayMessage(res, lang);
    if (res.ok) toast.success(msg || t("admin.payment.approved"));
    else if (noAnswer) toast.warning(t("admin.payment.unknownTitle"));
    else toast.error(msg || t("admin.payment.failed"));
    onDone?.(res);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.payment.requestTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.payment.requestDesc", { order: order.order_number, amount: formatMoney(order.total, order.currency) })}
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
            <div className="relative">
              <Smartphone className="h-10 w-10 text-primary" />
              <Loader2 className="absolute -right-3 -top-3 h-5 w-5 animate-spin text-secondary" />
            </div>
            <p className="font-medium">{t("admin.payment.waiting")}</p>
            <p className="max-w-xs text-sm text-muted-foreground">{t("admin.payment.waitingHint")}</p>
          </div>
        ) : result && retryAt ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status" aria-live="polite">
            <Clock className="h-10 w-10 text-warning" />
            <p className="font-medium">{t("admin.payment.unknownTitle")}</p>
            <p className="max-w-xs text-sm tabular-nums text-muted-foreground">
              {t("admin.payment.unknownDesc", { time: formatCountdown(retryIn) })}
            </p>
            {result.code && <p className="text-xs text-muted-foreground">{result.code}</p>}
          </div>
        ) : result ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" aria-live="polite">
            {result.ok ? <CheckCircle2 className="h-10 w-10 text-success" /> : <XCircle className="h-10 w-10 text-destructive" />}
            <p className="font-medium">{result.ok ? t("admin.payment.approved") : t("admin.payment.failed")}</p>
            <p className="text-sm text-muted-foreground">{serverPayMessage(result, lang)}</p>
            {result.code && <p className="text-xs text-muted-foreground">{result.code}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-phone">{t("admin.payment.payerPhone")}</Label>
              <Input
                id="pay-phone"
                inputMode="tel"
                autoComplete="off"
                placeholder="61 234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={!!phone && !normalized}
              />
              {phone && !normalized ? (
                <p className="text-xs text-destructive">{t("admin.validation.phone")}</p>
              ) : detected ? (
                <p className="text-xs text-muted-foreground">{t("admin.payment.detected", { wallet: WALLET_LABELS[detected.wallet], provider: detected.provider_name })}</p>
              ) : normalized ? (
                <p className="text-xs text-warning">{t("admin.payment.notDetected")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{t("admin.payment.walletOverride")}</Label>
              <Select value={wallet} onValueChange={setWallet}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>{t("admin.payment.autoDetect")}</SelectItem>
                  {WALLETS.map((w) => <SelectItem key={w} value={w}>{WALLET_LABELS[w]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertDescription className="text-xs">{t("admin.payment.pinNote")}</AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              {!result.ok && (
                <Button variant="outline" onClick={() => { setResult(null); setRetryAt(null); }} disabled={retryIn > 0}>
                  {t("common.retry")}
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("common.cancel")}</Button>
              <Button onClick={submit} disabled={!canSubmit}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("admin.payment.send")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestPaymentDialog;
