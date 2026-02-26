export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  subcategory?: string;
  images: string[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  variants?: { type: string; options: string[] }[];
  sku: string;
  isFlashSale?: boolean;
  flashSaleEnds?: string;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  productCount: number;
  icon: string;
}

export const categories: Category[] = [
  { id: "1", name: "Electronics", slug: "electronics", description: "Latest gadgets & devices", productCount: 156, icon: "📱" },
  { id: "2", name: "Fashion", slug: "fashion", description: "Trending styles & apparel", productCount: 243, icon: "👗" },
  { id: "3", name: "Home & Living", slug: "home-living", description: "Furniture & home décor", productCount: 89, icon: "🏠" },
  { id: "4", name: "Beauty", slug: "beauty", description: "Skincare & cosmetics", productCount: 178, icon: "✨" },
  { id: "5", name: "Sports", slug: "sports", description: "Athletic gear & equipment", productCount: 67, icon: "⚽" },
  { id: "6", name: "Books", slug: "books", description: "Knowledge & entertainment", productCount: 312, icon: "📚" },
];

export const products: Product[] = [
  {
    id: "1", name: "Premium Wireless Headphones", slug: "premium-wireless-headphones",
    description: "Experience crystal-clear sound with our premium noise-cancelling wireless headphones. Perfect for music lovers and professionals.",
    price: 89.99, originalPrice: 129.99, category: "Electronics", images: [],
    rating: 4.8, reviewCount: 234, inStock: true,
    variants: [{ type: "Color", options: ["Navy", "Black", "White"] }],
    sku: "EL-WH-001", isFlashSale: true, flashSaleEnds: "2026-03-15",
    tags: ["bestseller", "wireless", "audio"],
  },
  {
    id: "2", name: "Elegant Silk Dress", slug: "elegant-silk-dress",
    description: "Luxurious silk dress with a flattering silhouette. Perfect for special occasions and evening events.",
    price: 149.99, originalPrice: 199.99, category: "Fashion", images: [],
    rating: 4.6, reviewCount: 87, inStock: true,
    variants: [{ type: "Size", options: ["S", "M", "L", "XL"] }, { type: "Color", options: ["Navy", "Burgundy", "Black"] }],
    sku: "FA-SD-002", tags: ["premium", "silk", "evening"],
  },
  {
    id: "3", name: "Smart Watch Pro", slug: "smart-watch-pro",
    description: "Track your fitness, manage notifications, and stay connected with this advanced smartwatch.",
    price: 199.99, originalPrice: 249.99, category: "Electronics", images: [],
    rating: 4.7, reviewCount: 456, inStock: true,
    variants: [{ type: "Size", options: ["40mm", "44mm"] }],
    sku: "EL-SW-003", isFlashSale: true, flashSaleEnds: "2026-03-10",
    tags: ["smart", "fitness", "trending"],
  },
  {
    id: "4", name: "Organic Skincare Set", slug: "organic-skincare-set",
    description: "Complete skincare routine with organic, cruelty-free products. Includes cleanser, toner, serum, and moisturizer.",
    price: 79.99, category: "Beauty", images: [],
    rating: 4.9, reviewCount: 312, inStock: true,
    sku: "BE-OS-004", tags: ["organic", "skincare", "bestseller"],
  },
  {
    id: "5", name: "Modern Coffee Table", slug: "modern-coffee-table",
    description: "Minimalist design coffee table crafted from solid oak with steel accents.",
    price: 299.99, originalPrice: 399.99, category: "Home & Living", images: [],
    rating: 4.5, reviewCount: 45, inStock: true,
    variants: [{ type: "Wood", options: ["Oak", "Walnut", "Maple"] }],
    sku: "HL-CT-005", tags: ["furniture", "modern", "wood"],
  },
  {
    id: "6", name: "Running Shoes Elite", slug: "running-shoes-elite",
    description: "Engineered for performance with responsive cushioning and breathable mesh upper.",
    price: 129.99, category: "Sports", images: [],
    rating: 4.7, reviewCount: 189, inStock: true,
    variants: [{ type: "Size", options: ["7", "8", "9", "10", "11", "12"] }, { type: "Color", options: ["Navy/Orange", "Black/White", "Grey/Green"] }],
    sku: "SP-RS-006", tags: ["running", "performance", "new"],
  },
  {
    id: "7", name: "Leather Messenger Bag", slug: "leather-messenger-bag",
    description: "Handcrafted genuine leather messenger bag with padded laptop compartment.",
    price: 189.99, originalPrice: 239.99, category: "Fashion", images: [],
    rating: 4.8, reviewCount: 156, inStock: true,
    variants: [{ type: "Color", options: ["Brown", "Black", "Tan"] }],
    sku: "FA-MB-007", tags: ["leather", "premium", "laptop"],
  },
  {
    id: "8", name: "Wireless Speaker System", slug: "wireless-speaker-system",
    description: "Room-filling sound with deep bass. Multi-room compatible with voice assistant integration.",
    price: 159.99, category: "Electronics", images: [],
    rating: 4.6, reviewCount: 98, inStock: true,
    sku: "EL-WS-008", tags: ["audio", "wireless", "smart-home"],
  },
];

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariants?: Record<string, string>;
}

export const paymentMethods = [
  { id: "evc", name: "EVC PLUS", description: "Hormuud Telecom mobile money", icon: "📱", color: "hsl(var(--umber))" },
  { id: "zaad", name: "ZAAD", description: "Telesom mobile money", icon: "💳", color: "hsl(var(--navy))" },
  { id: "sahal", name: "SAHAL", description: "Golis Telecom mobile money", icon: "📲", color: "hsl(var(--success))" },
  { id: "jeep", name: "JEEP", description: "Somtel mobile money", icon: "🏦", color: "hsl(var(--accent))" },
];
