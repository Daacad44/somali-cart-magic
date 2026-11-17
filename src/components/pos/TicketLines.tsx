import { ImageOff, Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { maxQtyForLine, round2, type TicketLine } from "./ticket";
import { Button } from "@/components/ui/button";

interface Props {
  lines: TicketLine[];
  currency: string;
  locked: boolean;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}

export function TicketLines({ lines, currency, locked, onQty, onRemove }: Props) {
  const { t, pick, formatMoney } = useI18n();

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
        <ShoppingBasket className="h-8 w-8" />
        <p className="text-sm">{t("pos.ticket.empty")}</p>
        <p className="text-xs">{t("pos.ticket.emptyHint")}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y" aria-label={t("pos.ticket.items")}>
      {lines.map((l) => {
        const max = maxQtyForLine(lines, l.key);
        const name = pick(l.name, l.nameSo);
        const variants = Object.entries(l.variants).map(([k, v]) => `${k}: ${v}`).join(" · ");
        return (
          <li key={l.key} className="flex gap-3 py-2.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {l.image ? (
                <img src={l.image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-4 w-4" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {variants && <p className="truncate text-xs text-muted-foreground">{variants}</p>}
                  <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(l.unitPrice, currency)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(round2(l.unitPrice * l.quantity), currency)}</p>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1" role="group" aria-label={t("pos.ticket.qtyFor", { name })}>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => onQty(l.key, l.quantity - 1)} disabled={locked || l.quantity <= 1}
                    aria-label={t("pos.ticket.decrease")}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={max}
                    value={l.quantity}
                    disabled={locked}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n) && n > 0) onQty(l.key, n);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9 w-12 rounded-md border border-input bg-background text-center text-sm font-semibold tabular-nums [appearance:textfield] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label={t("pos.ticket.qty")}
                  />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => onQty(l.key, l.quantity + 1)} disabled={locked || l.quantity >= max}
                    aria-label={t("pos.ticket.increase")}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {l.quantity >= max && <span className="ml-1 text-[11px] text-warning">{t("pos.ticket.maxStock")}</span>}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(l.key)} disabled={locked} aria-label={t("pos.ticket.remove", { name })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
