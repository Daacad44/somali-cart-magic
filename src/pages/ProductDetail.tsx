import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { Star, ShoppingCart, Heart, Truck, Shield, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { products } from "@/lib/mock-data";
import { useCart } from "@/lib/cart-context";
import { productImages } from "@/lib/product-images";

const ProductDetail = () => {
  const { slug } = useParams();
  const product = products.find((p) => p.slug === slug);
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  if (!product) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold">Product not found</p>
          <Link to="/products" className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to shop
          </Link>
        </div>
      </div>
    );
  }

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <Link to="/products" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to shop
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Image */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
          <img
            src={productImages[product.id]}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </motion.div>

        {/* Details */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
          <p className="text-sm font-medium text-accent">{product.category}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold md:text-4xl">{product.name}</h1>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < Math.floor(product.rating) ? "fill-warning text-warning" : "text-border"}`} />
              ))}
            </div>
            <span className="text-sm font-medium">{product.rating}</span>
            <span className="text-sm text-muted-foreground">({product.reviewCount} reviews)</span>
          </div>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-bold">${product.price.toFixed(2)}</span>
            {product.originalPrice && (
              <>
                <span className="text-lg text-muted-foreground line-through">${product.originalPrice.toFixed(2)}</span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">Save {discount}%</span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

          {/* Variants */}
          {product.variants?.map((v) => (
            <div key={v.type} className="mt-5">
              <p className="text-sm font-semibold">{v.type}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {v.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelectedVariants((prev) => ({ ...prev, [v.type]: opt }))}
                    className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      selectedVariants[v.type] === opt ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quantity + Add to Cart */}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-border">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">−</button>
              <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">+</button>
            </div>
            <button
              onClick={() => addToCart(product, quantity, selectedVariants)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ShoppingCart className="h-4 w-4" /> Add to Cart
            </button>
            <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive">
              <Heart className="h-5 w-5" />
            </button>
          </div>

          {/* Trust signals */}
          <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-accent" /> Free delivery in Mogadishu</div>
            <div className="flex items-center gap-2 text-sm"><Shield className="h-4 w-4 text-accent" /> Secure mobile money payment</div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">SKU: {product.sku}</p>
        </motion.div>
      </div>
    </div>
  );
};

export default ProductDetail;
