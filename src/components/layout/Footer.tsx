import { Link } from "react-router-dom";
import { MapPin, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCategories, useStoreSettings } from "@/hooks/store/useCatalog";
import { formatSomaliPhone, normalizeSomaliPhone } from "@/lib/wallet";
import PaymentMethods from "@/components/store/PaymentMethods";
import StoreLogo from "@/components/store/StoreLogo";

const Footer = () => {
  const { t, pick } = useI18n();
  const { data: settings } = useStoreSettings();
  const { data: categories } = useCategories();
  const storeName = settings?.store_name || "Suuq";
  const phone = settings?.phone ?? null;
  const telHref = phone ? `tel:+${normalizeSomaliPhone(phone) ?? phone.replace(/[^\d]/g, "")}` : null;

  const shopLinks: [string, string][] = [
    [t("store.footer.allProducts"), "/products"],
    ...(categories ?? []).slice(0, 4).map((c) => [pick(c.name, c.name_so), `/products?category=${c.slug}`] as [string, string]),
    [t("store.nav.deals"), "/products?sale=true"],
  ];
  const accountLinks: [string, string][] = [
    [t("store.nav.myAccount"), "/account"],
    [t("store.nav.orders"), "/account?tab=orders"],
    [t("store.nav.wishlist"), "/wishlist"],
    [t("store.cart.title"), "/cart"],
  ];

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <StoreLogo name={storeName} />
            <p className="mt-3 text-sm text-muted-foreground">{t("store.footer.tagline")}</p>
            <PaymentMethods variant="chips" className="mt-4" />
          </div>

          <nav aria-label={t("store.footer.shop")}>
            <h2 className="mb-3 font-heading text-sm font-semibold">{t("store.footer.shop")}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {shopLinks.map(([label, href]) => (
                <li key={href}><Link to={href} className="transition-colors hover:text-foreground">{label}</Link></li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("store.footer.account")}>
            <h2 className="mb-3 font-heading text-sm font-semibold">{t("store.footer.account")}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {accountLinks.map(([label, href]) => (
                <li key={href}><Link to={href} className="transition-colors hover:text-foreground">{label}</Link></li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mb-3 font-heading text-sm font-semibold">{t("store.footer.contact")}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {settings?.address && (
                <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span className="whitespace-pre-line">{settings.address}</span></li>
              )}
              {phone && telHref && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden />
                  <a href={telHref} className="transition-colors hover:text-foreground">{formatSomaliPhone(phone) || phone}</a>
                </li>
              )}
              {!settings?.address && !phone && <li>{t("store.footer.contactFallback")}</li>}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeName}. {t("store.footer.rights")}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
