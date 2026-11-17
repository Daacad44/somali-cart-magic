import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export type Role = "owner" | "admin" | "staff" | "customer";

export interface CallerProfile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
}

export interface Caller {
  user: User;
  profile: CallerProfile;
  /** Client acting as the caller (RLS + auth.uid() apply). */
  userClient: SupabaseClient;
  /** Service-role client (bypasses RLS). Use deliberately. */
  admin: SupabaseClient;
  /** Checks a permission via the `has_permission` RPC as the caller (cached). */
  can: (permission: string) => Promise<boolean>;
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

let adminSingleton: SupabaseClient | null = null;

/** Service-role client — never expose its results unfiltered to callers. */
export function adminClient(): SupabaseClient {
  if (!adminSingleton) {
    adminSingleton = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminSingleton;
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * Resolves the authenticated caller from the Authorization header.
 * Throws 401 when the token is missing/invalid and 403 when the profile is inactive.
 */
export async function getCaller(req: Request): Promise<Caller> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Fadlan soo gal marka hore.", { message_en: "Sign in required." });

  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError(401, "UNAUTHORIZED", "Fadlan soo gal marka hore.", { message_en: "Invalid or expired session." });
  }
  const user = data.user;

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, full_name, phone, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw new HttpError(403, "FORBIDDEN", "Profile-ka lama helin.", { message_en: "Profile not found." });
  if (!profile.is_active) {
    throw new HttpError(403, "FORBIDDEN", "Akoonkaagu waa la xannibay.", { message_en: "Your account is deactivated." });
  }

  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const cache = new Map<string, boolean>();
  const can = async (permission: string): Promise<boolean> => {
    if (cache.has(permission)) return cache.get(permission)!;
    const { data: ok, error: rpcErr } = await userClient.rpc("has_permission", { p: permission });
    if (rpcErr) throw rpcErr;
    cache.set(permission, ok === true);
    return ok === true;
  };

  return { user, profile: profile as CallerProfile, userClient, admin, can };
}

/** Appends an audit_log row; failures are logged, never thrown. */
export async function audit(
  admin: SupabaseClient,
  entry: { actor_id: string | null; action: string; entity: string; entity_id?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    actor_id: entry.actor_id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id ?? null,
    details: entry.details ?? {},
  });
  if (error) console.error("[audit] insert failed:", error.message);
}
