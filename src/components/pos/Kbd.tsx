import { cn } from "@/lib/utils";

/** Keyboard shortcut hint. Hidden on touch-only small screens. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground sm:inline-block",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
