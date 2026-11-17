import { Badge } from "@/components/ui/badge";
import type { OrderStatus, PaymentRowStatus, PaymentStatus } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  unpaid: "bg-muted text-muted-foreground border-border",
  initiated: "bg-warning/15 text-warning border-warning/30",
  paid: "bg-success/15 text-success border-success/30",
  approved: "bg-success/15 text-success border-success/30",
  processing: "bg-accent/15 text-accent border-accent/30",
  shipped: "bg-primary/10 text-primary border-primary/20",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  refunded: "bg-muted text-muted-foreground border-border",
  reversed: "bg-muted text-muted-foreground border-border",
};

export const StatusBadge = ({ status, className }: { status: OrderStatus | PaymentStatus | PaymentRowStatus; className?: string }) => {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={cn("font-semibold", TONE[status] ?? "", className)}>
      {t(`status.${status}`)}
    </Badge>
  );
};
