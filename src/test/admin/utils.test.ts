import { describe, expect, it } from "vitest";
import {
  assignableRoles, canModifyUser, csvEscape, dateRangeToQuery, generatePassword, groupPermissions, isoToLocalInput,
  localInputToIso, moveItem, pageToRange, parseTags, percentChange, samePermissions, sanitizeSearch, slugify, toCsv,
  toggleGroup, togglePermission, totalPages,
} from "@/components/admin/utils";
import type { PermissionDef } from "@/integrations/supabase/types";

const defs: PermissionDef[] = [
  { key: "orders.manage", label_en: "", label_so: "", group_name: "orders", sort_order: 70 },
  { key: "dashboard.view", label_en: "", label_so: "", group_name: "general", sort_order: 10 },
  { key: "orders.view", label_en: "", label_so: "", group_name: "orders", sort_order: 60 },
  { key: "reports.view", label_en: "", label_so: "", group_name: "general", sort_order: 20 },
];

describe("permissions helpers", () => {
  it("groups by group_name ordered by sort_order", () => {
    const g = groupPermissions(defs);
    expect(g.map((x) => x.group)).toEqual(["general", "orders"]);
    expect(g[1].items.map((i) => i.key)).toEqual(["orders.view", "orders.manage"]);
  });
  it("toggles single permissions without duplicates", () => {
    expect(togglePermission(["a"], "b", true)).toEqual(["a", "b"]);
    expect(togglePermission(["a", "b"], "b", true)).toEqual(["a", "b"]);
    expect(togglePermission(["a", "b"], "a", false)).toEqual(["b"]);
  });
  it("toggles a group: partial → all on, all on → off", () => {
    expect(toggleGroup(["x", "a"], ["a", "b"])).toEqual(["a", "b", "x"]);
    expect(toggleGroup(["a", "b", "x"], ["a", "b"])).toEqual(["x"]);
  });
  it("compares permission sets regardless of order", () => {
    expect(samePermissions(["a", "b"], ["b", "a"])).toBe(true);
    expect(samePermissions(["a"], ["a", "b"])).toBe(false);
  });
});

describe("user modification rules", () => {
  const owner = { id: "o", role: "owner" as const };
  const admin = { id: "a", role: "admin" as const };
  const staff = { id: "s", role: "staff" as const };
  it("never allows self or owner modification", () => {
    expect(canModifyUser(admin, admin)).toBe(false);
    expect(canModifyUser(admin, owner)).toBe(false);
    expect(canModifyUser(owner, { id: "o2", role: "owner" })).toBe(false);
  });
  it("only owner can modify admins", () => {
    expect(canModifyUser(owner, admin)).toBe(true);
    expect(canModifyUser({ id: "a2", role: "admin" }, admin)).toBe(false);
    expect(canModifyUser(admin, staff)).toBe(true);
  });
  it("assignable roles include admin only for owner", () => {
    expect(assignableRoles("owner")).toContain("admin");
    expect(assignableRoles("admin")).not.toContain("admin");
  });
  it("generates strong passwords with every character class", () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePassword(12);
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%*?]/);
    }
    expect(generatePassword(4)).toHaveLength(8);
  });
});

describe("date & paging helpers", () => {
  it("turns inclusive dates into a half-open ISO range", () => {
    const r = dateRangeToQuery("2026-11-01", "2026-11-17");
    expect(new Date(r.gte!).getDate()).toBe(1);
    const lt = new Date(r.lt!);
    expect(lt.getDate()).toBe(18);
    expect(lt.getHours()).toBe(0);
  });
  it("ignores invalid / empty / inverted ranges", () => {
    expect(dateRangeToQuery("", "")).toEqual({});
    expect(dateRangeToQuery("nope", null)).toEqual({});
    const inv = dateRangeToQuery("2026-11-20", "2026-11-01");
    expect(inv.lt).toBeUndefined();
    expect(inv.gte).toBeDefined();
  });
  it("computes range bounds and page counts", () => {
    expect(pageToRange(1, 20)).toEqual([0, 19]);
    expect(pageToRange(3, 20)).toEqual([40, 59]);
    expect(pageToRange(0, 20)).toEqual([0, 19]);
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(41, 20)).toBe(3);
  });
  it("computes percent change", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });
  it("round-trips datetime-local values", () => {
    const iso = "2026-11-17T10:30:00.000Z";
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
    expect(isoToLocalInput(null)).toBe("");
    expect(localInputToIso("")).toBeNull();
  });
});

describe("text helpers", () => {
  it("slugifies", () => {
    expect(slugify("  Café Délice — Bag's 2!  ")).toBe("cafe-delice-bags-2");
    expect(slugify("Gaadhi Cusub")).toBe("gaadhi-cusub");
  });
  it("sanitizes PostgREST search input", () => {
    expect(sanitizeSearch(" a,b(c)%* ")).toBe("a b c");
  });
  it("parses tags", () => {
    expect(parseTags("new, , sale,new ,gift")).toEqual(["new", "sale", "gift"]);
  });
  it("moves array items", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});

describe("CSV", () => {
  it("escapes quotes, commas, newlines and formula injection", () => {
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
    expect(csvEscape("x,y")).toBe('"x,y"');
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(5)).toBe("5");
  });
  it("builds a CSV document", () => {
    const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y,z" }], [
      { header: "A", value: (r) => r.a },
      { header: "B", value: (r) => r.b },
    ]);
    expect(csv).toBe('A,B\r\n1,x\r\n2,"y,z"');
  });
});
