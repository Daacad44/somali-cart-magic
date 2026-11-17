import type { Order } from "@/integrations/supabase/types";
import { formatSomaliPhone } from "@/lib/wallet";

const ShippingAddress = ({ order }: { order: Order }) => (
  <address className="text-sm not-italic text-muted-foreground">
    {order.shipping_name && <span className="font-semibold text-foreground">{order.shipping_name}</span>}
    {order.shipping_phone && <> · {formatSomaliPhone(order.shipping_phone)}</>}
    <br />
    {[order.shipping_address, order.shipping_district, order.shipping_city].filter(Boolean).join(", ") || "—"}
  </address>
);

export default ShippingAddress;
