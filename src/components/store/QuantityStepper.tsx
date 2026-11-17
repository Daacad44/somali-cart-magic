import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const QuantityStepper = ({
  value,
  min = 1,
  max,
  onChange,
  size = "md",
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) => {
  const { t } = useI18n();
  const btn = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-background", disabled && "opacity-50")}>
      <button
        type="button"
        className={cn(btn, "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40")}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={t("store.qty.decrease")}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={cn("text-center font-semibold tabular-nums", size === "sm" ? "w-8 text-xs" : "w-10 text-sm")} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40")}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={t("store.qty.increase")}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default QuantityStepper;
