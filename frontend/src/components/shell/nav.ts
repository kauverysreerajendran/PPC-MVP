import { Bell, Box, ChartLine, House, LogOut, MapPin, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** the icon reads well filled — drawn solid while it is the current page */
  solid?: boolean;
  badge?: number;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: House },
      { label: "SAP Inward", href: "/sap-inward", icon: Box },
      { label: "Rack Locator", href: "/rack-locator", icon: MapPin, solid: true },
      { label: "SAP Outward", href: "/sap-outward", icon: LogOut },
      { label: "Reports", href: "/reports", icon: ChartLine },
      { label: "Notifications", href: "/notifications", icon: Bell, solid: true },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
