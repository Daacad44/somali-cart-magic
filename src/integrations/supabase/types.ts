// Row types mirroring supabase/migrations/*.sql. Keep in sync with the schema.
import type { Wallet } from "../../../supabase/functions/_shared/wallet";

export type Role = "owner" | "admin" | "staff" | "customer";
export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";
export type PaymentRowStatus = "initiated" | "pending" | "approved" | "failed" | "cancelled" | "reversed";
export type Channel = "online" | "pos";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionDef {
  key: string;
  label_en: string;
  label_so: string;
  group_name: string;
  sort_order: number;
}

export interface StoreSettings {
  id: 1;
  store_name: string;
  currency: string;
  shipping_fee: number;
  free_shipping_over: number | null;
  tax_rate: number;
  phone: string | null;
  address: string | null;
  receipt_footer: string | null;
  updated_at: string;
}

export interface WalletPrefixRow {
  prefix: string;
  wallet: Wallet;
  provider_name: string;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  name_so: string | null;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface VariantOption {
  type: string;
  options: string[];
}

export interface Product {
  id: string;
  name: string;
  name_so: string | null;
  slug: string;
  description: string | null;
  description_so: string | null;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  images: string[];
  variant_options: VariantOption[];
  tags: string[];
  is_active: boolean;
  is_featured: boolean;
  flash_sale_ends_at: string | null;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
  category?: Pick<Category, "id" | "name" | "name_so" | "slug"> | null;
}

export interface Customer {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  channel: Channel;
  customer_id: string | null;
  user_id: string | null;
  created_by: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  notes: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, "id" | "full_name" | "phone"> | null;
  items?: OrderItem[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  image: string | null;
  unit_price: number;
  quantity: number;
  variants: Record<string, string>;
  line_total: number;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: "waafipay" | "cash";
  wallet: Wallet | "CASH" | null;
  account_no: string | null;
  amount: number;
  currency: string;
  status: PaymentRowStatus;
  reference_id: string;
  request_id: string | null;
  transaction_id: string | null;
  issuer_transaction_id: string | null;
  response_code: string | null;
  response_msg: string | null;
  initiated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DashboardStats {
  revenue: number;
  revenue_prev: number;
  orders: number;
  orders_prev: number;
  paid_orders: number;
  customers: number;
  new_customers: number;
  products: number;
  pending_payments: number;
  by_wallet: { wallet: Wallet | "CASH"; count: number; amount: number }[];
  by_channel: { channel: Channel; count: number; amount: number }[];
  daily: { day: string; revenue: number; orders: number }[];
  low_stock: { id: string; name: string; stock: number; low_stock_threshold: number }[];
  top_products: { product_id: string; product_name: string; quantity: number; amount: number }[];
}

/** Body/response contract of the `waafi-pay` edge function. */
export interface PayRequest {
  action: "purchase" | "reverse" | "cash";
  order_id: string;
  phone?: string;          // purchase
  wallet?: Wallet;         // optional override (staff only)
  payment_id?: string;     // reverse
  reason?: string;
}
export interface PayResponse {
  ok: boolean;
  status: PaymentRowStatus;
  payment_id?: string;
  wallet?: Wallet | "CASH";
  message: string;         // human readable (Somali/English)
  code?: string;           // machine code, e.g. WALLET_NOT_DETECTED, TIMEOUT, DECLINED
  order?: Order;
}

/** Contract of the `admin-users` edge function. */
export type AdminUsersRequest =
  | { action: "list" }
  | { action: "create"; email: string; password: string; full_name: string; phone?: string;
      role: Exclude<Role, "owner">; permissions?: string[] }
  | { action: "update"; user_id: string; full_name?: string; phone?: string; role?: Exclude<Role, "owner"> }
  | { action: "set_permissions"; user_id: string; permissions: string[] }
  | { action: "set_active"; user_id: string; is_active: boolean }
  | { action: "reset_password"; user_id: string; password: string };

export interface AdminUser extends Profile {
  permissions: string[];
  last_sign_in_at: string | null;
}
