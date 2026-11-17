// Pure authorization rules for the `admin-users` Edge Function. Runtime-agnostic
// (used from Deno and from vitest) — keep it free of imports.

export type GuardRole = "owner" | "admin" | "staff" | "customer";

export interface GuardActor {
  id: string;
  role: GuardRole;
  /** Explicit user_permissions of the actor (ignored for owner/admin, who hold everything). */
  permissions: readonly string[];
}

export interface GuardTarget {
  id: string;
  role: GuardRole;
  /** Current user_permissions of the target. */
  permissions: readonly string[];
}

export type UserMutation =
  | { action: "create"; role: GuardRole; permissions: readonly string[] }
  | { action: "update"; roleChange?: GuardRole }
  | { action: "set_permissions"; permissions: readonly string[] }
  | { action: "set_active"; active: boolean }
  | { action: "reset_password" };

export interface GuardDenial {
  code: "FORBIDDEN";
  so: string;
  en: string;
}

const deny = (so: string, en: string): GuardDenial => ({ code: "FORBIDDEN", so, en });

export const isPrivileged = (role: GuardRole): boolean => role === "owner" || role === "admin";

/** Items of `wanted` the actor does not hold (empty ⇒ subset). */
export function missingPermissions(wanted: readonly string[], held: readonly string[]): string[] {
  const set = new Set(held);
  return [...new Set(wanted)].filter((p) => !set.has(p));
}

/**
 * Decides whether `actor` may perform `mutation` on `target` (null for create).
 * Returns null when allowed, otherwise a bilingual denial.
 *
 * Owner/admin callers:
 *  - nobody modifies the owner except the owner themself; owner role is never assignable;
 *  - only the owner creates or modifies admins (or promotes to admin);
 *  - nobody changes their own role, permissions or active flag.
 * Staff callers (hold users.manage):
 *  - may never change roles;
 *  - may only create/modify users whose role is `staff`, and only when the target's
 *    current permissions — and any newly requested ones — are a subset of their own;
 *  - therefore cannot touch customers (incl. password resets), admins or the owner.
 */
export function checkUserMutation(actor: GuardActor, target: GuardTarget | null, mutation: UserMutation): GuardDenial | null {
  const privileged = isPrivileged(actor.role);

  if (mutation.action === "create") {
    if (mutation.role === "owner") return deny("Doorka milkiilaha lama bixin karo.", "The owner role cannot be assigned.");
    if (mutation.role === "admin" && actor.role !== "owner") {
      return deny("Kaliya milkiilaha ayaa abuuri kara admin.", "Only the owner can create admins.");
    }
    if (!privileged) {
      if (mutation.role !== "staff") {
        return deny("Waxaad abuuri kartaa shaqaale (staff) oo keliya.", "Staff managers can only create staff users.");
      }
      const missing = missingPermissions(mutation.permissions, actor.permissions);
      if (missing.length) {
        return deny(
          `Ma bixin kartid ogolaansho aadan adigu haysan: ${missing.join(", ")}`,
          `You cannot grant permissions you don't hold: ${missing.join(", ")}`,
        );
      }
    }
    return null;
  }

  if (!target) return deny("Isticmaalaha lama helin.", "Target user is required.");
  const self = actor.id === target.id;
  const roleChange = mutation.action === "update" ? mutation.roleChange : undefined;

  if (target.role === "owner" && !self) {
    return deny("Qofna wax kama beddeli karo milkiilaha.", "Only the owner can modify the owner account.");
  }
  if (roleChange === "owner") return deny("Doorka milkiilaha lama bixin karo.", "The owner role cannot be assigned.");
  if (self && (roleChange !== undefined || mutation.action === "set_permissions" || mutation.action === "set_active")) {
    return deny(
      "Ma beddeli kartid doorkaaga, ogolaanshahaaga ama xaaladdaada.",
      "You cannot change your own role, permissions or active status.",
    );
  }
  if (privileged) {
    if ((target.role === "admin" || roleChange === "admin") && actor.role !== "owner" && !self) {
      return deny("Kaliya milkiilaha ayaa maamuli kara admin-nada.", "Only the owner can create or modify admins.");
    }
    return null;
  }

  // ---- Staff caller with users.manage ----
  if (roleChange !== undefined) {
    return deny("Kaliya milkiilaha ama admin ayaa beddeli kara doorka.", "Only the owner or an admin can change roles.");
  }
  if (target.role !== "staff") {
    return deny(
      "Waxaad maamuli kartaa shaqaalaha (staff) oo keliya.",
      "Staff managers can only manage staff users (not customers, admins or the owner).",
    );
  }
  const heldByTarget = missingPermissions(target.permissions, actor.permissions);
  if (heldByTarget.length) {
    return deny(
      `Isticmaalahan wuxuu haystaa ogolaansho aadan adigu haysan: ${heldByTarget.join(", ")}`,
      `This user holds permissions you don't have: ${heldByTarget.join(", ")}`,
    );
  }
  if (mutation.action === "set_permissions") {
    const missing = missingPermissions(mutation.permissions, actor.permissions);
    if (missing.length) {
      return deny(
        `Ma bixin kartid ogolaansho aadan adigu haysan: ${missing.join(", ")}`,
        `You cannot grant permissions you don't hold: ${missing.join(", ")}`,
      );
    }
  }
  return null;
}
