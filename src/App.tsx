import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { CartProvider } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { RequireAuth, RequirePermission, FullPageSpinner } from "@/components/auth/Guards";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Storefront
const Products = lazy(() => import("./pages/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderStatus = lazy(() => import("./pages/OrderStatus"));
const AuthPage = lazy(() => import("./pages/Auth"));
const Account = lazy(() => import("./pages/account/Account"));
const AccountOrderDetail = lazy(() => import("./pages/account/OrderDetail"));
const Wishlist = lazy(() => import("./pages/Wishlist"));

// Admin & POS
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminOrderDetail = lazy(() => import("./pages/admin/OrderDetail"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const AdminCategories = lazy(() => import("./pages/admin/Categories"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const Pos = lazy(() => import("./pages/admin/Pos"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const StoreLayout = () => (
  <div className="flex min-h-screen flex-col">
    <Navbar />
    <main className="flex-1">
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </main>
    <Footer />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<FullPageSpinner />}>
                <Routes>
                  <Route element={<StoreLayout />}>
                    <Route path="/" element={<Index />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/product/:slug" element={<ProductDetail />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
                    <Route path="/order/:id" element={<RequireAuth><OrderStatus /></RequireAuth>} />
                    <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                    <Route path="/account/orders/:id" element={<RequireAuth><AccountOrderDetail /></RequireAuth>} />
                    <Route path="/wishlist" element={<RequireAuth><Wishlist /></RequireAuth>} />
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  <Route path="/admin" element={<RequirePermission><AdminLayout /></RequirePermission>}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="pos" element={<RequirePermission permission="pos.use"><Pos /></RequirePermission>} />
                    <Route path="orders" element={<RequirePermission permission={["orders.view", "orders.manage", "pos.use"]}><AdminOrders /></RequirePermission>} />
                    <Route path="orders/:id" element={<RequirePermission permission={["orders.view", "orders.manage", "pos.use"]}><AdminOrderDetail /></RequirePermission>} />
                    <Route path="products" element={<RequirePermission permission="products.manage"><AdminProducts /></RequirePermission>} />
                    <Route path="categories" element={<RequirePermission permission="products.manage"><AdminCategories /></RequirePermission>} />
                    <Route path="customers" element={<RequirePermission permission={["customers.view", "customers.manage"]}><AdminCustomers /></RequirePermission>} />
                    <Route path="payments" element={<RequirePermission permission={["orders.view", "payments.refund", "reports.view"]}><AdminPayments /></RequirePermission>} />
                    <Route path="users" element={<RequirePermission permission="users.manage"><AdminUsers /></RequirePermission>} />
                    <Route path="settings" element={<RequirePermission permission="settings.manage"><AdminSettings /></RequirePermission>} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </CartProvider>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
