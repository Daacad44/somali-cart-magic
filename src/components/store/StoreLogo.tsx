import { Link } from "react-router-dom";

const StoreLogo = ({ name }: { name: string }) => (
  <Link to="/" className="flex items-center gap-2" aria-label={name}>
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-navy">
      <span className="text-sm font-bold text-primary-foreground">{name.charAt(0).toUpperCase()}</span>
    </div>
    <span className="font-heading text-xl font-bold text-foreground">{name}</span>
  </Link>
);

export default StoreLogo;
