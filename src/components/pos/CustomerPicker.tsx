import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, UserPlus, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { DuplicateCustomerError, useCreatePosCustomer, usePosCustomers, type PosCustomer } from "@/hooks/pos";
import { formatSomaliPhone, normalizeSomaliPhone } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";
import { rpcErrorMessage } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

interface Props {
  value: PosCustomer | null;
  onChange: (c: PosCustomer | null) => void;
  disabled?: boolean;
}

/** Combobox: search existing customers by name/phone, Walk-in, or quick-create. */
export function CustomerPicker({ value, onChange, disabled }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const { data, isFetching, error } = usePosCustomers(debounced, open);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSeed, setCreateSeed] = useState("");

  const startCreate = () => {
    setCreateSeed(query);
    setOpen(false);
    setCreateOpen(true);
  };

  return (
    <>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label={t("pos.customer.label")}
              disabled={disabled}
              className="h-11 flex-1 justify-between px-3 font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                {value ? <UserRound className="h-4 w-4 shrink-0 text-primary" /> : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">
                  {value ? value.full_name : t("pos.customer.walkIn")}
                  {value?.phone && <span className="ml-2 text-xs text-muted-foreground">{formatSomaliPhone(value.phone)}</span>}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput value={query} onValueChange={setQuery} placeholder={t("pos.customer.searchPlaceholder")} />
              <CommandList>
                {isFetching && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
                  </div>
                )}
                {error && <div className="px-3 py-2 text-xs text-destructive">{t("pos.customer.loadError")}</div>}
                <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__walkin" onSelect={() => { onChange(null); setOpen(false); }}>
                    <Users className="mr-2 h-4 w-4" />
                    {t("pos.customer.walkIn")}
                    <Check className={cn("ml-auto h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  </CommandItem>
                  <CommandItem value="__new" onSelect={startCreate}>
                    <UserPlus className="mr-2 h-4 w-4 text-primary" />
                    {t("pos.customer.new")}
                  </CommandItem>
                </CommandGroup>
                {(data?.length ?? 0) > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading={debounced ? t("pos.customer.results") : t("pos.customer.recent")}>
                      {data!.map((c) => (
                        <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c); setOpen(false); }}>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">{c.full_name}</span>
                            {c.phone && <span className="text-xs text-muted-foreground">{formatSomaliPhone(c.phone)}</span>}
                          </div>
                          <Check className={cn("ml-auto h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => { setCreateSeed(""); setCreateOpen(true); }}
          disabled={disabled}
          aria-label={t("pos.customer.new")}
          title={t("pos.customer.new")}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      <NewCustomerDialog
        open={createOpen}
        seed={createSeed}
        onOpenChange={setCreateOpen}
        onCreated={(c) => { onChange(c); setCreateOpen(false); setQuery(""); }}
      />
    </>
  );
}

function NewCustomerDialog({
  open, seed, onOpenChange, onCreated,
}: { open: boolean; seed: string; onOpenChange: (o: boolean) => void; onCreated: (c: PosCustomer) => void }) {
  const { t, lang } = useI18n();
  const create = useCreatePosCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const looksLikePhone = /^[+\d\s()-]{5,}$/.test(seed.trim());
    setName(looksLikePhone ? "" : seed.trim());
    setPhone(looksLikePhone ? seed.trim() : "");
    setAddress("");
    setTouched(false);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  const normalized = normalizeSomaliPhone(phone);
  const nameError = touched && name.trim().length < 2 ? t("pos.customer.nameRequired") : null;
  const phoneError = touched && !normalized ? t("pos.pay.invalidPhone") : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim().length < 2 || !normalized) return;
    try {
      const c = await create.mutateAsync({ full_name: name, phone: normalized, address });
      toast.success(t("pos.customer.created", { name: c.full_name }));
      onCreated(c);
    } catch (err) {
      if (err instanceof DuplicateCustomerError) {
        toast.info(t("pos.customer.exists", { name: err.existing.full_name }));
        onCreated(err.existing);
        return;
      }
      toast.error(rpcErrorMessage(err, lang));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t("pos.customer.new")}</DialogTitle>
          <DialogDescription>{t("pos.customer.newHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="pos-nc-name">{t("common.name")} *</Label>
            <Input id="pos-nc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              aria-invalid={Boolean(nameError)} className="h-11" autoComplete="off" />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pos-nc-phone">{t("common.phone")} *</Label>
            <Input id="pos-nc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="61 234 5678" aria-invalid={Boolean(phoneError)} className="h-11 tabular-nums" autoComplete="off" />
            {phoneError ? (
              <p className="text-xs text-destructive">{phoneError}</p>
            ) : normalized ? (
              <p className="text-xs text-muted-foreground">{formatSomaliPhone(normalized)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pos-nc-address">{t("pos.customer.address")}</Label>
            <Textarea id="pos-nc-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
