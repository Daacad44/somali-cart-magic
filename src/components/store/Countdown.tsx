import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to `endsAt`; renders nothing once expired (calls onExpire). */
const Countdown = ({ endsAt, onExpire, className, tone = "light" }: {
  endsAt: string;
  onExpire?: () => void;
  className?: string;
  tone?: "light" | "dark";
}) => {
  const { t } = useI18n();
  const end = Date.parse(endsAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = end - now;
  useEffect(() => {
    if (remaining <= 0) onExpire?.();
  }, [remaining <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isFinite(end) || remaining <= 0) return null;
  const { d, h, m, s } = parts(remaining);
  const cells: [number, string][] = [[d, t("store.countdown.days")], [h, t("store.countdown.hours")], [m, t("store.countdown.minutes")], [s, t("store.countdown.seconds")]];

  return (
    <div className={cn("flex items-center gap-2", className)} role="timer" aria-label={t("store.countdown.label")}>
      {cells.map(([v, label]) => (
        <div
          key={label}
          className={cn(
            "flex min-w-[3.25rem] flex-col items-center rounded-lg px-2 py-1.5",
            tone === "light" ? "bg-primary-foreground/10 text-primary-foreground backdrop-blur-sm" : "bg-muted text-foreground",
          )}
        >
          <span className="font-heading text-xl font-bold tabular-nums">{String(v).padStart(2, "0")}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
        </div>
      ))}
    </div>
  );
};

export default Countdown;
