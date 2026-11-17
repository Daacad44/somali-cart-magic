import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Printer, ReceiptText } from "lucide-react";
import { useMySalesToday, type SaleSummary } from "@/hooks/pos";
import { WALLET_LABELS, type Wallet } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Method = Wallet | "CASH";

function saleMethod(s: SaleSummary): Method | null {
  const approved = s.payments.find((p) => p.status === "approved");
  if (!approved) return null;
  if (approved.provider === "cash") return "CASH";
  return (approved.wallet as Method) ?? null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
  onReprint: (orderId: string) => Promise<void>;
}

export function SalesTodaySheet({ open, onOpenChange, currency, onReprint }: Props) {
  const { t, formatMoney } = useI18n();
  const { data, isLoading, error, refetch, isFetching } = useMySalesToday(open);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const byMethod = new Map<Method, { count: number; amount: number }>();
    let total = 0;
    let paid = 0;
    let open = 0;
    for (const s of data ?? []) {
      if (s.payment_status === "paid") {
        paid++;
        total += Number(s.total);
        const m = saleMethod(s) ?? "CASH";
        const cur = byMethod.get(m) ?? { count: 0, amount: 0 };
        byMethod.set(m, { count: cur.count + 1, amount: Math.round((cur.amount + Number(s.total)) * 100) / 100 });
      } else if (s.status !== "cancelled") {
        open++;
      }
    }
    return { byMethod: [...byMethod.entries()].sort((a, b) => b[1].amount - a[1].amount), total, paid, open };
  }, [data]);

  const reprint = async (id: string) => {
    setPrintingId(id);
    try { await onReprint(id); } finally { setPrintingId(null); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading">{t("pos.sales.title")}</SheetTitle>
          <SheetDescription>{t("pos.sales.subtitle")}</SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm">{t("pos.sales.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>{t("common.retry")}</Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t("pos.sales.totalPaid")}</span>
                <span className="text-2xl font-bold tabular-nums">{formatMoney(summary.total, currency)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("pos.sales.counts", { paid: summary.paid, open: summary.open })}
                {isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
              </p>
              {summary.byMethod.length > 0 && (
                <dl className="mt-3 space-y-1.5 border-t pt-3">
                  {summary.byMethod.map(([m, v]) => (
                    <div key={m} className="flex items-center justify-between text-sm">
                      <dt className="flex items-center gap-2">
                        <span>{m === "CASH" ? t("pos.pay.cash") : WALLET_LABELS[m]}</span>
                        <span className="text-xs text-muted-foreground">×{v.count}</span>
                      </dt>
                      <dd className="font-medium tabular-nums">{formatMoney(v.amount, currency)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {(data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <ReceiptText className="h-8 w-8" />
                <p className="text-sm">{t("pos.sales.empty")}</p>
              </div>
            ) : (
              <ScrollArea className="-mx-2 flex-1 px-2">
                <ul className="divide-y">
                  {data!.map((s) => {
                    const m = saleMethod(s);
                    const paid = s.payment_status === "paid";
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.order_number}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                paid && "border-success/40 text-success",
                                s.status === "cancelled" && "text-muted-foreground",
                                !paid && s.status !== "cancelled" && "border-warning/40 text-warning",
                              )}
                            >
                              {s.status === "cancelled" ? t("status.cancelled") : t(`status.${s.payment_status}`)}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" · "}
                            {s.customer?.full_name ?? s.shipping_name ?? t("pos.customer.walkIn")}
                            {m && ` · ${m === "CASH" ? t("pos.pay.cash") : WALLET_LABELS[m]}`}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(s.total, s.currency || currency)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={!paid || printingId !== null}
                          onClick={() => reprint(s.id)}
                          aria-label={t("pos.sales.reprint", { order: s.order_number })}
                          title={t("pos.sales.reprint", { order: s.order_number })}
                        >
                          {printingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
