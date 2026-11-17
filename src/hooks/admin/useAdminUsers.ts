import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction, supabase } from "@/integrations/supabase/client";
import type { AdminUser, AdminUsersRequest, PermissionDef } from "@/integrations/supabase/types";

export const adminUsersKey = ["admin", "users"] as const;

/** Thin typed wrapper around the `admin-users` edge function. */
export async function adminUsers<T = unknown>(req: AdminUsersRequest): Promise<T> {
  return invokeFunction<T, AdminUsersRequest>("admin-users", req);
}

/** The list response may be `{ users: [...] }` or a bare array — accept both. */
function unwrapUsers(res: unknown): AdminUser[] {
  if (Array.isArray(res)) return res as AdminUser[];
  const r = res as { users?: AdminUser[]; data?: AdminUser[] } | null;
  const list = r?.users ?? r?.data ?? [];
  return list.map((u) => ({ ...u, permissions: u.permissions ?? [], last_sign_in_at: u.last_sign_in_at ?? null }));
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: adminUsersKey,
    enabled,
    queryFn: async () => unwrapUsers(await adminUsers({ action: "list" })),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["admin", "permissions-catalog"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as PermissionDef[];
    },
  });
}

/** Any admin-users mutation; invalidates the list on success. */
export function useAdminUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Exclude<AdminUsersRequest, { action: "list" }>) => adminUsers(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersKey }),
  });
}
