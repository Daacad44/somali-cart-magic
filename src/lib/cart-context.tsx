import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Product } from "@/integrations/supabase/types";
import {
  CART_STORAGE_KEY,
  addLine,
  cartCount,
  cartSubtotal,
  parseStoredCart,
  reconcileCart,
  removeLine,
  serializeCart,
  setLineQuantity,
  type AddResult,
  type CartChange,
  type CartLine,
  type CartProduct,
  type CartVariants,
} from "@/lib/cart-utils";

export type { CartLine, CartChange, CartProduct, CartVariants } from "@/lib/cart-utils";

interface CartContextType {
  items: CartLine[];
  /** Returns how many units were actually added and whether stock limited it. */
  addToCart: (product: Product | CartProduct, quantity?: number, variants?: CartVariants) => Omit<AddResult, "items">;
  removeFromCart: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  /** Changes detected by the last revalidation against the database. */
  changes: CartChange[];
  dismissChanges: () => void;
  revalidate: () => Promise<CartChange[]>;
  revalidating: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadInitial(): CartLine[] {
  try {
    return parseStoredCart(localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartLine[]>(loadInitial);
  const [changes, setChanges] = useState<CartChange[]>([]);
  const [revalidating, setRevalidating] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, serializeCart(items));
    } catch {
      /* storage full / disabled */
    }
  }, [items]);

  // Sync between tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) setItems(parseStoredCart(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const revalidate = useCallback(async (): Promise<CartChange[]> => {
    const current = itemsRef.current;
    if (!isSupabaseConfigured || current.length === 0) return [];
    setRevalidating(true);
    try {
      const ids = Array.from(new Set(current.map((i) => i.product.id)));
      const { data, error } = await supabase
        .from("products")
        .select("*, category:categories(id,name,name_so,slug)")
        .in("id", ids);
      if (error) return [];
      // Re-read in case the user changed the cart while we were fetching.
      const { items: next, changes: found } = reconcileCart(itemsRef.current, (data ?? []) as Product[]);
      setItems(next);
      if (found.length) setChanges(found);
      return found;
    } finally {
      setRevalidating(false);
    }
  }, []);

  // Revalidate prices/stock once on load.
  useEffect(() => {
    void revalidate();
  }, [revalidate]);

  const addToCart = useCallback<CartContextType["addToCart"]>((product, quantity = 1, variants) => {
    const res = addLine(itemsRef.current, product, quantity, variants);
    itemsRef.current = res.items;
    setItems(res.items);
    return { added: res.added, clamped: res.clamped };
  }, []);

  const removeFromCart = useCallback((key: string) => setItems((prev) => removeLine(prev, key)), []);
  const updateQuantity = useCallback((key: string, q: number) => setItems((prev) => setLineQuantity(prev, key, q)), []);
  const clearCart = useCallback(() => {
    setItems([]);
    setChanges([]);
  }, []);
  const dismissChanges = useCallback(() => setChanges([]), []);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      totalItems: cartCount(items),
      subtotal: cartSubtotal(items),
      changes,
      dismissChanges,
      revalidate,
      revalidating,
    }),
    [items, addToCart, removeFromCart, updateQuantity, clearCart, changes, dismissChanges, revalidate, revalidating],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
