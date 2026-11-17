import { useEffect, useMemo, useState } from "react";
import {
  Copy, KeyRound, Loader2, MoreHorizontal, Pencil, Power, RefreshCw, Search, ShieldCheck, UserCog, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { AdminUser, Role } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatSomaliPhone, normalizeSomaliPhone } from "@/lib/wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, StatusBadge, TableSkeleton } from "@/components/admin/shared";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { AuditLog } from "@/components/admin/AuditLog";
import { assignableRoles, canModifyUser, generatePassword, samePermissions } from "@/components/admin/utils";
import { useAdminUserMutation, useAdminUsers } from "@/hooks/admin/useAdminUsers";

type EditableRole = Exclude<Role, "owner">;
const ALL = "all";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RoleBadge = ({ role }: { role: Role }) => {
  const { t } = useI18n();
  const tone: Record<Role, string> = {
    owner: "border-umber/50 bg-umber-soft text-umber",
    admin: "border-primary/40 bg-navy-soft text-navy",
    staff: "border-border",
    customer: "border-border text-muted-foreground",
  };
  return <Badge variant="outline" className={cn("whitespace-nowrap", tone[role])}>{t(`admin.role.${role}`)}</Badge>;
};

const secureRand = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; };

const PasswordField = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" autoComplete="new-password" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" onClick={() => onChange(generatePassword(12, secureRand))} aria-label={t("admin.users.generate")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("admin.users.generate")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={!value} onClick={async () => {
            try { await navigator.clipboard.writeText(value); toast.success(t("admin.common.copied")); } catch { /* ignore */ }
          }} aria-label={t("admin.common.copy")}>
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("admin.common.copy")}</TooltipContent>
      </Tooltip>
    </div>
  );
};

/* ---------------- Create ---------------- */
const CreateUserDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const { t } = useI18n();
  const { profile } = useAuth();
  const mut = useAdminUserMutation();
  const roles = assignableRoles(profile?.role).filter((r) => r !== "customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EditableRole>("staff");
  const [perms, setPerms] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setEmail(""); setPhone(""); setRole("staff"); setPerms([]); setTouched(false);
      setPassword(generatePassword(12, secureRand));
    }
  }, [open]);

  const phoneOk = !phone || !!normalizeSomaliPhone(phone);
  const valid = name.trim().length >= 2 && EMAIL_RE.test(email.trim()) && password.length >= 8 && phoneOk;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    try {
      await mut.mutateAsync({
        action: "create",
        email: email.trim().toLowerCase(),
        password,
        full_name: name.trim(),
        phone: phone ? normalizeSomaliPhone(phone)! : undefined,
        role,
        permissions: role === "staff" ? perms : undefined,
      });
      toast.success(t("admin.users.created"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("admin.users.new")}</DialogTitle>
          <DialogDescription>{t("admin.users.newDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-name">{t("admin.customers.fullName")}</Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && name.trim().length < 2} />
              {touched && name.trim().length < 2 && <p className="text-xs text-destructive">{t("admin.validation.required")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">{t("common.email")}</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={touched && !EMAIL_RE.test(email.trim())} />
              {touched && !EMAIL_RE.test(email.trim()) && <p className="text-xs text-destructive">{t("admin.validation.email")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-phone">{t("common.phone")}</Label>
              <Input id="u-phone" inputMode="tel" placeholder="61 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!phoneOk} />
              {!phoneOk && <p className="text-xs text-destructive">{t("admin.validation.phone")}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as EditableRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="u-pass">{t("admin.users.tempPassword")}</Label>
              <PasswordField id="u-pass" value={password} onChange={setPassword} />
              <p className={cn("text-xs", touched && password.length < 8 ? "text-destructive" : "text-muted-foreground")}>{t("admin.users.passwordHint")}</p>
            </div>
          </div>
          {role === "staff" ? (
            <div>
              <Label className="mb-2 block">{t("admin.users.permissions")}</Label>
              <PermissionMatrix value={perms} onChange={setPerms} />
            </div>
          ) : (
            <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>{t("admin.users.adminAllPerms")}</AlertDescription></Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Edit ---------------- */
const EditUserDialog = ({ user, onOpenChange }: { user: AdminUser | null; onOpenChange: (o: boolean) => void }) => {
  const { t } = useI18n();
  const { profile } = useAuth();
  const mut = useAdminUserMutation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<EditableRole>("staff");
  const [perms, setPerms] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      setName(user.full_name ?? "");
      setPhone(user.phone ? formatSomaliPhone(user.phone) : "");
      setRole(user.role === "owner" ? "admin" : user.role);
      setPerms([...(user.permissions ?? [])].sort());
    }
  }, [user]);

  if (!user) return null;
  const roles = assignableRoles(profile?.role);
  const phoneOk = !phone || !!normalizeSomaliPhone(phone);
  const valid = name.trim().length >= 2 && phoneOk;

  const save = async () => {
    if (!valid) return;
    try {
      const normPhone = phone ? normalizeSomaliPhone(phone)! : "";
      const profileChanged = name.trim() !== user.full_name || normPhone !== (user.phone ?? "") || role !== user.role;
      if (profileChanged) {
        await mut.mutateAsync({
          action: "update", user_id: user.id, full_name: name.trim(), phone: normPhone,
          ...(role !== user.role ? { role } : {}),
        });
      }
      if (role === "staff" && !samePermissions(perms, user.permissions ?? [])) {
        await mut.mutateAsync({ action: "set_permissions", user_id: user.id, permissions: perms });
      }
      toast.success(t("admin.common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("admin.users.edit")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="e-name">{t("admin.customers.fullName")}</Label>
              <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-phone">{t("common.phone")}</Label>
              <Input id="e-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!phoneOk} />
              {!phoneOk && <p className="text-xs text-destructive">{t("admin.validation.phone")}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("admin.users.role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as EditableRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {role === "staff" ? (
            <div>
              <Label className="mb-2 block">{t("admin.users.permissions")}</Label>
              <PermissionMatrix value={perms} onChange={setPerms} />
            </div>
          ) : role === "admin" ? (
            <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>{t("admin.users.adminAllPerms")}</AlertDescription></Alert>
          ) : (
            <Alert><AlertDescription>{t("admin.users.customerNoAccess")}</AlertDescription></Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={mut.isPending || !valid}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Reset password ---------------- */
const ResetPasswordDialog = ({ user, onOpenChange }: { user: AdminUser | null; onOpenChange: (o: boolean) => void }) => {
  const { t } = useI18n();
  const mut = useAdminUserMutation();
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { if (user) { setPw(generatePassword(12, secureRand)); setDone(false); } }, [user]);
  if (!user) return null;
  return (
    <Dialog open={!!user} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.users.resetPassword")}</DialogTitle>
          <DialogDescription>{t("admin.users.resetDesc", { name: user.full_name || user.email || "" })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="r-pass">{t("admin.users.tempPassword")}</Label>
          <PasswordField id="r-pass" value={pw} onChange={(v) => { setPw(v); setDone(false); }} />
          {done ? (
            <p className="text-xs text-success">{t("admin.users.resetDone")}</p>
          ) : <p className="text-xs text-muted-foreground">{t("admin.users.passwordHint")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>{done ? t("common.close") : t("common.cancel")}</Button>
          {!done && (
            <Button
              disabled={mut.isPending || pw.length < 8}
              onClick={async () => {
                try {
                  await mut.mutateAsync({ action: "reset_password", user_id: user.id, password: pw });
                  setDone(true);
                  toast.success(t("admin.users.resetDone"));
                } catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
              }}
            >
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("admin.users.resetPassword")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Page ---------------- */
const AdminUsers = () => {
  const { t, formatDate } = useI18n();
  const { profile } = useAuth();
  const users = useAdminUsers();
  const mut = useAdminUserMutation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("team");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (users.data ?? [])
      .filter((u) => roleFilter === ALL ? true : roleFilter === "team" ? u.role !== "customer" : u.role === roleFilter)
      .filter((u) => !s || [u.full_name, u.email, u.phone].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => {
        const order: Record<Role, number> = { owner: 0, admin: 1, staff: 2, customer: 3 };
        return order[a.role] - order[b.role] || (a.full_name || "").localeCompare(b.full_name || "");
      });
  }, [users.data, search, roleFilter]);

  const actor = profile ? { id: profile.id, role: profile.role } : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.users.title")}
        description={t("admin.users.subtitle")}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><UserPlus className="mr-2 h-4 w-4" />{t("admin.users.new")}</Button>}
      />
      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users">{t("admin.users.tabUsers")}</TabsTrigger>
          <TabsTrigger value="audit">{t("admin.audit.title")}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-0">
          <Card className="mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.users.searchPh")} aria-label={t("common.search")} />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="sm:w-48" aria-label={t("admin.users.role")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">{t("admin.users.team")}</SelectItem>
                  <SelectItem value={ALL}>{t("admin.users.everyone")}</SelectItem>
                  {(["owner", "admin", "staff", "customer"] as Role[]).map((r) => <SelectItem key={r} value={r}>{t(`admin.role.${r}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>
          <Card className="overflow-hidden">
            {users.isLoading ? <TableSkeleton rows={6} cols={5} /> : users.isError ? (
              <ErrorState error={users.error} onRetry={() => users.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState icon={UserCog} title={search ? t("common.noResults") : t("admin.users.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.users.user")}</TableHead>
                      <TableHead>{t("admin.users.role")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("admin.users.permissions")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t("admin.users.lastSignIn")}</TableHead>
                      <TableHead className="w-10"><span className="sr-only">{t("common.actions")}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((u) => {
                      const editable = canModifyUser(actor, u);
                      const isSelf = u.id === profile?.id;
                      return (
                        <TableRow key={u.id} className={cn(!u.is_active && "opacity-60")}>
                          <TableCell>
                            <div className="font-medium">{u.full_name || "—"}{isSelf && <span className="ml-1.5 text-xs text-muted-foreground">({t("admin.users.you")})</span>}</div>
                            <div className="text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${formatSomaliPhone(u.phone)}` : ""}</div>
                          </TableCell>
                          <TableCell><RoleBadge role={u.role} /></TableCell>
                          <TableCell className="hidden text-sm md:table-cell">
                            {u.role === "owner" || u.role === "admin" ? <span className="text-muted-foreground">{t("admin.users.allPerms")}</span>
                              : u.role === "customer" ? "—" : t("admin.users.permCount", { n: u.permissions.length })}
                          </TableCell>
                          <TableCell><StatusBadge status={u.is_active ? "active" : "inactive"} label={u.is_active ? t("admin.common.active") : t("admin.common.inactive")} /></TableCell>
                          <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">{u.last_sign_in_at ? formatDate(u.last_sign_in_at, true) : t("admin.users.never")}</TableCell>
                          <TableCell>
                            {editable ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("common.actions")}><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => setEditing(u)}><Pencil className="mr-2 h-4 w-4" />{t("admin.users.editAccess")}</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setResetting(u)}><KeyRound className="mr-2 h-4 w-4" />{t("admin.users.resetPassword")}</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className={cn(u.is_active && "text-destructive focus:text-destructive")} onSelect={() => setToggling(u)}>
                                    <Power className="mr-2 h-4 w-4" />{u.is_active ? t("admin.users.deactivate") : t("admin.users.activate")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/50" tabIndex={0} aria-label={t("admin.users.locked")}>
                                    <ShieldCheck className="h-4 w-4" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{isSelf ? t("admin.users.lockedSelf") : t("admin.users.locked")}</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="audit" className="mt-0"><AuditLog /></TabsContent>
      </Tabs>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog user={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ResetPasswordDialog user={resetting} onOpenChange={(o) => !o && setResetting(null)} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        destructive={!!toggling?.is_active}
        title={toggling?.is_active ? t("admin.users.deactivateTitle", { name: toggling.full_name || toggling.email || "" }) : t("admin.users.activateTitle", { name: toggling?.full_name || toggling?.email || "" })}
        description={toggling?.is_active ? t("admin.users.deactivateDesc") : t("admin.users.activateDesc")}
        confirmLabel={toggling?.is_active ? t("admin.users.deactivate") : t("admin.users.activate")}
        onConfirm={async () => {
          if (!toggling) return;
          try {
            await mut.mutateAsync({ action: "set_active", user_id: toggling.id, is_active: !toggling.is_active });
            toast.success(t("admin.common.saved"));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("common.error"));
            throw e;
          }
        }}
      />
    </div>
  );
};

export default AdminUsers;
