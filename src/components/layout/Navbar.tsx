import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ShoppingCart, Search, Menu, X, User, Heart, LogOut, Package, LayoutDashboard, LogIn, Languages,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useCategories, useStoreSettings } from "@/hooks/store/useCatalog";
import { sanitizeSearch } from "@/hooks/store/query-utils";
import StoreLogo from "@/components/store/StoreLogo";

const iconBtn =
  "flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SearchForm = ({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [value, setValue] = useState(location.pathname === "/products" ? params.get("q") ?? "" : "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = sanitizeSearch(value);
    const next = new URLSearchParams(location.pathname === "/products" ? params : undefined);
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    navigate(`/products${next.toString() ? `?${next}` : ""}`);
    onDone?.();
  };

  return (
    <form onSubmit={submit} role="search" className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("store.nav.searchPlaceholder")}
        aria-label={t("common.search")}
        className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-24 text-sm outline-none ring-ring focus:ring-2"
        autoFocus={autoFocus}
        maxLength={64}
      />
      <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
        {t("common.search")}
      </button>
    </form>
  );
};

const Navbar = () => {
  const { totalItems } = useCart();
  const { user, profile, isStaff, signOut } = useAuth();
  const { t, lang, setLang, pick } = useI18n();
  const { data: settings } = useStoreSettings();
  const { data: categories } = useCategories();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const storeName = settings?.store_name || "Suuq";

  // Close menus on navigation
  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  const navLinks = [
    { to: "/", label: t("store.nav.home"), end: true },
    { to: "/products", label: t("store.nav.shop"), end: true },
    ...(categories ?? []).slice(0, 3).map((c) => ({ to: `/products?category=${c.slug}`, label: pick(c.name, c.name_so), end: false })),
    { to: "/products?sale=true", label: t("store.nav.deals"), end: false },
  ];

  const isActive = (to: string) => {
    const [path, qs] = to.split("?");
    if (location.pathname !== path) return false;
    const current = new URLSearchParams(location.search);
    if (!qs) return path !== "/products" || (!current.get("category") && !current.get("sale"));
    const want = new URLSearchParams(qs);
    return Array.from(want.entries()).every(([k, v]) => current.get(k) === v);
  };

  const onSignOut = async () => {
    await signOut();
    toast.success(t("store.nav.signedOut"));
    navigate("/");
  };

  const toggleLang = () => setLang(lang === "so" ? "en" : "so");
  const displayName = profile?.full_name || user?.email || "";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4 lg:px-8">
        <StoreLogo name={storeName} />

        <nav className="hidden items-center gap-1 lg:flex" aria-label={t("store.nav.main")}>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted",
                isActive(link.to) ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-0.5">
          <button onClick={() => setSearchOpen((v) => !v)} className={iconBtn} aria-label={t("common.search")} aria-expanded={searchOpen}>
            <Search className="h-5 w-5" />
          </button>
          <button onClick={toggleLang} className={cn(iconBtn, "w-auto gap-1 px-2 text-xs font-bold")} aria-label={t("common.language")} title={t("common.language")}>
            <Languages className="h-4 w-4" />
            <span>{lang === "so" ? "EN" : "SO"}</span>
          </button>
          <Link to="/wishlist" className={cn(iconBtn, "hidden sm:flex")} aria-label={t("store.nav.wishlist")}>
            <Heart className="h-5 w-5" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className={cn(iconBtn, "hidden sm:flex")} aria-label={t("store.nav.account")}>
              <User className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {user ? (
                <>
                  <DropdownMenuLabel className="truncate font-normal">
                    <span className="block text-xs text-muted-foreground">{t("store.nav.signedInAs")}</span>
                    <span className="block truncate font-semibold">{displayName}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/account"><User className="mr-2 h-4 w-4" />{t("store.nav.myAccount")}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/account?tab=orders"><Package className="mr-2 h-4 w-4" />{t("store.nav.orders")}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/wishlist"><Heart className="mr-2 h-4 w-4" />{t("store.nav.wishlist")}</Link></DropdownMenuItem>
                  {isStaff && (
                    <DropdownMenuItem asChild><Link to="/admin"><LayoutDashboard className="mr-2 h-4 w-4" />{t("store.nav.admin")}</Link></DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onSignOut}><LogOut className="mr-2 h-4 w-4" />{t("common.signOut")}</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild><Link to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`}><LogIn className="mr-2 h-4 w-4" />{t("common.signIn")}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/auth?mode=signup"><User className="mr-2 h-4 w-4" />{t("store.auth.createAccount")}</Link></DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/cart" className={cn(iconBtn, "relative")} aria-label={t("store.nav.cartCount", { n: totalItems })}>
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-secondary-foreground">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
          <button onClick={() => setMobileOpen((v) => !v)} className={cn(iconBtn, "lg:hidden")} aria-label={t("store.nav.menu")} aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border">
            <div className="container mx-auto px-4 py-3 lg:px-8">
              <SearchForm autoFocus onDone={() => setSearchOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-border lg:hidden">
            <nav className="container mx-auto flex flex-col gap-1 px-4 py-3" aria-label={t("store.nav.main")}>
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                    isActive(link.to) ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-2 h-px bg-border" />
              <Link to="/wishlist" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <Heart className="h-4 w-4" /> {t("store.nav.wishlist")}
              </Link>
              {user ? (
                <>
                  <Link to="/account" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <User className="h-4 w-4" /> {t("store.nav.myAccount")}
                  </Link>
                  <Link to="/account?tab=orders" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Package className="h-4 w-4" /> {t("store.nav.orders")}
                  </Link>
                  {isStaff && (
                    <Link to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                      <LayoutDashboard className="h-4 w-4" /> {t("store.nav.admin")}
                    </Link>
                  )}
                  <button onClick={onSignOut} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <LogOut className="h-4 w-4" /> {t("common.signOut")}
                  </button>
                </>
              ) : (
                <Link to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <LogIn className="h-4 w-4" /> {t("common.signIn")}
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
