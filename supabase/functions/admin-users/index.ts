// Edge Function: admin-users  (requires users.manage)
// POST AdminUsersRequest (see src/integrations/supabase/types.ts):
//   list                → { ok: true, users: AdminUser[] }
//   create | update | set_permissions | set_active | reset_password
//                       → { ok: true, user: AdminUser, message, message_en }
// Errors              → { ok: false, code, message, message_en } with 4xx/5xx.
//
// Guard rules
//  * Nobody can modify an owner except the owner themself; an owner cannot
//    deactivate or demote themself (owner role is never assignable here).
//  * Only the owner can create admins or modify existing admins.
//  * Nobody can change their own role, permissions or active flag.
//  * Non owner/admin callers (staff with users.manage) can only grant
//    permissions they hold themselves.

import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { audit, getCaller, type Caller, type Role } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { errorResponse, HttpError, isUuid, json, readJson } from "../_shared/http.ts";

const FN = "admin-users";
const MANAGEABLE_ROLES = ["admin", "staff", "customer"] as const;
type ManageableRole = (typeof MANAGEABLE_ROLES)[number];
const BAN_FOREVER = "876000h";
const MIN_PASSWORD = 8;

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminUser extends ProfileRow {
  permissions: string[];
  last_sign_in_at: string | null;
}

type Body = Record<string, unknown> & { action?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const err = (status: number, code: string, so: string, en: string) => new HttpError(status, code, so, { message_en: en });
const forbidden = (so: string, en: string) => err(403, "FORBIDDEN", so, en);
const bad = (so: string, en: string) => err(400, "BAD_REQUEST", so, en);

function optString(v: unknown, field: string, max = 200): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw bad(`${field} waa khalad.`, `${field} must be a string.`);
  const t = v.trim();
  if (t.length > max) throw bad(`${field} aad ayuu u dheer yahay.`, `${field} is too long.`);
  return t;
}

function reqUserId(body: Body): string {
  if (!isUuid(body.user_id)) throw bad("user_id waa khalad.", "user_id must be a UUID.");
  return body.user_id;
}

function validatePassword(v: unknown): string {
  if (typeof v !== "string" || v.length < MIN_PASSWORD || v.length > 72) {
    throw err(400, "WEAK_PASSWORD", `Password-ku waa inuu ahaadaa ugu yaraan ${MIN_PASSWORD} xaraf.`,
      `Password must be ${MIN_PASSWORD}-72 characters.`);
  }
  return v;
}

function validateRole(v: unknown): ManageableRole {
  if (typeof v !== "string" || !(MANAGEABLE_ROLES as readonly string[]).includes(v)) {
    throw bad("Doorka (role) waa khalad.", "Role must be admin, staff or customer.");
  }
  return v as ManageableRole;
}

async function loadProfile(admin: SupabaseClient, id: string): Promise<ProfileRow> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, phone, email, role, is_active, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw err(404, "NOT_FOUND", "Isticmaalaha lama helin.", "User not found.");
  return data as ProfileRow;
}

async function permissionsFor(admin: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("user_permissions").select("user_id, permission").in("user_id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.permission);
    map.set(row.user_id, list);
  }
  return map;
}

async function allPermissionKeys(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from("permissions").select("key").order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r: { key: string }) => r.key);
}

/** Validates + de-duplicates requested permission keys, enforcing the "grant only what you hold" rule. */
async function validatePermissions(caller: Caller, raw: unknown): Promise<string[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== "string")) {
    throw bad("Ogolaanshaha waa khalad.", "permissions must be an array of strings.");
  }
  const requested = [...new Set(raw as string[])];
  const valid = new Set(await allPermissionKeys(caller.admin));
  const unknown = requested.filter((p) => !valid.has(p));
  if (unknown.length) {
    throw err(400, "INVALID_PERMISSION", `Ogolaansho aan jirin: ${unknown.join(", ")}`, `Unknown permissions: ${unknown.join(", ")}`);
  }
  if (caller.profile.role !== "owner" && caller.profile.role !== "admin") {
    for (const p of requested) {
      if (!(await caller.can(p))) {
        throw forbidden(`Ma bixin kartid ogolaansho aadan adigu haysan: ${p}`, `You cannot grant a permission you don't hold: ${p}`);
      }
    }
  }
  return requested;
}

async function replacePermissions(admin: SupabaseClient, userId: string, perms: string[], grantedBy: string): Promise<void> {
  const { error: dErr } = await admin.from("user_permissions").delete().eq("user_id", userId);
  if (dErr) throw dErr;
  if (perms.length === 0) return;
  const { error: iErr } = await admin
    .from("user_permissions")
    .insert(perms.map((permission) => ({ user_id: userId, permission, granted_by: grantedBy })));
  if (iErr) throw iErr;
}

async function toAdminUser(admin: SupabaseClient, id: string): Promise<AdminUser> {
  const profile = await loadProfile(admin, id);
  const perms = await permissionsFor(admin, [id]);
  const { data } = await admin.auth.admin.getUserById(id);
  return { ...profile, permissions: perms.get(id) ?? [], last_sign_in_at: data?.user?.last_sign_in_at ?? null };
}

/**
 * Central guard for every mutation on an existing user.
 * `change` describes what the request touches.
 */
function assertCanModify(
  caller: Caller,
  target: ProfileRow,
  change: { role?: ManageableRole; permissions?: boolean; active?: boolean },
): void {
  const self = caller.user.id === target.id;
  const callerRole = caller.profile.role;

  if (target.role === "owner" && !self) {
    throw forbidden("Qofna wax kama beddeli karo milkiilaha.", "Only the owner can modify the owner account.");
  }
  if (self && (change.role !== undefined || change.permissions || change.active !== undefined)) {
    throw forbidden(
      "Ma beddeli kartid doorkaaga, ogolaanshahaaga ama xaaladdaada.",
      "You cannot change your own role, permissions or active status.",
    );
  }
  if ((target.role === "admin" || change.role === "admin") && callerRole !== "owner" && !self) {
    throw forbidden("Kaliya milkiilaha ayaa maamuli kara admin-nada.", "Only the owner can create or modify admins.");
  }
}

function ok(req: Request, user: AdminUser, so: string, en: string): Response {
  return json(req, { ok: true, user, message: so, message_en: en });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function listUsers(req: Request, caller: Caller): Promise<Response> {
  const { admin } = caller;
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, phone, email, role, is_active, created_at, updated_at")
    .in("role", ["owner", "admin", "staff"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (profiles ?? []) as ProfileRow[];
  const ids = rows.map((p) => p.id);
  const perms = await permissionsFor(admin, ids);

  // last_sign_in_at lives in auth.users — page through the admin API.
  const lastSignIn = new Map<string, string | null>();
  const wanted = new Set(ids);
  const perPage = 1000;
  for (let page = 1; page <= 50 && lastSignIn.size < wanted.size; page++) {
    const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage });
    if (lErr) throw lErr;
    const users: User[] = data?.users ?? [];
    for (const u of users) if (wanted.has(u.id)) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    if (users.length < perPage) break;
  }

  const roleOrder: Record<Role, number> = { owner: 0, admin: 1, staff: 2, customer: 3 };
  const users: AdminUser[] = rows
    .map((p) => ({ ...p, permissions: perms.get(p.id) ?? [], last_sign_in_at: lastSignIn.get(p.id) ?? null }))
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.full_name.localeCompare(b.full_name));

  return json(req, { ok: true, users });
}

async function createUser(req: Request, caller: Caller, body: Body): Promise<Response> {
  const { admin } = caller;
  const email = optString(body.email, "email", 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Email-ku waa khalad.", "Invalid email.");
  const password = validatePassword(body.password);
  const fullName = optString(body.full_name, "full_name");
  if (!fullName) throw bad("Magaca waa loo baahan yahay.", "full_name is required.");
  const phone = optString(body.phone, "phone", 32) || null;
  const role = validateRole(body.role);
  if (role === "admin" && caller.profile.role !== "owner") {
    throw forbidden("Kaliya milkiilaha ayaa abuuri kara admin.", "Only the owner can create admins.");
  }
  // Permissions only matter for staff; validate before creating the auth user.
  const perms = role === "staff" ? await validatePermissions(caller, body.permissions) : [];

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
    app_metadata: { role },
  });
  if (error || !data?.user) {
    const msg = error?.message ?? "createUser failed";
    if (/already|registered|exists/i.test(msg)) {
      throw err(409, "EMAIL_EXISTS", "Email-kan horay ayaa loo diiwaangeliyay.", "A user with this email already exists.");
    }
    throw err(400, "CREATE_FAILED", `Lama abuuri karo isticmaalaha: ${msg}`, `Could not create user: ${msg}`);
  }
  const userId = data.user.id;

  try {
    // handle_new_user() creates the profile from raw_app_meta_data.role; upsert defensively.
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: userId, full_name: fullName, phone, email, role, is_active: true }, { onConflict: "id" });
    if (pErr) throw pErr;
    if (perms.length) await replacePermissions(admin, userId, perms, caller.user.id);
  } catch (e) {
    // Roll back the half-created account so the email can be reused.
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw e;
  }

  await audit(admin, {
    actor_id: caller.user.id,
    action: "user.create",
    entity: "user",
    entity_id: userId,
    details: { email, role, permissions: perms },
  });
  return ok(req, await toAdminUser(admin, userId), "Isticmaalaha waa la abuuray.", "User created.");
}

async function updateUser(req: Request, caller: Caller, body: Body): Promise<Response> {
  const { admin } = caller;
  const userId = reqUserId(body);
  const target = await loadProfile(admin, userId);
  const fullName = optString(body.full_name, "full_name");
  const phone = optString(body.phone, "phone", 32);
  const role = body.role === undefined || body.role === null ? undefined : validateRole(body.role);
  const roleChange = role !== undefined && role !== target.role ? role : undefined;

  assertCanModify(caller, target, { role: roleChange });

  const patch: Record<string, unknown> = {};
  if (fullName !== undefined) {
    if (!fullName) throw bad("Magaca ma noqon karo madhan.", "full_name cannot be empty.");
    patch.full_name = fullName;
  }
  if (phone !== undefined) patch.phone = phone || null;
  if (roleChange) patch.role = roleChange;
  if (Object.keys(patch).length === 0) {
    return ok(req, await toAdminUser(admin, userId), "Wax isbeddel ah ma jiro.", "Nothing to update.");
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;

  if (roleChange) {
    const { data: au } = await admin.auth.admin.getUserById(userId);
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...(au?.user?.app_metadata ?? {}), role: roleChange },
    });
    if (roleChange !== "staff") await replacePermissions(admin, userId, [], caller.user.id);
    if (roleChange === "customer") {
      const { error: cErr } = await admin.from("customers").upsert(
        { user_id: userId, full_name: (patch.full_name as string) ?? target.full_name, phone: target.phone, email: target.email },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
      if (cErr) console.error(`[${FN}] customer upsert failed:`, cErr.message);
    }
  }
  if (fullName !== undefined || phone !== undefined) {
    const { data: au } = await admin.auth.admin.getUserById(userId);
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...(au?.user?.user_metadata ?? {}), ...(fullName !== undefined ? { full_name: fullName } : {}), ...(phone !== undefined ? { phone: phone || null } : {}) },
    });
  }

  await audit(admin, {
    actor_id: caller.user.id,
    action: roleChange ? "user.role_change" : "user.update",
    entity: "user",
    entity_id: userId,
    details: { ...patch, previous_role: roleChange ? target.role : undefined },
  });
  return ok(req, await toAdminUser(admin, userId), "Isticmaalaha waa la cusbooneysiiyay.", "User updated.");
}

async function setPermissions(req: Request, caller: Caller, body: Body): Promise<Response> {
  const { admin } = caller;
  const userId = reqUserId(body);
  if (!Array.isArray(body.permissions)) throw bad("Ogolaanshaha waa khalad.", "permissions must be an array.");
  const target = await loadProfile(admin, userId);
  assertCanModify(caller, target, { permissions: true });
  if (target.role !== "staff") {
    throw err(400, "NOT_STAFF", "Ogolaanshaha gaarka ah waxay khuseeyaan shaqaalaha oo keliya.",
      "Granular permissions only apply to staff (owner/admin already have all).");
  }
  const perms = await validatePermissions(caller, body.permissions);

  const before = (await permissionsFor(admin, [userId])).get(userId) ?? [];
  // Non owner/admin callers may not revoke permissions they don't hold either.
  if (caller.profile.role !== "owner" && caller.profile.role !== "admin") {
    for (const p of before.filter((x) => !perms.includes(x))) {
      if (!(await caller.can(p))) {
        throw forbidden(`Ma qaadi kartid ogolaansho aadan adigu haysan: ${p}`, `You cannot revoke a permission you don't hold: ${p}`);
      }
    }
  }
  await replacePermissions(admin, userId, perms, caller.user.id);

  await audit(admin, {
    actor_id: caller.user.id,
    action: "user.permissions",
    entity: "user",
    entity_id: userId,
    details: {
      added: perms.filter((p) => !before.includes(p)),
      removed: before.filter((p) => !perms.includes(p)),
    },
  });
  return ok(req, await toAdminUser(admin, userId), "Ogolaanshaha waa la keydiyay.", "Permissions saved.");
}

async function setActive(req: Request, caller: Caller, body: Body): Promise<Response> {
  const { admin } = caller;
  const userId = reqUserId(body);
  if (typeof body.is_active !== "boolean") throw bad("is_active waa khalad.", "is_active must be a boolean.");
  const active = body.is_active;
  const target = await loadProfile(admin, userId);
  assertCanModify(caller, target, { active });

  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) throw error;
  const { error: bErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BAN_FOREVER });
  if (bErr) {
    // Keep profile + auth in sync: revert the profile flag.
    await admin.from("profiles").update({ is_active: target.is_active }).eq("id", userId);
    throw bErr;
  }

  await audit(admin, {
    actor_id: caller.user.id,
    action: active ? "user.activate" : "user.deactivate",
    entity: "user",
    entity_id: userId,
    details: { email: target.email },
  });
  return ok(
    req,
    await toAdminUser(admin, userId),
    active ? "Akoonka waa la furay." : "Akoonka waa la xannibay.",
    active ? "User activated." : "User deactivated.",
  );
}

async function resetPassword(req: Request, caller: Caller, body: Body): Promise<Response> {
  const { admin } = caller;
  const userId = reqUserId(body);
  const password = validatePassword(body.password);
  const target = await loadProfile(admin, userId);
  assertCanModify(caller, target, {});

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw err(400, "RESET_FAILED", `Password-ka lama beddeli karo: ${error.message}`, error.message);

  await audit(admin, { actor_id: caller.user.id, action: "user.reset_password", entity: "user", entity_id: userId });
  return ok(req, await toAdminUser(admin, userId), "Password-ka waa la beddelay.", "Password reset.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(req, { ok: false, code: "BAD_REQUEST", message: "Method not allowed" }, 405);
  try {
    const caller = await getCaller(req);
    if (!(await caller.can("users.manage"))) {
      throw forbidden("Ogolaansho uma lihid maamulka isticmaalayaasha.", "users.manage permission required.");
    }
    const body = await readJson<Body>(req);
    switch (body.action) {
      case "list":
        return await listUsers(req, caller);
      case "create":
        return await createUser(req, caller, body);
      case "update":
        return await updateUser(req, caller, body);
      case "set_permissions":
        return await setPermissions(req, caller, body);
      case "set_active":
        return await setActive(req, caller, body);
      case "reset_password":
        return await resetPassword(req, caller, body);
      default:
        throw bad("Ficil aan la aqoon.", "Unknown action.");
    }
  } catch (e) {
    // Supabase AuthError / PostgrestError → readable 4xx/5xx instead of a blind 500.
    if (!(e instanceof HttpError) && e && typeof e === "object" && "message" in e) {
      const m = String((e as { message: unknown }).message);
      const status = Number((e as { status?: unknown }).status);
      if (status >= 400 && status < 500) return errorResponse(req, err(status, "AUTH_ERROR", m, m), FN);
    }
    return errorResponse(req, e, FN);
  }
});
