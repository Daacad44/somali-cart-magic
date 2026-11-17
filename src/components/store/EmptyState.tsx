import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center justify-center px-4 py-16 text-center", className)}>
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
    </div>
    <h2 className="mt-4 font-heading text-xl font-bold">{title}</h2>
    {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
