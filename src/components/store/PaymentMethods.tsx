import { Smartphone } from "lucide-react";
import { WALLET_LABELS } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { STORE_WALLETS } from "./wallets";

/** Compact chips (cart/footer) or cards (home page) of accepted wallets. */
const PaymentMethods = ({ variant = "chips", className }: { variant?: "chips" | "cards"; className?: string }) => {
  if (variant === "chips") {
    return (
      <ul className={cn("flex flex-wrap gap-1.5", className)}>
        {STORE_WALLETS.map((w) => (
          <li key={w.id} className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {WALLET_LABELS[w.id]}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {STORE_WALLETS.map((w) => (
        <li key={w.id} className="rounded-xl border border-border bg-card p-4 text-center transition-shadow hover:shadow-premium">
          <div className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-xl", w.tone)}>
            <Smartphone className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 font-heading text-sm font-bold">{WALLET_LABELS[w.id]}</p>
          {w.provider && <p className="mt-0.5 text-xs text-muted-foreground">{w.provider}</p>}
        </li>
      ))}
    </ul>
  );
};

export default PaymentMethods;
