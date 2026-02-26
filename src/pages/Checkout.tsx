import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, CreditCard, MapPin, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { paymentMethods } from "@/lib/mock-data";

const Checkout = () => {
  const { items, totalPrice, clearCart } = useCart();
  const [step, setStep] = useState<"shipping" | "payment" | "confirm">("shipping");
  const [selectedPayment, setSelectedPayment] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);

  const shipping = 5.99;
  const tax = totalPrice * 0.05;
  const total = totalPrice + shipping + tax;

  if (orderPlaced) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success">
            <Check className="h-10 w-10 text-success-foreground" />
          </div>
          <h2 className="mt-5 font-heading text-2xl font-bold">Order Confirmed!</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your order has been placed. You'll receive a confirmation via SMS.</p>
          <p className="mt-1 text-sm text-muted-foreground">Transaction ID: <span className="font-mono font-semibold text-foreground">TXN-{Date.now()}</span></p>
          <Link to="/products" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Continue Shopping
          </Link>
        </motion.div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold">No items to checkout</p>
          <Link to="/products" className="mt-2 text-sm text-accent">Go shopping →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Link to="/cart" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Cart
      </Link>
      <h1 className="font-heading text-3xl font-bold">Checkout</h1>

      {/* Steps indicator */}
      <div className="mt-6 flex items-center gap-2 text-sm">
        {["shipping", "payment", "confirm"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step === s ? "bg-primary text-primary-foreground" : i < ["shipping", "payment", "confirm"].indexOf(step) ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i < ["shipping", "payment", "confirm"].indexOf(step) ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`capitalize ${step === s ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</span>
            {i < 2 && <div className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Shipping */}
          {step === "shipping" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-6">
              <h3 className="flex items-center gap-2 font-heading text-lg font-bold"><MapPin className="h-5 w-5 text-accent" /> Shipping Address</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
                  <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Mohamed Ali" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                  <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="+252 61 XXX XXXX" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Address</label>
                  <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Street address" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">City</label>
                  <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Mogadishu" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">District</label>
                  <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Hodan" />
                </div>
              </div>
              <button onClick={() => setStep("payment")} className="mt-6 rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                Continue to Payment
              </button>
            </motion.div>
          )}

          {/* Payment */}
          {step === "payment" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-6">
              <h3 className="flex items-center gap-2 font-heading text-lg font-bold"><CreditCard className="h-5 w-5 text-accent" /> Payment Method</h3>
              <p className="mt-1 text-sm text-muted-foreground">Select your mobile money service</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => setSelectedPayment(pm.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      selectedPayment === pm.id ? "border-accent bg-accent/5 shadow-premium" : "border-border hover:border-accent/30"
                    }`}
                  >
                    <span className="text-2xl">{pm.icon}</span>
                    <div>
                      <p className="text-sm font-bold">{pm.name}</p>
                      <p className="text-xs text-muted-foreground">{pm.description}</p>
                    </div>
                    {selectedPayment === pm.id && (
                      <Check className="ml-auto h-5 w-5 text-accent" />
                    )}
                  </button>
                ))}
              </div>
              {selectedPayment && (
                <div className="mt-5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> Phone Number for {paymentMethods.find((p) => p.id === selectedPayment)?.name}
                  </label>
                  <input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                    placeholder="+252 XX XXX XXXX"
                  />
                </div>
              )}
              <div className="mt-6 flex gap-3">
                <button onClick={() => setStep("shipping")} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Back
                </button>
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!selectedPayment || !phoneNumber}
                  className="rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Review Order
                </button>
              </div>
            </motion.div>
          )}

          {/* Confirm */}
          {step === "confirm" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-heading text-lg font-bold">Confirm Your Order</h3>
              <div className="mt-4 rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">Payment: {paymentMethods.find((p) => p.id === selectedPayment)?.name}</p>
                <p className="text-sm text-muted-foreground">Phone: {phoneNumber}</p>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between text-sm">
                    <span>{item.product.name} × {item.quantity}</span>
                    <span className="font-semibold">${(item.product.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={() => setStep("payment")} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Back
                </button>
                <button
                  onClick={() => { setOrderPlaced(true); clearCart(); }}
                  className="flex-1 rounded-lg bg-secondary px-8 py-2.5 text-sm font-bold text-secondary-foreground transition-opacity hover:opacity-90"
                >
                  Place Order — ${total.toFixed(2)}
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Order Summary */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-heading text-sm font-bold">Order Summary</h3>
          <div className="mt-3 space-y-2 text-sm">
            {items.map((item) => (
              <div key={item.product.id} className="flex justify-between">
                <span className="text-muted-foreground line-clamp-1">{item.product.name} ×{item.quantity}</span>
                <span>${(item.product.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${totalPrice.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>${shipping.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>${tax.toFixed(2)}</span></div>
            </div>
            <div className="border-t border-border pt-2 text-base font-bold">
              <div className="flex justify-between"><span>Total</span><span>${total.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
