import { useState } from "react";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { rpcErrorMessage } from "@/integrations/supabase/client";
import { useCancelOrder } from "@/hooks/store/useOrders";
import { useI18n } from "@/lib/i18n";

const CancelOrderButton = ({ orderId, orderNumber, className }: { orderId: string; orderNumber: string; className?: string }) => {
  const { t, lang } = useI18n();
  const cancel = useCancelOrder();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const confirm = (e: React.MouseEvent) => {
    e.preventDefault();
    cancel.mutate(
      { orderId, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t("store.order.cancelled"));
          setOpen(false);
        },
        onError: (err) => toast.error(rpcErrorMessage(err, lang)),
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className={className}>
          <XCircle className="mr-2 h-4 w-4" /> {t("store.order.cancel")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("store.order.cancelTitle", { number: orderNumber })}</AlertDialogTitle>
          <AlertDialogDescription>{t("store.order.cancelDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">{t("store.order.cancelReason")}</Label>
          <Textarea id="cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>{t("common.back")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={cancel.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {cancel.isPending ? t("common.loading") : t("store.order.confirmCancel")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancelOrderButton;
