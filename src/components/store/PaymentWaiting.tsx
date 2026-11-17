import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Smartphone } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { formatSomaliPhone } from "@/lib/wallet";

/** Full-screen "check your phone and enter your PIN" state while WaafiPay waits for approval. */
const PaymentWaiting = ({
  open,
  startedAt,
  walletLabel,
  phone,
  amount,
}: {
  open: boolean;
  startedAt: number | null;
  walletLabel?: string | null;
  phone?: string | null;
  amount?: string;
}) => {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // Warn before leaving while the request is in flight.
  useEffect(() => {
    if (!open) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [open]);

  if (!open) return null;
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="pay-wait-title" aria-describedby="pay-wait-desc">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-card-hover">
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <Loader2 className="absolute h-20 w-20 animate-spin text-accent/40" strokeWidth={1.25} />
          <Smartphone className="h-9 w-9 text-primary" />
        </div>
        <h2 id="pay-wait-title" className="mt-5 font-heading text-xl font-bold">{t("store.pay.waitTitle")}</h2>
        <p id="pay-wait-desc" className="mt-2 text-sm text-muted-foreground">
          {t("store.pay.waitDesc", { wallet: walletLabel ?? t("common.wallet") })}
        </p>
        {(phone || amount) && (
          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
            {amount && <p className="font-semibold">{amount}</p>}
            {phone && <p className="text-muted-foreground">{formatSomaliPhone(phone)}</p>}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground" aria-live="off">
          {t("store.pay.elapsed")}: <span className="font-mono tabular-nums">{mmss}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("store.pay.dontClose")}</p>
      </motion.div>
    </div>,
    document.body,
  );
};

export default PaymentWaiting;
