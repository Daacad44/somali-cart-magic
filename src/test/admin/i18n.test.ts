import { describe, expect, it } from "vitest";
import admin from "@/i18n/admin";
import { ADMIN_NAV } from "@/components/admin/nav";

describe("admin i18n", () => {
  it("has identical key sets in Somali and English", () => {
    expect(Object.keys(admin.so).sort()).toEqual(Object.keys(admin.en).sort());
  });
  it("only uses the admin. namespace and no empty strings", () => {
    for (const dict of [admin.so, admin.en]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(k.startsWith("admin.")).toBe(true);
        expect(v.trim()).not.toBe("");
      }
    }
  });
  it("defines labels for every nav item, role, channel and permission group", () => {
    const keys = [
      ...ADMIN_NAV.map((n) => `admin.nav.${n.key}`),
      ...["owner", "admin", "staff", "customer"].map((r) => `admin.role.${r}`),
      "admin.channel.online", "admin.channel.pos",
      ...["general", "sales", "orders", "customers", "catalog", "admin"].map((g) => `admin.permGroup.${g}`),
    ];
    for (const k of keys) expect(admin.so[k], k).toBeTruthy();
  });
  it("keeps interpolation variables consistent between languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(admin.en)) expect(vars(admin.so[k]), k).toBe(vars(admin.en[k]));
  });
});
