import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { PosProduct } from "@/hooks/pos";
import { useI18n } from "@/lib/i18n";
import { missingVariants, type Variants } from "./ticket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  product: PosProduct | null;
  /** Units still available for this product given the current ticket. */
  available: number;
  currency: string;
  onClose: () => void;
  onConfirm: (product: PosProduct, variants: Variants, qty: number) => void;
}

/** Required variant selection (size/colour…) before adding a product to the ticket. */
export function VariantPicker({ product, available, currency, onClose, onConfirm }: Props) {
  const { t, pick, formatMoney } = useI18n();
  const [chosen, setChosen] = useState<Variants>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!product) return;
    // Preselect single-option variants.
    const init: Variants = {};
    for (const o of product.variant_options ?? []) if (o.options?.length === 1) init[o.type] = o.options[0];
    setChosen(init);
    setQty(1);
  }, [product]);

  if (!product) return null;
  const missing = missingVariants(product.variant_options, chosen);
  const canAdd = missing.length === 0 && available > 0;

  const submit = () => {
    if (canAdd) onConfirm(product, chosen, Math.min(qty, available));
  };

  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{pick(product.name, product.name_so)}</DialogTitle>
          <DialogDescription>
            {formatMoney(product.price, currency)} · {t("pos.products.inStock", { n: available })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {(product.variant_options ?? []).filter((o) => o.options?.length).map((o) => (
            <fieldset key={o.type} className="space-y-2">
              <legend className="text-sm font-medium">
                {o.type} <span className="text-destructive" aria-hidden>*</span>
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={o.type}>
                {o.options.map((opt) => {
                  const active = chosen[o.type] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setChosen((c) => ({ ...c, [o.type]: opt }))}
                      className={cn(
                        "min-h-[44px] min-w-[52px] rounded-md border px-3 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("pos.ticket.qty")}</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-10 w-10"
                onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t("pos.ticket.decrease")}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10"
                onClick={() => setQty((q) => Math.min(available, q + 1))} disabled={qty >= available} aria-label={t("pos.ticket.increase")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {missing.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("pos.variants.choose", { types: missing.join(", ") })}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!canAdd}>{t("pos.variants.add")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
