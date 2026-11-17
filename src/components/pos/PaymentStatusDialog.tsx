import { useEffect, useState } from "react";
import { Banknote, Loader2, RefreshCw, Smartphone, XCircle, Search } from "lucide-react";
import type { WalletPrefixRow } from "@/integrations/supabase/types";
import { WALLET_LABELS, maskPhone, type Wallet } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";
import type { PayState } from "./ticket";
import { WalletFields } from "./WalletFields";
import { detectFor } from "./walletDetect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const KNOWN_CODES = [
  "DECLINED", "TIMEOUT", "WALLET_NOT_DETECTED", "INVALID_PHONE", "ORDER_NOT_PAYABLE", "FORBIDDEN",
  "GATEWAY_ERROR", "NOT_CONFIGURED", "NETWORK",
];

export function payErrorKey(code: string | undefined): string {
  return code && KNOWN_CODES.includes(code) ? `pos.err.${code}` : "pos.err.generic";
}

function useElapsed(since: number | null | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  state: PayState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  currency: string;
  phone: string;
  onPhoneChange: (v: string) => void;
  override: Wallet | null;
  onOverrideChange: (w: Wallet | null) => void;
  prefixes: WalletPrefixRow[] | undefined;
  checking: boolean;
  onRetry: () => void;
  onPayCash: () => void;
  onCancelOrder: () => void;
  onCheckStatus: () => void;
}

export function PaymentStatusDialog({
  state, open, onOpenChange, total, currency, phone, onPhoneChange, override, onOverrideChange, prefixes,
  checking, onRetry, onPayCash, onCancelOrder, onCheckStatus,
}: Props) {
  const { t, formatMoney } = useI18n();
  const { phase, attempt, order, error } = state;
  const waiting = phase === "awaiting_payment";
  const elapsed = useElapsed(attempt?.startedAt, waiting);
  const busy = phase === "creating" || waiting || phase === "cancelling";
  const amount = order ? Number(order.total) : total;
  const walletLabel = attempt?.wallet ? WALLET_LABELS[attempt.wallet] : "";
  const det = detectFor(phone, prefixes, override);
  const canRetryWallet = Boolean(det.normalized && det.effective);
  const maybeStillPending = ["TIMEOUT", "NETWORK", "GATEWAY_ERROR", "ORDER_NOT_PAYABLE"].includes(error?.code ?? "");

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
        aria-busy={busy}
      >
        {phase === "creating" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">{t("pos.flow.creating")}</DialogTitle>
              <DialogDescription>{t("pos.flow.creatingHint")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
          </>
        )}

        {waiting && attempt && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">
                {attempt.method === "cash" ? t("pos.flow.recordingCash") : t("pos.flow.waiting", { wallet: walletLabel })}
              </DialogTitle>
              <DialogDescription>
                {attempt.method === "cash" ? t("pos.flow.cashHint") : t("pos.flow.waitingHint")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-4" role="status" aria-live="polite">
              <div className="relative">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  {attempt.method === "cash" ? <Banknote className="h-9 w-9 text-primary" /> : <Smartphone className="h-9 w-9 text-primary" />}
                </div>
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatMoney(amount, currency)}</p>
              {attempt.phone && (
                <p className="font-mono text-sm text-muted-foreground">{walletLabel} · {maskPhone(attempt.phone)}</p>
              )}
              <p className="text-sm tabular-nums text-muted-foreground">
                {t("pos.flow.elapsed")}: <span className="font-semibold text-foreground">{mmss(elapsed)}</span>
              </p>
              {order && <p className="text-xs text-muted-foreground">{t("pos.receipt.order")} {order.order_number}</p>}
              <p className="text-xs text-muted-foreground">{t("pos.flow.doNotClose")}</p>
            </div>
          </>
        )}

        {phase === "cancelling" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">{t("pos.flow.cancelling")}</DialogTitle>
              <DialogDescription>{order?.order_number}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
          </>
        )}

        {phase === "failed" && order && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">{t("pos.flow.failedTitle")}</DialogTitle>
              <DialogDescription>
                {t("pos.flow.failedOrderKept", { order: order.order_number, total: formatMoney(order.total, currency) })}
              </DialogDescription>
            </DialogHeader>
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>{t(payErrorKey(error?.code))}</AlertTitle>
              {error?.message && <AlertDescription className="text-xs">{error.message}</AlertDescription>}
            </Alert>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("pos.flow.retryWith")}</p>
              <WalletFields
                phone={phone}
                onPhoneChange={onPhoneChange}
                override={override}
                onOverrideChange={onOverrideChange}
                prefixes={prefixes}
              />
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button className="h-11 w-full" onClick={onRetry} disabled={!canRetryWallet}>
                <RefreshCw className="mr-2 h-4 w-4" /> {t("pos.flow.retry")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="h-11" onClick={onPayCash}>
                  <Banknote className="mr-2 h-4 w-4" /> {t("pos.flow.payCash")}
                </Button>
                <Button variant="outline" className="h-11 text-destructive hover:text-destructive" onClick={onCancelOrder}>
                  <XCircle className="mr-2 h-4 w-4" /> {t("pos.flow.cancelOrder")}
                </Button>
              </div>
              {maybeStillPending && (
                <Button variant="ghost" size="sm" onClick={onCheckStatus} disabled={checking}>
                  {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {t("pos.flow.checkStatus")}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
