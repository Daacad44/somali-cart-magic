import {
  LayoutDashboard, ScanBarcode, ShoppingBag, Package, FolderTree, Users, CreditCard, UserCog, Settings,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export interface AdminNavItem {
  key: string;              // i18n key suffix: admin.nav.<key>
  to: string;
  icon: LucideIcon;
  /** any-of; must mirror the route guard in App.tsx */
  permission: PermissionKey | PermissionKey[];
  prominent?: boolean;
  end?: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: "dashboard", to: "/admin", icon: LayoutDashboard, permission: "dashboard.view", end: true },
  { key: "pos", to: "/admin/pos", icon: ScanBarcode, permission: "pos.use", prominent: true },
  { key: "orders", to: "/admin/orders", icon: ShoppingBag, permission: ["orders.view", "orders.manage", "pos.use"] },
  { key: "products", to: "/admin/products", icon: Package, permission: "products.manage" },
  { key: "categories", to: "/admin/categories", icon: FolderTree, permission: "products.manage" },
  { key: "customers", to: "/admin/customers", icon: Users, permission: ["customers.view", "customers.manage"] },
  { key: "payments", to: "/admin/payments", icon: CreditCard, permission: ["orders.view", "payments.refund", "reports.view"] },
  { key: "users", to: "/admin/users", icon: UserCog, permission: "users.manage" },
  { key: "settings", to: "/admin/settings", icon: Settings, permission: "settings.manage" },
];

export function filterNav(items: AdminNavItem[], can: (p: PermissionKey | PermissionKey[]) => boolean): AdminNavItem[] {
  return items.filter((i) => can(i.permission));
}

/** First admin page the user may open (dashboard if allowed), or null if none. */
export function firstAllowedPath(can: (p: PermissionKey | PermissionKey[]) => boolean): string | null {
  return filterNav(ADMIN_NAV, can)[0]?.to ?? null;
}
