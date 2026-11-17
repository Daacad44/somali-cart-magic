import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import EmptyState from "@/components/store/EmptyState";

const NotFound = () => {
  const { t } = useI18n();
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <div>
        <p className="text-center font-heading text-6xl font-bold text-muted-foreground/40">404</p>
        <EmptyState
          className="pt-4"
          icon={Compass}
          title={t("common.notFound")}
          description={t("store.notFound.desc")}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild><Link to="/">{t("common.goHome")}</Link></Button>
              <Button asChild variant="outline"><Link to="/products">{t("store.nav.shop")}</Link></Button>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default NotFound;
