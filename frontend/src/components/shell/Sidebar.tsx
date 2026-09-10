"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_SECTIONS } from "./nav";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-[rgb(9_18_23/0.4)] lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface pt-14 transition-[width,transform] duration-200 lg:static lg:translate-x-0 lg:pt-0",
          collapsed ? "w-[60px]" : "w-[196px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i}>
              {section.title && !collapsed ? (
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-primary-light font-medium text-primary"
                            : "text-text-secondary hover:bg-surface-2 hover:text-text",
                        )}
                      >
                        {active ? (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                        ) : null}
                        <Icon className="size-4 shrink-0" />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                        {item.badge ? (
                          <span
                            className={cn(
                              "ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white",
                              collapsed && "absolute right-1 top-1 ml-0",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {!collapsed ? (
          <div className="px-3 pb-3 pt-2">
            <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] to-[color-mix(in_srgb,var(--color-primary)_4%,var(--color-surface))] p-3.5">
              {/* soft decorative wave shapes */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full text-primary"
                viewBox="0 0 200 120"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  className="ds-wave-sm ds-wave-sm-2"
                  d="M0 60 C 25 42, 75 78, 100 60 C 125 42, 175 78, 200 60 C 225 42, 275 78, 300 60 C 325 42, 375 78, 400 60 L 400 130 L 0 130 Z"
                  fill="color-mix(in srgb, currentColor 10%, transparent)"
                />
                <path
                  className="ds-wave-sm ds-wave-sm-1"
                  d="M0 80 C 25 64, 75 98, 100 80 C 125 62, 175 98, 200 80 C 225 64, 275 98, 300 80 C 325 62, 375 98, 400 80 L 400 130 L 0 130 Z"
                  fill="color-mix(in srgb, currentColor 16%, transparent)"
                />
              </svg>
              <p className="relative text-[13px] font-semibold leading-snug text-text">
                Streamline
                <br />
                Operations
                <br />
                with SAP
              </p>
            </div>
          </div>
        ) : null}

        <button
          onClick={onToggle}
          className="ds-focus-ring hidden h-10 items-center gap-2.5 border-t border-border px-4 text-xs text-text-muted hover:text-text lg:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              Collapse
            </>
          )}
        </button>
      </aside>
    </>
  );
}
