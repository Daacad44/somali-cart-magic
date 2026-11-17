import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { WALLET_LABELS } from "@/lib/wallet";

/* ------------------------------------------------------------------ */

export const PageHeader = ({
  title, description, actions, className,
}: { title: string; description?: string; actions?: ReactNode; className?: string }) => (
  <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
    <div className="min-w-0">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/* ------------------------------------------------------------------ */

const TONES: Record<string, string> = {
  // order status
  pending: "bg-warning/15 border-warning/30 text-amber-700 dark:text-amber-300",
  paid: "bg-success/15 text-success border-success/30",
  processing: "bg-accent/15 text-accent border-accent/30 dark:text-primary",
  shipped: "bg-navy-soft text-navy border-navy/20",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  refunded: "bg-umber-soft text-umber border-umber/30",
  // payment status
  unpaid: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  // payment rows
  initiated: "bg-warning/15 border-warning/30 text-amber-700 dark:text-amber-300",
  approved: "bg-success/15 text-success border-success/30",
  reversed: "bg-umber-soft text-umber border-umber/30",
  // misc
  active: "bg-success/15 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

/** Status pill. Text label always present (never color-only). */
export const StatusBadge = ({ status, label, className }: { status: string; label?: string; className?: string }) => {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium capitalize", TONES[status] ?? "bg-muted text-foreground", className)}
    >
      {label ?? t(`status.${status}`)}
    </Badge>
  );
};

export const WalletBadge = ({ wallet }: { wallet: string | null | undefined }) => (
  <Badge variant="secondary" className="whitespace-nowrap font-medium">
    {wallet ? WALLET_LABELS[wallet as keyof typeof WALLET_LABELS] ?? wallet : "—"}
  </Badge>
);

export const ChannelBadge = ({ channel }: { channel: string }) => {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", channel === "pos" ? "border-umber/40 text-umber" : "border-navy/30 text-navy")}>
      {t(`admin.channel.${channel}`)}
    </Badge>
  );
};

/* ------------------------------------------------------------------ */

export const EmptyState = ({
  title, description, icon: Icon = Inbox, action, className,
}: { title: string; description?: string; icon?: typeof Inbox; action?: ReactNode; className?: string }) => (
  <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-14 text-center", className)}>
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
    </div>
    <p className="mt-1 font-medium text-foreground">{title}</p>
    {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry, className }: { error?: unknown; onRetry?: () => void; className?: string }) => {
  const { t } = useI18n();
  const msg = error instanceof Error ? error.message : (error as { message?: string })?.message;
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 px-4 py-12 text-center", className)}>
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-medium">{t("common.error")}</p>
      {msg && <p className="max-w-md text-sm text-muted-foreground">{msg}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
};

export const TableSkeleton = ({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-3 p-4" aria-busy="true">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4">
        {Array.from({ length: cols }).map((__, c) => (
          <Skeleton key={c} className={cn("h-5", c === 0 ? "w-1/4" : "flex-1")} />
        ))}
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */

export const DataPagination = ({
  page, pageCount, total, onPage, loading,
}: { page: number; pageCount: number; total?: number | null; onPage: (p: number) => void; loading?: boolean }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {typeof total === "number" ? t("admin.pagination.summary", { page, pages: pageCount, total }) : null}
      </p>
      <div className="flex items-center gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={t("admin.pagination.prev")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label={t("admin.pagination.next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

/** Confirmation dialog for destructive / irreversible actions. Optionally collects a reason. */
export const ConfirmDialog = ({
  open, onOpenChange, title, description, confirmLabel, destructive = true, onConfirm, withReason, reasonRequired,
  reasonLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
  withReason?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
}) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const disabled = busy || (withReason && reasonRequired && !reason.trim());
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) setReason("");
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {withReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reasonLabel ?? t("admin.common.reason")}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            className={cn(destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setReason("");
                onOpenChange(false);
              } catch {
                // Caller already surfaced the error (toast); keep the dialog open.
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel ?? t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
