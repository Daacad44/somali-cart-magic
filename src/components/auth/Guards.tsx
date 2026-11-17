import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { PermissionKey } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

export const FullPageSpinner = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

export const NotConfigured = () => {
  const { t } = useI18n();
  return (
    <div className="container mx-auto max-w-xl px-4 py-16 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
      <p className="mt-4 text-sm text-muted-foreground">{t("common.notConfigured")}</p>
    </div>
  );
};

/** Requires a signed-in user; redirects to /auth?next=... otherwise. */
export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!isSupabaseConfigured) return <NotConfigured />;
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
};

/** Requires staff role and (optionally) any of the given permissions. */
export const RequirePermission = ({
  permission,
  children,
}: {
  permission?: PermissionKey | PermissionKey[];
  children: React.ReactNode;
}) => {
  const { user, loading, isStaff, can, profile } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (!isSupabaseConfigured) return <NotConfigured />;
  if (loading || (user && !profile)) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isStaff || (permission && !can(permission))) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("common.forbidden")}</p>
      </div>
    );
  }
  return <>{children}</>;
};
