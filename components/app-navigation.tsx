"use client";
import Link from "next/link";
import {
  Home,
  HeartPulse,
  BookOpen,
  ShoppingBag,
  UserRound,
} from "lucide-react";
export const destinations = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "care", label: "Care", href: "/care", icon: HeartPulse },
  { key: "learn", label: "Learn", href: "/learn", icon: BookOpen },
  { key: "shop", label: "Shop", href: "/shop", icon: ShoppingBag },
  { key: "account", label: "Account", href: "/account", icon: UserRound },
] as const;
export type Destination = (typeof destinations)[number]["key"];
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="app-brand" href="/" aria-label="INCYS home">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="17" fill="currentColor" />
        <path
          d="M24 35C10 35 10 22 10 22c8-1 14 4 14 13Zm0 0c14 0 14-13 14-13-8-1-14 4-14 13Z"
          fill="#bcdfd5"
        />
        <path d="M24 31s-13-10 0-20c13 10 0 20 0 20Z" fill="#fff" />
      </svg>
      {!compact && (
        <span>
          incys<span>care · learn · grow</span>
        </span>
      )}
    </Link>
  );
}
export function BottomNav({
  active,
  links,
}: {
  active: Destination;
  links?: Partial<Record<Destination, string>>;
}) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {destinations.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={links?.[key] || href}
          aria-current={active === key ? "page" : undefined}
          className={active === key ? "selected" : ""}
        >
          <span>
            <Icon size={23} strokeWidth={active === key ? 2.3 : 1.7} />
          </span>
          <small>{label}</small>
        </Link>
      ))}
    </nav>
  );
}
