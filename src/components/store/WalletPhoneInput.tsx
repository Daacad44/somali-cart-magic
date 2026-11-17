import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWalletPrefixes } from "@/hooks/store/useCustomer";
import { useI18n } from "@/lib/i18n";
import { WALLET_LABELS } from "@/lib/wallet";
import type { WalletDetection } from "@/hooks/store/useWalletDetection";
import { cn } from "@/lib/utils";

/** Phone input with live wallet detection badge ("EVC Plus (Hormuud)"). */
const WalletPhoneInput = ({
  id = "pay-phone",
  value,
  onChange,
  detection,
  disabled,
  label,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  detection: WalletDetection;
  disabled?: boolean;
  label?: string;
}) => {
  const { t } = useI18n();
  const { isLoading } = useWalletPrefixes();
  const touched = value.replace(/\D/g, "").length >= 7;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {label ?? t("store.pay.phoneLabel")}
      </Label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+252 61 234 5678"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={`${id}-status`}
        aria-invalid={touched && !detection.normalized}
      />
      <div id={`${id}-status`} aria-live="polite" className="min-h-[1.75rem]">
        {isLoading && detection.normalized ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("store.pay.detecting")}
          </span>
        ) : detection.wallet ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {WALLET_LABELS[detection.wallet.wallet]} ({detection.wallet.provider_name})
          </span>
        ) : touched && !detection.normalized ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {t("store.pay.invalidPhone")}
          </span>
        ) : detection.normalized && detection.prefixesReady ? (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning")}>
            <AlertTriangle className="h-3.5 w-3.5" /> {t("store.pay.walletNotDetected")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("store.pay.phoneHint")}</span>
        )}
      </div>
    </div>
  );
};

export default WalletPhoneInput;
