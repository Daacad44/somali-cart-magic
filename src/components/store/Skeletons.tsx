import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const ProductCardSkeleton = ({ layout = "grid" }: { layout?: "grid" | "list" }) =>
  layout === "list" ? (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-28 w-28 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  ) : (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );

export const ProductGridSkeleton = ({
  count = 4,
  layout = "grid",
  className,
}: { count?: number; layout?: "grid" | "list"; className?: string }) => (
  <div className={cn(layout === "list" ? "flex flex-col gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} layout={layout} />
    ))}
  </div>
);
