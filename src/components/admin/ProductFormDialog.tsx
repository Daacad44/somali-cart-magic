import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Product, VariantOption } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAdminCategories } from "@/hooks/admin/useStoreData";
import { isoToLocalInput, localInputToIso, moveItem, parseTags, slugify } from "./utils";

const BUCKET = "product-images";
const MAX_IMAGE_MB = 5;
const NONE = "none";

const optionalMoney = z.union([z.literal(""), z.coerce.number().min(0)]).optional();

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  name_so: z.string().trim().max(160).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(5000).optional(),
  description_so: z.string().max(5000).optional(),
  category_id: z.string(),
  price: z.coerce.number().min(0),
  compare_at_price: optionalMoney,
  sku: z.string().trim().max(64).optional(),
  stock: z.coerce.number().int().min(0),
  low_stock_threshold: z.coerce.number().int().min(0),
  is_featured: z.boolean(),
  is_active: z.boolean(),
  flash_sale_ends_at: z.string().optional(),
  tags: z.string().optional(),
}).refine((v) => v.compare_at_price === "" || v.compare_at_price === undefined || Number(v.compare_at_price) >= v.price, {
  path: ["compare_at_price"], message: "compare",
});
type FormValues = z.infer<typeof schema>;

const toDefaults = (p?: Product | null): FormValues => ({
  name: p?.name ?? "",
  name_so: p?.name_so ?? "",
  slug: p?.slug ?? "",
  description: p?.description ?? "",
  description_so: p?.description_so ?? "",
  category_id: p?.category_id ?? NONE,
  price: p?.price ?? 0,
  compare_at_price: p?.compare_at_price ?? "",
  sku: p?.sku ?? "",
  stock: p?.stock ?? 0,
  low_stock_threshold: p?.low_stock_threshold ?? 5,
  is_featured: p?.is_featured ?? false,
  is_active: p?.is_active ?? true,
  flash_sale_ends_at: isoToLocalInput(p?.flash_sale_ends_at),
  tags: (p?.tags ?? []).join(", "),
});

/* ---------------- Variant options editor ---------------- */

const VariantEditor = ({ value, onChange }: { value: VariantOption[]; onChange: (v: VariantOption[]) => void }) => {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const update = (i: number, patch: Partial<VariantOption>) => onChange(value.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addOption = (i: number) => {
    const raw = (drafts[i] ?? "").trim();
    if (!raw) return;
    const opts = [...new Set([...value[i].options, ...raw.split(",").map((s) => s.trim()).filter(Boolean)])];
    update(i, { options: opts });
    setDrafts((d) => ({ ...d, [i]: "" }));
  };
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-muted-foreground">{t("admin.products.noVariants")}</p>}
      {value.map((v, i) => (
        <div key={i} className="rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={v.type}
              onChange={(e) => update(i, { type: e.target.value })}
              placeholder={t("admin.products.variantType")}
              className="h-9 max-w-[12rem]"
              aria-label={t("admin.products.variantType")}
            />
            <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label={t("common.delete")}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {v.options.map((o) => (
              <Badge key={o} variant="secondary" className="gap-1 pr-1">
                {o}
                <button type="button" className="rounded-full p-0.5 hover:bg-background/60" onClick={() => update(i, { options: v.options.filter((x) => x !== o) })} aria-label={`${t("common.delete")} ${o}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={drafts[i] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(i); } }}
              placeholder={t("admin.products.variantOptionPh")}
              className="h-9"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => addOption(i)}>{t("admin.common.add")}</Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { type: "", options: [] }])}>
        <Plus className="mr-1 h-4 w-4" /> {t("admin.products.addVariant")}
      </Button>
    </div>
  );
};

/* ---------------- Image manager ---------------- */

const ImageManager = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    const urls: string[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) { toast.error(t("admin.products.notImage", { name: f.name })); continue; }
      if (f.size > MAX_IMAGE_MB * 1024 * 1024) { toast.error(t("admin.products.imageTooLarge", { name: f.name, mb: MAX_IMAGE_MB })); continue; }
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `products/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { cacheControl: "31536000", upsert: false, contentType: f.type });
      if (error) { toast.error(error.message); continue; }
      urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
    setUploading(0);
    if (urls.length) onChange([...value, ...urls]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((url, i) => (
          <div key={url + i} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                <Star className="h-2.5 w-2.5" /> {t("admin.products.cover")}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <div className="flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => onChange(moveItem(value, i, i - 1))} className="rounded bg-white/90 p-1 text-black disabled:opacity-40" aria-label={t("admin.products.moveLeft")}>
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button type="button" disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, i + 1))} className="rounded bg-white/90 p-1 text-black disabled:opacity-40" aria-label={t("admin.products.moveRight")}>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="rounded bg-destructive p-1 text-destructive-foreground" aria-label={t("admin.products.removeImage")}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading > 0}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {uploading ? t("admin.products.uploading", { n: uploading }) : t("admin.products.addImages")}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      <p className="text-xs text-muted-foreground">{t("admin.products.imagesHint", { mb: MAX_IMAGE_MB })}</p>
    </div>
  );
};

/* ---------------- Dialog ---------------- */

export const ProductFormDialog = ({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product | null }) => {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const categories = useAdminCategories();
  const isEdit = !!product;
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toDefaults(product) });

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(product));
      setImages(product?.images ?? []);
      setVariants(product?.variant_options ?? []);
      setSlugTouched(!!product);
    }
  }, [open, product, form]);

  const name = form.watch("name");
  useEffect(() => {
    if (!slugTouched) form.setValue("slug", slugify(name ?? ""), { shouldValidate: !!name });
  }, [name, slugTouched, form]);

  const onSubmit = async (v: FormValues) => {
    const cleanVariants = variants
      .map((x) => ({ type: x.type.trim(), options: x.options.filter(Boolean) }))
      .filter((x) => x.type && x.options.length);
    const payload = {
      name: v.name.trim(),
      name_so: v.name_so?.trim() || null,
      slug: v.slug,
      description: v.description?.trim() || null,
      description_so: v.description_so?.trim() || null,
      category_id: v.category_id === NONE ? null : v.category_id,
      price: Number(v.price),
      compare_at_price: v.compare_at_price === "" || v.compare_at_price === undefined ? null : Number(v.compare_at_price),
      sku: v.sku?.trim() || null,
      stock: Number(v.stock),
      low_stock_threshold: Number(v.low_stock_threshold),
      is_featured: v.is_featured,
      is_active: v.is_active,
      flash_sale_ends_at: localInputToIso(v.flash_sale_ends_at),
      tags: parseTags(v.tags ?? ""),
      images,
      variant_options: cleanVariants,
    };
    const { error } = isEdit
      ? await supabase.from("products").update(payload).eq("id", product!.id)
      : await supabase.from("products").insert(payload);
    if (error) {
      if (error.code === "23505") {
        const field = error.message.includes("sku") ? "sku" : "slug";
        form.setError(field, { message: t("admin.validation.unique") });
        toast.error(t("admin.validation.uniqueField", { field: field.toUpperCase() }));
      } else toast.error(error.message);
      return;
    }
    toast.success(isEdit ? t("admin.products.updated") : t("admin.products.created"));
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    onOpenChange(false);
  };

  const err = (key: string | undefined, fallback: string) => {
    if (!key) return undefined;
    if (key === "compare") return t("admin.products.compareError");
    return fallback;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!form.formState.isSubmitting) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{isEdit ? t("admin.products.editTitle") : t("admin.products.newTitle")}</DialogTitle>
          <DialogDescription>{t("admin.products.formDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <Tabs defaultValue="details" className="p-5">
                <TabsList className="mb-4 grid w-full grid-cols-4">
                  <TabsTrigger value="details">{t("admin.products.tabDetails")}</TabsTrigger>
                  <TabsTrigger value="pricing">{t("admin.products.tabPricing")}</TabsTrigger>
                  <TabsTrigger value="media">{t("admin.products.tabMedia")}</TabsTrigger>
                  <TabsTrigger value="variants">{t("admin.products.tabVariants")}</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="name" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.nameEn")}</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.required")}</p>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="name_so" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.nameSo")}</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="slug" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.common.slug")}</FormLabel>
                        <FormControl>
                          <Input {...field} onChange={(e) => { setSlugTouched(true); field.onChange(slugify(e.target.value) || e.target.value.toLowerCase()); }} />
                        </FormControl>
                        {fieldState.error ? (
                          <p className="text-sm font-medium text-destructive">{fieldState.error.message === t("admin.validation.unique") ? fieldState.error.message : t("admin.validation.slug")}</p>
                        ) : <FormDescription>/product/{field.value || "…"}</FormDescription>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="category_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.category")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>{t("admin.products.noCategory")}</SelectItem>
                            {(categories.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{pick(c.name, c.name_so)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.products.descEn")}</FormLabel>
                      <FormControl><Textarea rows={3} {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description_so" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.products.descSo")}</FormLabel>
                      <FormControl><Textarea rows={3} {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tags" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.products.tags")}</FormLabel>
                      <FormControl><Input placeholder="new, summer, gift" {...field} /></FormControl>
                      <FormDescription>{t("admin.products.tagsHint")}</FormDescription>
                    </FormItem>
                  )} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="is_active" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <FormLabel>{t("admin.common.active")}</FormLabel>
                          <FormDescription className="text-xs">{t("admin.products.activeHint")}</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="is_featured" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <FormLabel>{t("admin.products.featured")}</FormLabel>
                          <FormDescription className="text-xs">{t("admin.products.featuredHint")}</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="price" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.price")}</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" inputMode="decimal" {...field} /></FormControl>
                        {fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.nonNegative")}</p>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="compare_at_price" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.compareAt")}</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" inputMode="decimal" {...field} value={field.value ?? ""} /></FormControl>
                        {fieldState.error ? (
                          <p className="text-sm font-medium text-destructive">{err(fieldState.error.message, t("admin.validation.nonNegative"))}</p>
                        ) : <FormDescription>{t("admin.products.compareHint")}</FormDescription>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="sku" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {fieldState.error && <p className="text-sm font-medium text-destructive">{fieldState.error.message}</p>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="flash_sale_ends_at" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.flashSaleEnds")}</FormLabel>
                        <FormControl><Input type="datetime-local" {...field} /></FormControl>
                        <FormDescription>{t("admin.products.flashSaleHint")}</FormDescription>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="stock" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.stock")}</FormLabel>
                        <FormControl><Input type="number" step="1" min="0" inputMode="numeric" {...field} /></FormControl>
                        {fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.integer")}</p>}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="low_stock_threshold" render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>{t("admin.products.lowStockThreshold")}</FormLabel>
                        <FormControl><Input type="number" step="1" min="0" inputMode="numeric" {...field} /></FormControl>
                        {fieldState.error && <p className="text-sm font-medium text-destructive">{t("admin.validation.integer")}</p>}
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                <TabsContent value="media" className="mt-0">
                  <ImageManager value={images} onChange={setImages} />
                </TabsContent>

                <TabsContent value="variants" className="mt-0">
                  <p className="mb-3 text-sm text-muted-foreground">{t("admin.products.variantsHint")}</p>
                  <VariantEditor value={variants} onChange={setVariants} />
                </TabsContent>
              </Tabs>
            </ScrollArea>
            <DialogFooter className="border-t p-4">
              {Object.keys(form.formState.errors).length > 0 && (
                <p className="mr-auto self-center text-sm text-destructive">{t("admin.validation.fixErrors")}</p>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductFormDialog;
