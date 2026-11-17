import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import common from "@/i18n/common";
import store from "@/i18n/store";
import admin from "@/i18n/admin";
import pos from "@/i18n/pos";

export type Lang = "so" | "en";
type Dict = Record<string, string>;

// Each namespace file exports { so: {...}, en: {...} } with keys already prefixed
// (e.g. "store.cart.title"). Somali is the default language.
const dictionaries: Record<Lang, Dict> = {
  so: { ...common.so, ...store.so, ...admin.so, ...pos.so },
  en: { ...common.en, ...store.en, ...admin.en, ...pos.en },
};

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** t("store.cart.title") or t("x", { n: 3 }) → replaces {n} */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Picks the Somali field when lang=so and it exists: pick(p.name, p.name_so) */
  pick: (en: string | null | undefined, so: string | null | undefined) => string;
  formatMoney: (amount: number | string | null | undefined, currency?: string) => string;
  formatDate: (iso: string | null | undefined, withTime?: boolean) => string;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);
const STORAGE_KEY = "botan.lang";

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === "en" || v === "so" ? v : "so";
    } catch {
      return "so";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [lang]);

  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang,
    t,
    pick: (en, so) => (lang === "so" && so ? so : en ?? so ?? ""),
    formatMoney: (amount, currency = "USD") => {
      const n = Number(amount ?? 0);
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
      } catch {
        return `${currency} ${n.toFixed(2)}`;
      }
    },
    formatDate: (iso, withTime = false) => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleString(lang === "so" ? "so-SO" : "en-GB", {
        year: "numeric", month: "short", day: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
    },
  }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
};
