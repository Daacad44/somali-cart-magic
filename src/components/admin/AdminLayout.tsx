import { Suspense, useMemo } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, Languages, LogOut, Store, UserCircle2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarSeparator,
  SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/auth/Guards";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, filterNav } from "./nav";
import { useStoreSettings } from "@/hooks/admin/useStoreData";

const initials = (name: string | null | undefined) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";

const AdminSidebar = () => {
  const { can } = useAuth();
  const { t } = useI18n();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const { data: settings } = useStoreSettings();
  const items = useMemo(() => filterNav(ADMIN_NAV, can), [can]);
  const pos = items.find((i) => i.prominent);
  const rest = items.filter((i) => !i.prominent);
  const close = () => { if (isMobile) setOpenMobile(false); };
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();
  const isActive = (to: string, end?: boolean) => (end ? pathname === to || pathname === `${to}/` : pathname.startsWith(to));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/admin" onClick={close} className="flex items-center gap-2 px-1 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Store className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-heading text-sm font-semibold text-sidebar-foreground">
                {settings?.store_name ?? "Botan"}
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-sidebar-foreground/60">{t("admin.layout.backOffice")}</span>
            </span>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {pos && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    size="lg"
                    isActive={isActive(pos.to)}
                    tooltip={t(`admin.nav.${pos.key}`)}
                    className="bg-sidebar-primary text-sidebar-primary-foreground shadow hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  >
                    <NavLink to={pos.to} onClick={close}>
                      <pos.icon className="h-5 w-5" />
                      <span className="font-semibold">{t(`admin.nav.${pos.key}`)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>{t("admin.layout.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {rest.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive(item.to, item.end)} tooltip={t(`admin.nav.${item.key}`)}>
                    <NavLink to={item.to} end={item.end} onClick={close}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(`admin.nav.${item.key}`)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("admin.layout.viewStore")}>
              <Link to="/" onClick={close}>
                <ExternalLink className="h-4 w-4" />
                <span>{t("admin.layout.viewStore")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

const TopBar = () => {
  const { profile, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { data: settings } = useStoreSettings();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger aria-label={t("admin.layout.toggleMenu")} />
      <div className="min-w-0 flex-1 truncate font-heading text-base font-semibold">{settings?.store_name ?? "Botan"}</div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLang(lang === "so" ? "en" : "so")}
        aria-label={t("common.language")}
        className="gap-1.5"
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase">{lang === "so" ? "EN" : "SO"}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label={t("admin.layout.account")}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">{initials(profile?.full_name)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{profile?.full_name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-1">
            <div className="truncate">{profile?.full_name || profile?.email}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</div>
            {profile && (
              <Badge variant="outline" className="mt-1 border-umber/40 text-umber">{t(`admin.role.${profile.role}`)}</Badge>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/account")}>
            <UserCircle2 className="mr-2 h-4 w-4" /> {t("admin.layout.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/")}>
            <ExternalLink className="mr-2 h-4 w-4" /> {t("admin.layout.viewStore")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={async () => {
              await signOut();
              navigate("/auth");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};

const AdminLayout = () => {
  const location = useLocation();
  const isPos = location.pathname.startsWith("/admin/pos");
  return (
    <SidebarProvider defaultOpen={!isPos}>
      <AdminSidebar />
      <SidebarInset className="min-w-0 bg-muted/30">
        <TopBar />
        <main className={cn("flex-1", isPos ? "p-0" : "p-4 md:p-6 lg:p-8")}>
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AdminLayout;
