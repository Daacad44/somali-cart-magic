import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { normalizeSomaliPhone } from "@/lib/wallet";
import { safeNext } from "@/hooks/store/query-utils";
import { NotConfigured, FullPageSpinner } from "@/components/auth/Guards";
import { useStoreSettings } from "@/hooks/store/useCatalog";

type Mode = "signin" | "signup" | "forgot" | "update-password";
const MODES: Mode[] = ["signin", "signup", "forgot", "update-password"];

function authErrorMessage(err: unknown, t: (k: string) => string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return t("store.auth.err.invalid");
  if (/email not confirmed/i.test(msg)) return t("store.auth.err.unconfirmed");
  if (/already registered|already exists/i.test(msg)) return t("store.auth.err.exists");
  if (/rate limit|too many/i.test(msg)) return t("store.auth.err.rateLimit");
  if (/password/i.test(msg) && /(weak|short|at least)/i.test(msg)) return t("store.auth.err.weak");
  return msg || t("common.error");
}

const PasswordInput = (props: React.ComponentProps<typeof Input>) => {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className="pr-10" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={show ? t("store.auth.hidePassword") : t("store.auth.showPassword")}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

const SignInForm = ({ onDone, onForgot }: { onDone: () => void; onForgot: () => void }) => {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const schema = useMemo(() => z.object({
    email: z.string().trim().email(t("store.v.email")),
    password: z.string().min(1, t("store.v.required")),
  }), [t]);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const submit = form.handleSubmit(async (v) => {
    try {
      await signIn(v.email, v.password);
      toast.success(t("store.auth.welcomeBack"));
      onDone();
    } catch (e) {
      form.setError("root", { message: authErrorMessage(e, t) });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>{t("common.email")}</FormLabel><FormControl><Input type="email" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="password" render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>{t("common.password")}</FormLabel>
              <button type="button" onClick={onForgot} className="text-xs font-medium text-accent hover:text-foreground">{t("store.auth.forgot")}</button>
            </div>
            <FormControl><PasswordInput autoComplete="current-password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {form.formState.errors.root && <p role="alert" className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("common.signIn")}
        </Button>
      </form>
    </Form>
  );
};

const SignUpForm = ({ onDone, onNeedsConfirm }: { onDone: () => void; onNeedsConfirm: (email: string) => void }) => {
  const { t } = useI18n();
  const { signUp } = useAuth();
  const schema = useMemo(() => z.object({
    full_name: z.string().trim().min(2, t("store.checkout.v.name")).max(100),
    phone: z.string().trim().refine((v) => !!normalizeSomaliPhone(v), t("store.v.phone")),
    email: z.string().trim().email(t("store.v.email")),
    password: z.string().min(8, t("store.v.password")).max(72),
  }), [t]);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { full_name: "", phone: "", email: "", password: "" } });

  const submit = form.handleSubmit(async (v) => {
    try {
      const { needsConfirmation } = await signUp({
        email: v.email,
        password: v.password,
        full_name: v.full_name,
        phone: normalizeSomaliPhone(v.phone) ?? undefined,
      });
      if (needsConfirmation) onNeedsConfirm(v.email);
      else {
        toast.success(t("store.auth.accountCreated"));
        onDone();
      }
    } catch (e) {
      form.setError("root", { message: authErrorMessage(e, t) });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField control={form.control} name="full_name" render={({ field }) => (
          <FormItem><FormLabel>{t("store.checkout.fullName")}</FormLabel><FormControl><Input autoComplete="name" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>{t("common.phone")}</FormLabel><FormControl><Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+252 61 234 5678" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>{t("common.email")}</FormLabel><FormControl><Input type="email" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="password" render={({ field }) => (
          <FormItem><FormLabel>{t("common.password")}</FormLabel><FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        {form.formState.errors.root && <p role="alert" className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("store.auth.createAccount")}
        </Button>
      </form>
    </Form>
  );
};

const ForgotForm = ({ onBack }: { onBack: () => void }) => {
  const { t } = useI18n();
  const { resetPassword } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const schema = useMemo(() => z.object({ email: z.string().trim().email(t("store.v.email")) }), [t]);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const submit = form.handleSubmit(async (v) => {
    try {
      await resetPassword(v.email);
      setSentTo(v.email);
    } catch (e) {
      form.setError("root", { message: authErrorMessage(e, t) });
    }
  });

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto h-10 w-10 text-success" />
        <p className="mt-3 text-sm text-muted-foreground">{t("store.auth.resetSent", { email: sentTo })}</p>
        <Button variant="outline" className="mt-5" onClick={onBack}>{t("store.auth.backToSignIn")}</Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">{t("store.auth.forgotDesc")}</p>
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>{t("common.email")}</FormLabel><FormControl><Input type="email" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        {form.formState.errors.root && <p role="alert" className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("store.auth.sendReset")}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>{t("store.auth.backToSignIn")}</Button>
      </form>
    </Form>
  );
};

const UpdatePasswordForm = ({ onDone }: { onDone: () => void }) => {
  const { t } = useI18n();
  const schema = useMemo(() => z.object({
    password: z.string().min(8, t("store.v.password")).max(72),
    confirm: z.string(),
  }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: t("store.v.passwordMatch") }), [t]);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  const submit = form.handleSubmit(async (v) => {
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) {
      form.setError("root", { message: authErrorMessage(error, t) });
      return;
    }
    toast.success(t("store.auth.passwordUpdated"));
    onDone();
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField control={form.control} name="password" render={({ field }) => (
          <FormItem><FormLabel>{t("store.auth.newPassword")}</FormLabel><FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="confirm" render={({ field }) => (
          <FormItem><FormLabel>{t("store.auth.confirmPassword")}</FormLabel><FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        {form.formState.errors.root && <p role="alert" className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("store.auth.updatePassword")}
        </Button>
      </form>
    </Form>
  );
};

const AuthPage = () => {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { data: settings } = useStoreSettings();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawMode = params.get("mode") as Mode | null;
  const mode: Mode = rawMode && MODES.includes(rawMode) ? rawMode : "signin";
  const next = safeNext(params.get("next"));
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const setMode = (m: Mode) => {
    const p = new URLSearchParams(params);
    if (m === "signin") p.delete("mode");
    else p.set("mode", m);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    document.title = `${t(`store.auth.title.${mode}`)} · ${settings?.store_name ?? "Suuq"}`;
  }, [mode, t, settings?.store_name]);

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (loading) return <FullPageSpinner />;
  // Already signed in → go where they were headed (except when setting a new password).
  if (user && mode !== "update-password") return <Navigate to={next} replace />;

  const done = () => navigate(next, { replace: true });

  return (
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-premium sm:p-8">
        <h1 className="text-center font-heading text-2xl font-bold">{t(`store.auth.title.${mode}`)}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{t(`store.auth.subtitle.${mode}`)}</p>

        {(mode === "signin" || mode === "signup") && !confirmEmail && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t("common.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("store.auth.signUp")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="mt-6">
          {confirmEmail ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-sm text-muted-foreground">{t("store.auth.confirmSent", { email: confirmEmail })}</p>
              <Button variant="outline" className="mt-5" onClick={() => { setConfirmEmail(null); setMode("signin"); }}>
                {t("store.auth.backToSignIn")}
              </Button>
            </div>
          ) : mode === "signin" ? (
            <SignInForm onDone={done} onForgot={() => setMode("forgot")} />
          ) : mode === "signup" ? (
            <SignUpForm onDone={done} onNeedsConfirm={setConfirmEmail} />
          ) : mode === "forgot" ? (
            <ForgotForm onBack={() => setMode("signin")} />
          ) : user ? (
            <UpdatePasswordForm onDone={() => navigate("/account", { replace: true })} />
          ) : (
            <div className="text-center text-sm text-muted-foreground">
              <p>{t("store.auth.resetLinkInvalid")}</p>
              <Button variant="outline" className="mt-4" onClick={() => setMode("forgot")}>{t("store.auth.sendReset")}</Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">{t("common.goHome")}</Link>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
