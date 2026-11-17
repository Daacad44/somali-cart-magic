import { useId } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Smartphone } from "lucide-react";
import type { WalletPrefixRow } from "@/integrations/supabase/types";
import { WALLET_LABELS, type Wallet } from "@/lib/wallet";
import { WALLETS, detectFor } from "./walletDetect";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  phone: string;
  onPhoneChange: (v: string) => void;
  override: Wallet | null;
  onOverrideChange: (w: Wallet | null) => void;
  prefixes: WalletPrefixRow[] | undefined;
  prefixesLoading?: boolean;
  disabled?: boolean;
  phoneInputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

/** Payer phone input + live wallet detection badge + staff wallet override. */
export function WalletFields({
  phone, onPhoneChange, override, onOverrideChange, prefixes, prefixesLoading, disabled, phoneInputRef, autoFocus,
}: Props) {
  const { t } = useI18n();
  const id = useId();
  const det = detectFor(phone, prefixes, override);
  const typed = phone.replace(/\D/g, "").length > 0;

  let badge: React.ReactNode;
  if (!typed) {
    badge = <span className="text-muted-foreground">{t("pos.pay.enterNumber")}</span>;
  } else if (!det.normalized) {
    badge = (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" /> {t("pos.pay.invalidPhone")}
      </span>
    );
  } else if (prefixesLoading && !det.detected) {
    badge = (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("pos.pay.detecting")}
      </span>
    );
  } else if (det.detected) {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {WALLET_LABELS[det.detected.wallet]} · {det.detected.provider_name}
      </span>
    );
  } else {
    badge = (
      <span className="inline-flex items-center gap-1 text-warning">
        <AlertTriangle className="h-3.5 w-3.5" /> {t("pos.pay.walletUnknown")}
      </span>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-phone`}>{t("pos.pay.payerPhone")}</Label>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${id}-phone`}
            ref={phoneInputRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="61 234 5678"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            disabled={disabled}
            className="h-11 pl-9 text-base tabular-nums"
            aria-describedby={`${id}-badge`}
            aria-invalid={typed && !det.normalized ? true : undefined}
          />
        </div>
        <div id={`${id}-badge`} className="min-h-[1.5rem] text-xs" aria-live="polite">
          {badge}
          {override && det.normalized && (
            <span className={cn("ml-2 text-muted-foreground")}>
              {t("pos.pay.overrideActive", { wallet: WALLET_LABELS[override] })}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1.5 sm:w-40">
        <Label htmlFor={`${id}-wallet`}>{t("pos.pay.walletOverride")}</Label>
        <Select
          value={override ?? "auto"}
          onValueChange={(v) => onOverrideChange(v === "auto" ? null : (v as Wallet))}
          disabled={disabled}
        >
          <SelectTrigger id={`${id}-wallet`} className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("pos.pay.auto")}</SelectItem>
            {WALLETS.map((w) => (
              <SelectItem key={w} value={w}>{WALLET_LABELS[w]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
