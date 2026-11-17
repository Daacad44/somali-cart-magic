import { describe, expect, it } from "vitest";
import { ADMIN_NAV, filterNav, firstAllowedPath } from "@/components/admin/nav";
import type { PermissionKey } from "@/lib/permissions";

const canWith = (perms: string[]) => (p: PermissionKey | PermissionKey[]) =>
  (Array.isArray(p) ? p : [p]).some((x) => perms.includes(x));

describe("admin navigation", () => {
  it("shows everything for full permissions", () => {
    const all = ["dashboard.view", "reports.view", "pos.use", "payments.initiate", "payments.refund", "orders.view",
      "orders.manage", "customers.view", "customers.manage", "products.manage", "users.manage", "settings.manage"];
    expect(filterNav(ADMIN_NAV, canWith(all))).toHaveLength(ADMIN_NAV.length);
    expect(firstAllowedPath(canWith(all))).toBe("/admin");
  });
  it("cashier lands on POS and sees only allowed items", () => {
    const cashier = ["pos.use", "payments.initiate", "customers.view", "customers.manage"];
    const items = filterNav(ADMIN_NAV, canWith(cashier)).map((i) => i.key);
    expect(items).toEqual(["pos", "orders", "customers"]);
    expect(firstAllowedPath(canWith(cashier))).toBe("/admin/pos");
  });
  it("inventory clerk lands on orders", () => {
    expect(firstAllowedPath(canWith(["products.manage", "orders.view"]))).toBe("/admin/orders");
  });
  it("returns null when nothing is allowed", () => {
    expect(firstAllowedPath(canWith([]))).toBeNull();
  });
  it("POS is the only prominent item", () => {
    expect(ADMIN_NAV.filter((i) => i.prominent).map((i) => i.key)).toEqual(["pos"]);
  });
});
