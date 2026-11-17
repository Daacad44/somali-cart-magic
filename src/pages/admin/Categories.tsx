import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/admin/shared";
import { slugify } from "@/components/admin/utils";
import { categoriesKey, useAdminCategories } from "@/hooks/admin/useStoreData";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  name_so: z.string().trim().max(80).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional(),
  icon: z.string().max(8).optional(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

const defaults = (c?: Category | null, nextSort = 0): Values => ({
  name: c?.name ?? "",
  name_so: c?.name_so ?? "",
  slug: c?.slug ?? "",
  description: c?.description ?? "",
  icon: c?.icon ?? "",
  sort_order: c?.sort_order ?? nextSort,
  is_active: c?.is_active ?? true,
});

const CategoryDialog = ({
  open, onOpenChange, category, nextSort,
}: { open: boolean; onOpenChange: (o: boolean) => void; category: Category | null; nextSort: number }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(category, nextSort) });

  useEffect(() => {
    if (open) { form.reset(defaults(category, nextSort)); setSlugTouched(!!category); }
  }, [open, category, nextSort, form]);

  const name = form.watch("name");
  useEffect(() => {
    if (!slugTouched) form.setValue("slug", slugify(name ?? ""), { shouldValidate: !!name });
  }, [name, slugTouched, form]);

  const submit = async (v: Values) => {
    const payload = {
      name: v.name.trim(), name_so: v.name_so?.trim() || null, slug: v.slug,
      description: v.description?.trim() || null, icon: v.icon?.trim() || null,
      sort_order: v.sort_order, is_active: v.is_active,
    };
    const { error } = category
      ? await supabase.from("categories").update(payload).eq("id", category.id)
      : await supabase.from("categories").insert(payload);
    if (error) {
      if (error.code === "23505") form.setError("slug", { message: t("admin.validation.unique") });
      toast.error(error.code === "23505" ? t("admin.validation.uniqueField", { field: "slug" }) : error.message);
      return;
    }
    toast.success(t("admin.common.saved"));
    qc.invalidateQueries({ queryKey: categoriesKey });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !form.formState.isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? t("admin.categories.edit") : t("admin.categories.new")}</DialogTitle>
          <DialogDescription>{t("admin.categories.formDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[5rem_1fr]">
              <FormField control={form.control} name="icon" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.icon")}</FormLabel>
                  <FormControl><Input {...field} className="text-center text-lg" placeholder="🛍️" maxLength={8} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t("admin.products.nameEn")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  {fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.required")}</p>}
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="name_so" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("admin.products.nameSo")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="slug" render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t("admin.common.slug")}</FormLabel>
                  <FormControl><Input {...field} onChange={(e) => { setSlugTouched(true); field.onChange(e.target.value.toLowerCase()); }} /></FormControl>
                  {fieldState.error && <p className="text-sm font-medium text-destructive">{fieldState.error.message === t("admin.validation.unique") ? fieldState.error.message : t("admin.validation.slug")}</p>}
                </FormItem>
              )} />
              <FormField control={form.control} name="sort_order" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.categories.sortOrder")}</FormLabel>
                  <FormControl><Input type="number" step="1" {...field} /></FormControl>
                  <FormDescription className="text-xs">{t("admin.categories.sortHint")}</FormDescription>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("admin.categories.description")}</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="is_active" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3">
                <FormLabel>{t("admin.common.active")}</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {category ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const AdminCategories = () => {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const cats = useAdminCategories();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const counts = useQuery({
    queryKey: ["admin", "categories", "product-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("category_id").not("category_id", "is", null).limit(10000);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as { category_id: string }[]) m[r.category_id] = (m[r.category_id] ?? 0) + 1;
      return m;
    },
  });

  const list = cats.data ?? [];
  const nextSort = list.length ? Math.max(...list.map((c) => c.sort_order)) + 10 : 10;

  const toggleActive = async (c: Category, v: boolean) => {
    const { error } = await supabase.from("categories").update({ is_active: v }).eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: categoriesKey });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("admin.categories.title")}
        description={t("admin.categories.subtitle")}
        actions={<Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("admin.categories.new")}</Button>}
      />
      <Card className="overflow-hidden">
        {cats.isLoading ? <TableSkeleton rows={5} cols={4} /> : cats.isError ? (
          <ErrorState error={cats.error} onRetry={() => cats.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={FolderTree} title={t("admin.categories.empty")} action={<Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("admin.categories.new")}</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("admin.common.slug")}</TableHead>
                  <TableHead className="text-center">{t("admin.nav.products")}</TableHead>
                  <TableHead className="text-center">{t("admin.common.active")}</TableHead>
                  <TableHead className="w-24 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id} className={cn(!c.is_active && "opacity-60")}>
                    <TableCell className="tabular-nums text-muted-foreground">{c.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg" aria-hidden>{c.icon || "📁"}</span>
                        <div>
                          <div className="font-medium">{pick(c.name, c.name_so)}</div>
                          <div className="text-xs text-muted-foreground">{c.name}{c.name_so ? ` · ${c.name_so}` : ""}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{c.slug}</TableCell>
                    <TableCell className="text-center tabular-nums">{counts.data?.[c.id] ?? 0}</TableCell>
                    <TableCell className="text-center"><Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c, v)} aria-label={t("admin.common.active")} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setOpen(true); }} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setToDelete(c)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} nextSort={nextSort} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("admin.categories.deleteTitle", { name: toDelete ? pick(toDelete.name, toDelete.name_so) : "" })}
        description={toDelete && (counts.data?.[toDelete.id] ?? 0) > 0
          ? t("admin.categories.deleteWithProducts", { n: counts.data?.[toDelete.id] ?? 0 })
          : t("admin.categories.deleteDesc")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          const { error } = await supabase.from("categories").delete().eq("id", toDelete!.id);
          if (error) { toast.error(error.message); throw error; }
          toast.success(t("admin.categories.deleted"));
          qc.invalidateQueries({ queryKey: ["admin", "categories"] });
          qc.invalidateQueries({ queryKey: ["admin", "products"] });
        }}
      />
    </div>
  );
};

export default AdminCategories;
