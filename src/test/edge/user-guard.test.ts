import { describe, expect, it } from "vitest";
import { checkUserMutation, missingPermissions, type GuardActor, type GuardTarget } from "../../../supabase/functions/_shared/user-guard.ts";

const owner: GuardActor = { id: "owner", role: "owner", permissions: [] };
const admin: GuardActor = { id: "admin", role: "admin", permissions: [] };
const manager: GuardActor = { id: "mgr", role: "staff", permissions: ["users.manage", "pos.use", "orders.view"] };

const t = (id: string, role: GuardTarget["role"], permissions: string[] = []): GuardTarget => ({ id, role, permissions });
const cashier = t("cashier", "staff", ["pos.use"]);
const finance = t("fin", "staff", ["pos.use", "payments.refund"]);

describe("missingPermissions", () => {
  it("returns the de-duplicated difference", () => {
    expect(missingPermissions(["a", "b", "b"], ["a"])).toEqual(["b"]);
    expect(missingPermissions([], ["a"])).toEqual([]);
  });
});

describe("owner/admin callers (unchanged rules)", () => {
  it("only the owner manages admins", () => {
    expect(checkUserMutation(owner, t("a2", "admin"), { action: "set_active", active: false })).toBeNull();
    expect(checkUserMutation(admin, t("a2", "admin"), { action: "reset_password" })).not.toBeNull();
    expect(checkUserMutation(admin, cashier, { action: "update", roleChange: "admin" })).not.toBeNull();
    expect(checkUserMutation(admin, null, { action: "create", role: "admin", permissions: [] })).not.toBeNull();
    expect(checkUserMutation(owner, null, { action: "create", role: "admin", permissions: [] })).toBeNull();
  });
  it("nobody modifies the owner except themself; no self role/permission/active changes", () => {
    expect(checkUserMutation(admin, t("owner", "owner"), { action: "update" })).not.toBeNull();
    expect(checkUserMutation(owner, t("owner", "owner"), { action: "update" })).toBeNull();
    expect(checkUserMutation(owner, t("owner", "owner"), { action: "set_active", active: false })).not.toBeNull();
    expect(checkUserMutation(admin, t("admin", "admin"), { action: "update", roleChange: "staff" })).not.toBeNull();
    expect(checkUserMutation(admin, t("admin", "admin"), { action: "reset_password" })).toBeNull();
  });
  it("admins may manage staff with any permissions and reset customer passwords", () => {
    expect(checkUserMutation(admin, finance, { action: "set_permissions", permissions: ["reports.view"] })).toBeNull();
    expect(checkUserMutation(admin, t("c", "customer"), { action: "reset_password" })).toBeNull();
    expect(checkUserMutation(admin, t("c", "customer"), { action: "update", roleChange: "staff" })).toBeNull();
  });
});

describe("staff callers with users.manage", () => {
  it("can manage staff whose permissions are a subset of theirs", () => {
    expect(checkUserMutation(manager, cashier, { action: "update" })).toBeNull();
    expect(checkUserMutation(manager, cashier, { action: "set_active", active: false })).toBeNull();
    expect(checkUserMutation(manager, cashier, { action: "reset_password" })).toBeNull();
    expect(checkUserMutation(manager, cashier, { action: "set_permissions", permissions: ["pos.use", "orders.view"] })).toBeNull();
  });
  it("cannot touch staff holding permissions they lack", () => {
    for (const m of [
      { action: "update" },
      { action: "set_active", active: false },
      { action: "reset_password" },
      { action: "set_permissions", permissions: ["pos.use"] },
    ] as const) {
      expect(checkUserMutation(manager, finance, m)).not.toBeNull();
    }
  });
  it("cannot grant permissions they lack", () => {
    expect(checkUserMutation(manager, cashier, { action: "set_permissions", permissions: ["payments.refund"] })).not.toBeNull();
  });
  it("cannot change roles at all", () => {
    expect(checkUserMutation(manager, cashier, { action: "update", roleChange: "customer" })).not.toBeNull();
    expect(checkUserMutation(manager, t("c", "customer"), { action: "update", roleChange: "staff" })).not.toBeNull();
  });
  it("cannot touch customers (incl. password resets), admins or the owner", () => {
    expect(checkUserMutation(manager, t("c", "customer"), { action: "reset_password" })).not.toBeNull();
    expect(checkUserMutation(manager, t("c", "customer"), { action: "update" })).not.toBeNull();
    expect(checkUserMutation(manager, t("a", "admin"), { action: "set_active", active: false })).not.toBeNull();
    expect(checkUserMutation(manager, t("o", "owner"), { action: "update" })).not.toBeNull();
  });
  it("creates only staff with a subset of their permissions", () => {
    expect(checkUserMutation(manager, null, { action: "create", role: "staff", permissions: ["pos.use"] })).toBeNull();
    expect(checkUserMutation(manager, null, { action: "create", role: "staff", permissions: ["payments.refund"] })).not.toBeNull();
    expect(checkUserMutation(manager, null, { action: "create", role: "customer", permissions: [] })).not.toBeNull();
    expect(checkUserMutation(manager, null, { action: "create", role: "admin", permissions: [] })).not.toBeNull();
  });
  it("cannot change their own permissions or active flag", () => {
    const selfTarget = t("mgr", "staff", manager.permissions as string[]);
    expect(checkUserMutation(manager, selfTarget, { action: "set_permissions", permissions: [] })).not.toBeNull();
    expect(checkUserMutation(manager, selfTarget, { action: "set_active", active: false })).not.toBeNull();
    expect(checkUserMutation(manager, selfTarget, { action: "update" })).toBeNull();
  });
});
