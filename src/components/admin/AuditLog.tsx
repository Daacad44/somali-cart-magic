import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AuditEntry } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataPagination, EmptyState, ErrorState, TableSkeleton } from "./shared";
import { pageToRange, sanitizeSearch, totalPages } from "./utils";
import { useDebounced } from "@/hooks/admin/useDebounced";

const PAGE_SIZE = 25;
const ALL = "all";
const ENTITIES = ["order", "payment", "user", "product", "customer", "settings"];

const summarize = (details: Record<string, unknown>) =>
  Object.entries(details ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");

/** Read-only audit trail viewer (RLS: users.manage or reports.view). */
export const AuditLog = () => {
  const { t, formatDate } = useI18n();
  const [entity, setEntity] = useState(ALL);
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [page, setPage] = useState(1);

  const log = useQuery({
    queryKey: ["admin", "audit", entity, q, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, to] = pageToRange(page, PAGE_SIZE);
      let query = supabase.from("audit_log").select("*", { count: "exact" });
      if (entity !== ALL) query = query.eq("entity", entity);
      const s = sanitizeSearch(q);
      if (s) query = query.or(`action.ilike.%${s}%,entity_id.ilike.%${s}%`);
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      const rows = (data ?? []) as AuditEntry[];
      // Resolve actor names (visible to users.manage; otherwise falls back to short ids)
      const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        names = Object.fromEntries(((profs ?? []) as { id: string; full_name: string; email: string | null }[])
          .map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));
      }
      return { rows, count: count ?? 0, names };
    },
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("admin.audit.searchPh")} aria-label={t("common.search")} />
        </div>
        <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(1); }}>
          <SelectTrigger className="sm:w-48" aria-label={t("admin.audit.entity")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("admin.audit.allEntities")}</SelectItem>
            {ENTITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {log.isLoading ? <TableSkeleton rows={8} cols={4} /> : log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : log.data!.rows.length === 0 ? (
        <EmptyState icon={History} title={t("admin.audit.empty")} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("admin.audit.actor")}</TableHead>
                  <TableHead>{t("admin.audit.action")}</TableHead>
                  <TableHead>{t("admin.audit.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.data!.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(r.created_at, true)}</TableCell>
                    <TableCell className="text-sm">{r.actor_id ? log.data!.names[r.actor_id] ?? r.actor_id.slice(0, 8) : t("admin.audit.system")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{r.action}</Badge>
                      {r.entity_id && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.entity}:{r.entity_id.slice(0, 8)}</div>}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={summarize(r.details)}>{summarize(r.details) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={totalPages(log.data!.count, PAGE_SIZE)} total={log.data!.count} loading={log.isFetching} onPage={setPage} />
        </>
      )}
    </Card>
  );
};

export default AuditLog;
