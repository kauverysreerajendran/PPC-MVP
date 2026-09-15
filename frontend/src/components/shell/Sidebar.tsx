"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_SECTIONS } from "./nav";

/**
 * Compact shell sidebar: 196 px open, 60 px collapsed (desktop), full height
 * under the header. `collapsed` is a desktop setting, so every collapsed-only
 * style is behind `lg:` and the mobile drawer always shows labels.
 *
 * Text colour is set on spans, not on the <Link>: globals.css has an unlayered
 * `a { color: inherit }` that beats Tailwind's layered utilities.
 */
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
  const deskHidden = collapsed && "lg:hidden";

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
          "fixed inset-y-0 left-0 z-40 flex w-[196px] flex-col overflow-hidden border-r border-sidebar-border bg-[linear-gradient(180deg,var(--color-sidebar-from),var(--color-sidebar-to))] pt-14 transition-[width,transform] duration-200 lg:static lg:translate-x-0 lg:pt-0",
          collapsed && "lg:w-[60px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* subtle teal wave, top-right corner */}
        <svg
          aria-hidden
          viewBox="0 0 120 64"
          className="pointer-events-none absolute right-0 top-14 w-24 text-primary lg:top-0"
        >
          <path d="M30 0 C 50 30, 85 40, 120 40 L 120 0 Z" fill="color-mix(in srgb, currentColor 12%, transparent)" />
          <path d="M70 0 C 85 18, 100 24, 120 24 L 120 0 Z" fill="color-mix(in srgb, currentColor 22%, transparent)" />
        </svg>

        <nav className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i}>
              {section.title ? (
                <p
                  className={cn(
                    "px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted",
                    deskHidden,
                  )}
                >
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href} className="relative">
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                        />
                      ) : null}
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "ds-focus-ring group relative flex h-10 items-center gap-2.5 rounded-[var(--radius-lg)] px-1.5 text-sm transition-[background-color] duration-150",
                          collapsed && "lg:justify-center lg:px-0",
                          active
                            ? "bg-[linear-gradient(135deg,var(--color-sidebar-active-from),var(--color-sidebar-active-to))] shadow-[var(--shadow-sm)]"
                            : "hover:bg-[color-mix(in_srgb,var(--color-primary)_7%,transparent)]",
                        )}
                      >
                        {/* Idle icons sit in grey and take their brand colour on
                            hover or keyboard focus — focus as well as hover, so
                            the cue is not lost to anyone tabbing through. The
                            page you are on keeps its colour either way. */}
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-[box-shadow,color] duration-150",
                            active
                              ? "border border-white/70 text-white"
                              : "bg-sidebar-tile text-text-muted shadow-[var(--shadow-sidebar-tile)] group-hover:text-primary group-hover:shadow-[var(--shadow-sidebar-tile-hover)] group-focus-visible:text-primary group-focus-visible:shadow-[var(--shadow-sidebar-tile-hover)]",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span
                          className={cn(
                            "truncate transition-colors duration-150",
                            active
                              ? "font-medium text-white"
                              : "text-text-secondary group-hover:text-primary group-focus-visible:text-primary",
                            deskHidden,
                          )}
                        >
                          {item.label}
                        </span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                              active
                                ? "bg-white/25 text-white"
                                : "bg-primary text-[var(--color-primary-fg)]",
                              collapsed && "lg:absolute lg:right-1 lg:top-0.5 lg:ml-0",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                        {active ? (
                          <ChevronRight
                            className={cn(
                              "size-3.5 shrink-0 text-white/90",
                              !item.badge && "ml-auto",
                              deskHidden,
                            )}
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* promo card with drifting waves — expanded only */}
        <div className={cn("relative shrink-0 px-3 pb-3 pt-2", deskHidden)}>
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

        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ds-focus-ring relative hidden h-10 items-center gap-2.5 border-t border-sidebar-border px-4 text-xs text-text-muted hover:text-text lg:flex"
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
