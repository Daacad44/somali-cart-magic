import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";
import type { PermissionKey } from "@/lib/permissions";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Set<string>;
  loading: boolean;
  isStaff: boolean;
  can: (p: PermissionKey | PermissionKey[]) => boolean;   // any-of when array
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (args: { email: string; password: string; full_name: string; phone?: string }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setPermissions(new Set());
      return;
    }
    const [{ data: p }, { data: perms }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.rpc("my_permissions"),
    ]);
    setProfile((p as Profile) ?? null);
    setPermissions(new Set((perms as string[] | null) ?? []));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (mounted) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer to avoid deadlocks inside the auth callback
      setTimeout(() => { loadProfile(s?.user.id); }, 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const can = useCallback(
    (p: PermissionKey | PermissionKey[]) => {
      if (!profile?.is_active) return false;
      const list = Array.isArray(p) ? p : [p];
      return list.some((x) => permissions.has(x));
    },
    [permissions, profile],
  );

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    permissions,
    loading,
    isStaff: !!profile && profile.is_active && profile.role !== "customer",
    can,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async ({ email, password, full_name, phone }) => {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name, phone }, emailRedirectTo: `${window.location.origin}/account` },
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=update-password`,
      });
      if (error) throw error;
    },
    refresh: () => loadProfile(session?.user.id),
  }), [session, profile, permissions, loading, can, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
