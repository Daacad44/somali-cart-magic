import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Star } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@/lib/mock-data";
import { useCart } from "@/lib/cart-context";
import { productImages } from "@/lib/product-images";

interface ProductCardProps {
  product: Product;
  index?: number;
}

const ProductCard = ({ product, index = 0 }: ProductCardProps) => {
  const { addToCart } = useCart();
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-300 hover:shadow-card-hover"
    >
      {/* Image */}
      <Link to={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden bg-muted">
        <img
          src={productImages[product.id]}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
            -{discount}%
          </span>
        )}
        {product.isFlashSale && (
          <span className="absolute right-3 top-3 rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
            Flash Sale
          </span>
        )}
        {/* Hover actions */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-full gap-2 p-3 transition-transform duration-300 group-hover:translate-y-0">
          <button
            onClick={(e) => { e.preventDefault(); addToCart(product); }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
          </button>
          <button
            onClick={(e) => e.preventDefault()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-muted-foreground transition-colors hover:text-destructive"
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>
      </Link>

      {/* Details */}
      <div className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{product.category}</p>
        <Link to={`/product/${product.slug}`}>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-foreground transition-colors hover:text-accent">
            {product.name}
          </h3>
        </Link>
        <div className="mt-1.5 flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
          <span className="text-xs font-medium text-foreground">{product.rating}</span>
          <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">${product.price.toFixed(2)}</span>
          {product.originalPrice && (
            <span className="text-sm text-muted-foreground line-through">${product.originalPrice.toFixed(2)}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProductCard;
