import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ArrowLeft, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { motion } from "framer-motion";

const Cart = () => {
  const { items, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();

  if (items.length === 0) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground/30" />
          <h2 className="mt-4 font-heading text-2xl font-bold">Your Cart is Empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">Start adding products to your cart</p>
          <Link to="/products" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  const shipping = 5.99;
  const tax = totalPrice * 0.05;

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Link to="/products" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Continue Shopping
      </Link>
      <h1 className="font-heading text-3xl font-bold">Shopping Cart ({totalItems})</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <motion.div key={item.product.id} layout className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
                {item.product.category === "Electronics" ? "🎧" : item.product.category === "Fashion" ? "👗" : "📦"}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{item.product.name}</h3>
                    <p className="text-xs text-muted-foreground">{item.product.category}</p>
                  </div>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-muted-foreground transition-colors hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-border">
                    <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="px-2 py-1 text-xs"><Minus className="h-3 w-3" /></button>
                    <span className="w-8 text-center text-xs font-semibold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="px-2 py-1 text-xs"><Plus className="h-3 w-3" /></button>
                  </div>
                  <span className="text-sm font-bold">${(item.product.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-heading text-lg font-bold">Order Summary</h3>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${totalPrice.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>${shipping.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax (5%)</span><span>${tax.toFixed(2)}</span></div>
            <div className="border-t border-border pt-2">
              <div className="flex justify-between font-bold text-base">
                <span>Total</span><span>${(totalPrice + shipping + tax).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <Link to="/checkout" className="mt-5 flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            Proceed to Checkout
          </Link>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["EVC PLUS", "ZAAD", "SAHAL", "JEEP"].map((m) => (
              <span key={m} className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
