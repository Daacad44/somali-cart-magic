import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, DollarSign, ShoppingBag, Users, Package, TrendingUp, AlertTriangle, ArrowLeft,
} from "lucide-react";

const stats = [
  { label: "Total Revenue", value: "$24,580", change: "+12.5%", icon: DollarSign, trend: "up" },
  { label: "Orders", value: "342", change: "+8.2%", icon: ShoppingBag, trend: "up" },
  { label: "Customers", value: "1,205", change: "+15.3%", icon: Users, trend: "up" },
  { label: "Products", value: "89", change: "+3", icon: Package, trend: "up" },
];

const recentOrders = [
  { id: "ORD-001", customer: "Abdi Mohamed", amount: 89.99, status: "Paid", payment: "EVC PLUS", date: "Today" },
  { id: "ORD-002", customer: "Fatima Ali", amount: 149.99, status: "Processing", payment: "ZAAD", date: "Today" },
  { id: "ORD-003", customer: "Hassan Omar", amount: 199.99, status: "Pending", payment: "SAHAL", date: "Yesterday" },
  { id: "ORD-004", customer: "Amina Yusuf", amount: 79.99, status: "Delivered", payment: "JEEP", date: "Yesterday" },
  { id: "ORD-005", customer: "Ibrahim Nur", amount: 299.99, status: "Shipped", payment: "EVC PLUS", date: "2 days ago" },
];

const statusColors: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Processing: "bg-warning/10 text-warning",
  Pending: "bg-muted text-muted-foreground",
  Delivered: "bg-accent/10 text-accent",
  Shipped: "bg-secondary/10 text-secondary",
};

const AdminDashboard = () => (
  <div className="container mx-auto px-4 py-8 lg:px-8">
    <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back to Store
    </Link>
    <div className="flex items-center justify-between">
      <div>
        <h1 className="font-heading text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your store performance</p>
      </div>
    </div>

    {/* Stats */}
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{stat.label}</span>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold">{stat.value}</p>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
            <TrendingUp className="h-3 w-3" /> {stat.change} from last month
          </div>
        </motion.div>
      ))}
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      {/* Recent Orders */}
      <div className="lg:col-span-2 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h3 className="font-heading text-sm font-bold">Recent Orders</h3>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-semibold">Order ID</th>
                <th className="px-5 py-3 text-left font-semibold">Customer</th>
                <th className="px-5 py-3 text-left font-semibold">Payment</th>
                <th className="px-5 py-3 text-left font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-3 font-mono text-xs font-semibold">{order.id}</td>
                  <td className="px-5 py-3">{order.customer}</td>
                  <td className="px-5 py-3 text-xs font-medium text-muted-foreground">{order.payment}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[order.status]}`}>{order.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">${order.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Verification + Alerts */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 font-heading text-sm font-bold"><BarChart3 className="h-4 w-4 text-accent" /> Payment Breakdown</h3>
          <div className="mt-4 space-y-3">
            {[
              { name: "EVC PLUS", pct: 42, color: "bg-secondary" },
              { name: "ZAAD", pct: 28, color: "bg-primary" },
              { name: "SAHAL", pct: 18, color: "bg-success" },
              { name: "JEEP", pct: 12, color: "bg-accent" },
            ].map((pm) => (
              <div key={pm.name}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{pm.name}</span>
                  <span className="text-muted-foreground">{pm.pct}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className={`h-full rounded-full ${pm.color}`} style={{ width: `${pm.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-warning"><AlertTriangle className="h-4 w-4" /> Low Stock Alerts</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between"><span>Premium Wireless Headphones</span><span className="font-bold text-destructive">3 left</span></div>
            <div className="flex justify-between"><span>Organic Skincare Set</span><span className="font-bold text-warning">7 left</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default AdminDashboard;
