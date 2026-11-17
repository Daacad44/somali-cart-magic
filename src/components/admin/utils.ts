// Pure helpers for the admin back-office. No React, no Supabase — unit-tested
// in src/test/admin/*.test.ts.
import type { PermissionDef } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export interface PermissionGroup {
  group: string;
  items: PermissionDef[];
}

/** Groups the permissions catalogue by group_name, ordered by the lowest sort_order in each group. */
export function groupPermissions(defs: PermissionDef[]): PermissionGroup[] {
  const map = new Map<string, PermissionDef[]>();
  for (const d of [...defs].sort((a, b) => a.sort_order - b.sort_order)) {
    const list = map.get(d.group_name) ?? [];
    list.push(d);
    map.set(d.group_name, list);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

/** Toggles a key in a permission list, returning a new sorted, de-duplicated array. */
export function togglePermission(list: string[], key: string, on: boolean): string[] {
  const set = new Set(list);
  if (on) set.add(key);
  else set.delete(key);
  return [...set].sort();
}

/** Toggles a whole group: if every key is on, turns them all off, otherwise all on. */
export function toggleGroup(list: string[], keys: string[]): string[] {
  const set = new Set(list);
  const allOn = keys.every((k) => set.has(k));
  for (const k of keys) {
    if (allOn) set.delete(k);
    else set.add(k);
  }
  return [...set].sort();
}

/** True when two permission lists contain exactly the same keys. */
export function samePermissions(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}

/* ------------------------------------------------------------------ */
/* User management rules (mirrors the server; server still enforces)   */
/* ------------------------------------------------------------------ */

type RoleName = "owner" | "admin" | "staff" | "customer";

/** Whether the current user may modify the target user in the UI. */
export function canModifyUser(
  actor: { id: string; role: RoleName } | null | undefined,
  target: { id: string; role: RoleName },
): boolean {
  if (!actor) return false;
  if (actor.id === target.id) return false;            // never yourself
  if (target.role === "owner") return false;           // never the owner
  if (target.role === "admin" && actor.role !== "owner") return false; // only owner touches admins
  return actor.role === "owner" || actor.role === "admin" || actor.role === "staff";
}

/** Roles the current user may assign. */
export function assignableRoles(actorRole: RoleName | undefined): ("staff" | "admin" | "customer")[] {
  return actorRole === "owner" ? ["staff", "admin", "customer"] : ["staff", "customer"];
}

/** Generates a readable temporary password (no ambiguous chars). */
export function generatePassword(length = 12, rand: () => number = Math.random): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%*?";
  const all = lower + upper + digits + symbols;
  const pick = (s: string) => s[Math.floor(rand() * s.length) % s.length];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < Math.max(length, 8)) chars.push(pick(all));
  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/* ------------------------------------------------------------------ */
/* Dates, pagination, numbers                                           */
/* ------------------------------------------------------------------ */

/**
 * Converts inclusive "YYYY-MM-DD" date inputs to ISO bounds for a
 * `created_at >= from AND created_at < to` query. `to` is the start of the
 * following day so the whole end date is included. Invalid/empty → undefined.
 */
export function dateRangeToQuery(from?: string | null, to?: string | null): { gte?: string; lt?: string } {
  const out: { gte?: string; lt?: string } = {};
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  if (from) {
    const d = parse(from);
    if (d) out.gte = d.toISOString();
  }
  if (to) {
    const d = parse(to);
    if (d) {
      d.setDate(d.getDate() + 1);
      out.lt = d.toISOString();
    }
  }
  if (out.gte && out.lt && out.gte >= out.lt) return { gte: out.gte };
  return out;
}

/** Supabase .range() bounds for a 1-based page. */
export function pageToRange(page: number, pageSize: number): [number, number] {
  const p = Math.max(1, Math.floor(page) || 1);
  const from = (p - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export function totalPages(count: number | null | undefined, pageSize: number): number {
  return Math.max(1, Math.ceil((count ?? 0) / pageSize));
}

/** Percentage change vs previous period; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

/** URL-safe slug from any text (handles accents, collapses dashes). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Escapes characters that have meaning inside a PostgREST `or=(...)` ilike filter. */
export function sanitizeSearch(s: string): string {
  return s.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Splits comma-separated tags into a trimmed, unique, non-empty list. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(",").map((s) => s.trim()).filter(Boolean))];
}

/** Moves an array element; returns a new array. Out-of-range moves are no-ops. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr.slice();
  const copy = arr.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

/** "2026-11-17T10:30:00Z" ↔ datetime-local input value (local time). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------------ */
/* CSV export                                                           */
/* ------------------------------------------------------------------ */

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]): string {
  const head = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Triggers a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
