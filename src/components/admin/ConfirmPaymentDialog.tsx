import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Order, Payment, PayResponse } from "@/integrations/supabase/types";
import { payOrder } from "@/lib/payments";
import { serverPayMessage } from "@/lib/payment-state";
import { useI18n } from "@/lib/i18n";
import { maskPhone } from "@/lib/wallet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Mirrors the edge function's TRANSACTION_ID_RE. */
const TXN_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** WaafiPay attempts that a manual confirmation may approve (newest first). */
export function confirmablePayments(payments: Payment[] | null | undefined): Payment[] {
  return (payments ?? [])
    .filter((p) => p.provider === "waafipay" && (p.status === "initiated" || p.status === "pending" || p.status === "failed"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Manual reconciliation: marks a pending/failed WaafiPay attempt approved after checking the merchant portal. */
export const ConfirmPaymentDialog = ({
  order, open, onOpenChange, onDone,
}: { order: Order; open: boolean; onOpenChange: (o: boolean) => void; onDone?: (r: PayResponse) => void }) => {
  const { t, lang, formatMoney, formatDate } = useI18n();
  const candidates = confirmablePayments(order.payments);
  const [paymentId, setPaymentId] = useState("");
  const [txn, setTxn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentId(confirmablePayments(order.payments)[0]?.id ?? "");
      setTxn("");
      setNote("");
    }
  }, [open, order.payments]);

  const txnTrim = txn.trim();
  const txnValid = TXN_RE.test(txnTrim);
  const canSubmit = !busy && !!paymentId && txnValid;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const res = await payOrder({
      action: "confirm",
      order_id: order.id,
      payment_id: paymentId,
      transaction_id: txnTrim,
      ...(note.trim() ? { reason: note.trim() } : {}),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(serverPayMessage(res, lang) || t("admin.confirm.done"));
      onOpenChange(false);
    } else {
      toast.error(serverPayMessage(res, lang) || t("admin.payment.failed"));
    }
    onDone?.(res);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.confirm.title")}</DialogTitle>
          <DialogDescription>{t("admin.confirm.desc", { order: order.order_number })}</DialogDescription>
        </DialogHeader>
        <form
          id="confirm-payment-form"
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          {candidates.length > 1 && (
            <div className="space-y-2">
              <Label>{t("admin.confirm.payment")}</Label>
              <Select value={paymentId} onValueChange={setPaymentId} disabled={busy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {candidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatDate(p.created_at, true)} · {formatMoney(p.amount, p.currency)} · {t(`status.${p.status}`)}
                      {p.account_no ? ` · ${maskPhone(p.account_no)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="confirm-txn">{t("admin.confirm.txnId")}</Label>
            <Input
              id="confirm-txn"
              value={txn}
              onChange={(e) => setTxn(e.target.value)}
              autoComplete="off"
              className="font-mono"
              maxLength={64}
              required
              disabled={busy}
              aria-invalid={!!txnTrim && !txnValid}
              aria-describedby="confirm-txn-hint"
            />
            <p id="confirm-txn-hint" className={txnTrim && !txnValid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {txnTrim && !txnValid ? t("admin.confirm.txnInvalid") : t("admin.confirm.txnHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-note">{t("admin.confirm.note")}</Label>
            <Textarea id="confirm-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} disabled={busy} />
          </div>
          <Alert className="border-warning/40 bg-warning/10">
            <AlertTriangle className="h-4 w-4 !text-warning" />
            <AlertDescription className="text-xs">{t("admin.confirm.warning")}</AlertDescription>
          </Alert>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("common.cancel")}</Button>
          <Button type="submit" form="confirm-payment-form" disabled={!canSubmit}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("admin.confirm.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmPaymentDialog;
