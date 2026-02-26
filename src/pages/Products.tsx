import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, Grid3X3, List } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { products, categories } from "@/lib/mock-data";

const sortOptions = [
  { value: "latest", label: "Latest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "popular", label: "Most Popular" },
  { value: "rating", label: "Highest Rated" },
];

const Products = () => {
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category");
  const [sort, setSort] = useState("latest");
  const [selectedCategory, setSelectedCategory] = useState(categoryFilter || "all");

  const filtered = useMemo(() => {
    let result = [...products];
    if (selectedCategory !== "all") {
      result = result.filter((p) => p.category.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-") === selectedCategory);
    }
    switch (sort) {
      case "price-asc": result.sort((a, b) => a.price - b.price); break;
      case "price-desc": result.sort((a, b) => b.price - a.price); break;
      case "popular": result.sort((a, b) => b.reviewCount - a.reviewCount); break;
      case "rating": result.sort((a, b) => b.rating - a.rating); break;
    }
    return result;
  }, [selectedCategory, sort]);

  return (
    <div className="container mx-auto px-4 py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Shop All Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">{filtered.length} products found</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Filters */}
        <aside className="w-full shrink-0 lg:w-60">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </h3>
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Category</p>
              <div className="mt-2 flex flex-col gap-1">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${selectedCategory === "all" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  All Products
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${selectedCategory === cat.slug ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Products Grid */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <p className="text-lg font-semibold">No products found</p>
              <p className="mt-1 text-sm">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;
