import {
  BookOpen, Dumbbell, Gem, Laptop, Package, Shirt, ShoppingBasket, Smartphone, Sofa, Sparkles, Baby, Car, Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BY_KEY: Record<string, LucideIcon> = {
  electronics: Smartphone,
  phones: Smartphone,
  computers: Laptop,
  fashion: Shirt,
  clothing: Shirt,
  "home-living": Sofa,
  home: Sofa,
  furniture: Sofa,
  beauty: Sparkles,
  sports: Dumbbell,
  books: BookOpen,
  jewelry: Gem,
  grocery: ShoppingBasket,
  food: Utensils,
  baby: Baby,
  kids: Baby,
  automotive: Car,
};

/** Lucide icon for a category: by `icon` name, then slug, else the stored emoji, else a box. */
const CategoryIcon = ({ slug, icon, className }: { slug: string; icon?: string | null; className?: string }) => {
  const Icon = (icon && BY_KEY[icon.toLowerCase()]) || BY_KEY[slug];
  if (Icon) return <Icon className={cn("h-6 w-6", className)} aria-hidden />;
  if (icon && icon.length <= 4) return <span className={cn("text-2xl leading-none", className)} aria-hidden>{icon}</span>;
  return <Package className={cn("h-6 w-6", className)} aria-hidden />;
};

export default CategoryIcon;
