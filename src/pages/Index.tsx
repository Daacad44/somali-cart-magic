import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Truck, Shield, Headphones, Star } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { products, categories } from "@/lib/mock-data";
import heroBanner from "@/assets/hero-banner.jpg";

const Index = () => {
  const featuredProducts = products.slice(0, 4);
  const flashSaleProducts = products.filter((p) => p.isFlashSale);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="Premium shopping experience" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
        </div>
        <div className="container relative mx-auto px-4 py-24 lg:px-8 lg:py-36">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-xl">
            <span className="inline-block rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur-sm">
              Somalia's #1 Online Store
            </span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-tight text-primary-foreground md:text-5xl lg:text-6xl">
              Premium Shopping, <span className="text-gradient-umber">Trusted Payments</span>
            </h1>
            <p className="mt-4 text-base text-primary-foreground/80 md:text-lg">
              Discover quality products with seamless mobile money payments. EVC Plus, ZAAD, SAHAL & JEEP accepted.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/products" className="inline-flex items-center gap-2 rounded-lg bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-opacity hover:opacity-90">
                Shop Now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/products?sale=true" className="inline-flex items-center gap-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-6 py-3 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/20">
                View Deals
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="border-b border-border bg-card">
        <div className="container mx-auto grid grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4 lg:px-8">
          {[
            { icon: Truck, label: "Fast Delivery", sub: "Across Somalia" },
            { icon: Shield, label: "Secure Payments", sub: "Mobile Money" },
            { icon: Headphones, label: "24/7 Support", sub: "WhatsApp Ready" },
            { icon: Star, label: "Trusted Quality", sub: "1000+ Reviews" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="container mx-auto px-4 py-14 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold md:text-3xl">Shop by Category</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find what you need, fast</p>
          </div>
          <Link to="/products" className="hidden text-sm font-medium text-accent transition-colors hover:text-foreground md:inline-flex md:items-center md:gap-1">
            View All <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat, i) => (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link
                to={`/products?category=${cat.slug}`}
                className="group flex flex-col items-center rounded-xl border border-border bg-card p-5 text-center transition-all hover:border-accent/30 hover:shadow-premium"
              >
                <span className="text-3xl">{cat.icon}</span>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{cat.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{cat.productCount} items</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Flash Sales */}
      {flashSaleProducts.length > 0 && (
        <section className="bg-gradient-navy py-14">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex items-end justify-between">
              <div>
                <span className="inline-block rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">🔥 Flash Sale</span>
                <h2 className="mt-3 font-heading text-2xl font-bold text-primary-foreground md:text-3xl">Limited Time Offers</h2>
              </div>
              <Link to="/products?sale=true" className="text-sm font-medium text-primary-foreground/70 transition-colors hover:text-primary-foreground">
                See All →
              </Link>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {flashSaleProducts.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="container mx-auto px-4 py-14 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold md:text-3xl">Featured Products</h2>
            <p className="mt-1 text-sm text-muted-foreground">Curated picks for you</p>
          </div>
          <Link to="/products" className="text-sm font-medium text-accent transition-colors hover:text-foreground">View All →</Link>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>

      {/* Payment Methods */}
      <section className="border-t border-border bg-muted/50 py-14">
        <div className="container mx-auto px-4 text-center lg:px-8">
          <h2 className="font-heading text-2xl font-bold md:text-3xl">Trusted Payment Methods</h2>
          <p className="mt-2 text-sm text-muted-foreground">Pay with your preferred Somali mobile money service</p>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { name: "EVC PLUS", desc: "Hormuud Telecom", color: "bg-secondary" },
              { name: "ZAAD", desc: "Telesom", color: "bg-primary" },
              { name: "SAHAL", desc: "Golis Telecom", color: "bg-success" },
              { name: "JEEP", desc: "Somtel", color: "bg-accent" },
            ].map((pm) => (
              <div key={pm.name} className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-premium">
                <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${pm.color}`}>
                  <span className="text-lg font-bold text-primary-foreground">💳</span>
                </div>
                <h3 className="mt-3 font-heading text-sm font-bold">{pm.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{pm.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
