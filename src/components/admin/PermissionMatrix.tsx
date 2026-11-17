import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { PERMISSION_PRESETS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { usePermissionCatalog } from "@/hooks/admin/useAdminUsers";
import { groupPermissions, samePermissions, toggleGroup, togglePermission } from "./utils";

/** Grouped permission checklist with one-click presets. */
export const PermissionMatrix = ({
  value, onChange, disabled, className,
}: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; className?: string }) => {
  const { t, pick, lang } = useI18n();
  const catalog = usePermissionCatalog();
  const groups = useMemo(() => groupPermissions(catalog.data ?? []), [catalog.data]);

  if (catalog.isLoading) return <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-24" /></div>;
  if (catalog.isError) return <p className="text-sm text-destructive">{t("common.error")}</p>;

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("admin.users.presets")}</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PERMISSION_PRESETS).map(([key, preset]) => {
            const active = samePermissions(value, preset.permissions);
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onChange([...preset.permissions].sort())}
                aria-pressed={active}
              >
                {lang === "so" ? preset.so : preset.en}
              </Button>
            );
          })}
          <Button type="button" size="sm" variant="ghost" disabled={disabled || value.length === 0} onClick={() => onChange([])}>
            {t("admin.users.clearAll")}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const keys = g.items.map((i) => i.key);
          const on = keys.filter((k) => value.includes(k)).length;
          const state = on === 0 ? false : on === keys.length ? true : "indeterminate";
          const gid = `perm-group-${g.group}`;
          return (
            <fieldset key={g.group} className="rounded-md border p-3" disabled={disabled}>
              <legend className="sr-only">{t(`admin.permGroup.${g.group}`)}</legend>
              <div className="mb-2 flex items-center gap-2 border-b pb-2">
                <Checkbox id={gid} checked={state} onCheckedChange={() => onChange(toggleGroup(value, keys))} disabled={disabled} />
                <label htmlFor={gid} className="text-sm font-semibold">{t(`admin.permGroup.${g.group}`)}</label>
                <span className="ml-auto text-xs text-muted-foreground">{on}/{keys.length}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((p) => {
                  const id = `perm-${p.key}`;
                  return (
                    <div key={p.key} className="flex items-start gap-2">
                      <Checkbox id={id} checked={value.includes(p.key)} onCheckedChange={(c) => onChange(togglePermission(value, p.key, c === true))} disabled={disabled} className="mt-0.5" />
                      <label htmlFor={id} className="text-sm leading-tight">
                        {pick(p.label_en, p.label_so)}
                        <span className="block font-mono text-[10px] text-muted-foreground">{p.key}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
};

export default PermissionMatrix;
