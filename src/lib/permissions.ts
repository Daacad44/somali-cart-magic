export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  REPORTS_VIEW: "reports.view",
  POS_USE: "pos.use",
  PAYMENTS_INITIATE: "payments.initiate",
  PAYMENTS_REFUND: "payments.refund",
  ORDERS_VIEW: "orders.view",
  ORDERS_MANAGE: "orders.manage",
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  PRODUCTS_MANAGE: "products.manage",
  USERS_MANAGE: "users.manage",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionKey[];

/** Ready-made permission bundles for quick assignment in user management. */
export const PERMISSION_PRESETS: Record<string, { so: string; en: string; permissions: PermissionKey[] }> = {
  cashier: {
    so: "Khasnaji", en: "Cashier",
    permissions: ["pos.use", "payments.initiate", "customers.view", "customers.manage"],
  },
  manager: {
    so: "Maamule", en: "Manager",
    permissions: ["dashboard.view", "reports.view", "pos.use", "payments.initiate", "payments.refund",
      "orders.view", "orders.manage", "customers.view", "customers.manage", "products.manage"],
  },
  inventory: {
    so: "Kaydiye", en: "Inventory clerk",
    permissions: ["products.manage", "orders.view"],
  },
  support: {
    so: "Taageero", en: "Customer support",
    permissions: ["orders.view", "customers.view", "customers.manage"],
  },
};
