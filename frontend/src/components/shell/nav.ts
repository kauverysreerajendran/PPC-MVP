import {
  LayoutGrid,
  Database,
  Boxes,
  Grid3x3,
  ClipboardCheck,
  Settings,
  Bell,
  BarChart3,
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
      { label: "SAP Outward", href: "/sap-upload", icon: Database },
      { label: "Masters", href: "/master-data", icon: Boxes },
      { label: "Racks", href: "/racks", icon: Grid3x3 },
      { label: "Reports", href: "/reports", icon: ClipboardCheck },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
