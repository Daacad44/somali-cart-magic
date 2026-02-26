import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border bg-card">
    <div className="container mx-auto px-4 py-12 lg:px-8">
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div>
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-navy">
              <span className="text-sm font-bold text-primary-foreground">S</span>
            </div>
            <span className="font-heading text-xl font-bold">Suuq</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Somalia's premier online marketplace. Quality products, trusted payments, fast delivery.
          </p>
          <div className="mt-4 flex gap-2">
            {["EVC PLUS", "ZAAD", "SAHAL", "JEEP"].map((m) => (
              <span key={m} className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground">{m}</span>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="mb-3 font-heading text-sm font-semibold">Quick Links</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[["Shop All", "/products"], ["Electronics", "/products?category=electronics"], ["Fashion", "/products?category=fashion"], ["Deals", "/products?sale=true"]].map(([label, href]) => (
              <li key={label}><Link to={href} className="transition-colors hover:text-foreground">{label}</Link></li>
            ))}
          </ul>
        </div>

        {/* Customer Service */}
        <div>
          <h4 className="mb-3 font-heading text-sm font-semibold">Customer Service</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {["Contact Us", "Shipping Info", "Returns & Exchanges", "FAQ"].map((label) => (
              <li key={label}><a href="#" className="transition-colors hover:text-foreground">{label}</a></li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="mb-3 font-heading text-sm font-semibold">Contact</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Mogadishu, Somalia</li>
            <li>+252 61 XXX XXXX</li>
            <li>support@suuq.so</li>
          </ul>
        </div>
      </div>

      <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        © 2026 Suuq. All rights reserved.
      </div>
    </div>
  </footer>
);

export default Footer;
