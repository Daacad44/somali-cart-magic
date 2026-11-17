import { Heart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import type { Product } from "@/integrations/supabase/types";
import { useWishlist } from "@/hooks/store/useWishlist";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const WishlistButton = ({ product, className, iconClassName }: { product: Product; className?: string; iconClassName?: string }) => {
  const { t } = useI18n();
  const { has, toggle, isSignedIn } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const active = has(product.id);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      toast(t("store.wishlist.signInRequired"), {
        action: {
          label: t("common.signIn"),
          onClick: () => navigate(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`),
        },
      });
      return;
    }
    toggle.mutate(
      { product, add: !active },
      {
        onSuccess: (added) => toast.success(added ? t("store.wishlist.added") : t("store.wishlist.removed")),
        onError: () => toast.error(t("common.error")),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? t("store.wishlist.remove") : t("store.wishlist.add")}
      title={active ? t("store.wishlist.remove") : t("store.wishlist.add")}
      className={cn(
        "flex items-center justify-center rounded-lg transition-colors",
        active ? "text-destructive" : "text-muted-foreground hover:text-destructive",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", active && "fill-current", iconClassName)} />
    </button>
  );
};

export default WishlistButton;
