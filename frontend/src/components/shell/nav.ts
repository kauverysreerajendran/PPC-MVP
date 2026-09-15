import {
  LayoutGrid,
  Database,
  Package,
  MapPin,
  ClipboardCheck,
  Bell,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
      { label: "SAP Outward", href: "/sap-outward", icon: Database },
      { label: "SAP Inward", href: "/sap-inward", icon: Package },
      { label: "Rack Locator", href: "/rack-locator", icon: MapPin },
      { label: "Reports", href: "/reports", icon: ClipboardCheck },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
