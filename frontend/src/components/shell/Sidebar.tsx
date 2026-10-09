"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import panelArt from "@/assets/images/8-panel.png";
import { cn } from "@/lib/cn";
import { NAV_SECTIONS } from "./nav";

/**
 * Compact shell sidebar: 172 px open, 60 px collapsed (desktop), full height
 * under the header. A deep-teal panel over the plant-lit corridor art
 * (`8-panel.png`, cropped from the left of `8.png`) with a dark wash for
 * contrast; items are white on the panel and the page you are on sits in a
 * frosted teal glass pill. `collapsed` is a desktop setting, so every
 * collapsed-only style is behind `lg:` and the mobile drawer always shows
 * labels.
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
          "fixed inset-y-0 left-0 z-40 flex w-[172px] flex-col overflow-hidden border-r border-shell-line bg-shell-from pt-14 transition-[width,transform] duration-200 lg:static lg:translate-x-0 lg:pt-0",
          collapsed && "lg:w-[60px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* the panel art fills the open panel edge to edge (no side strips),
            anchored to the bottom so the plants stay in view; it is always laid
            out at the open width, so collapsing just narrows the window onto
            it rather than rescaling it */}
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-[172px]" aria-hidden>
          <Image
            src={panelArt}
            alt=""
            fill
            priority
            sizes="400px"
            className="select-none object-cover object-bottom"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-shell-overlay" aria-hidden />
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-shell-line" aria-hidden />

        <nav className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i}>
              {section.title ? (
                <p
                  className={cn(
                    "px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-shell-muted",
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
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "ds-focus-ring group relative flex h-11 items-center gap-3.5 rounded-[10px] border px-3 text-sm transition-[background-color,border-color,box-shadow] duration-150",
                          collapsed && "lg:mx-auto lg:size-11 lg:justify-center lg:px-0",
                          active
                            ? "border-shell-glass-border bg-[linear-gradient(100deg,var(--color-shell-glass-strong),var(--color-shell-glass))] shadow-[var(--shadow-shell-glow)] backdrop-blur-sm"
                            : "border-transparent hover:bg-white/10",
                        )}
                      >
                        {/* thin line icons; on the page you are on the icon gets a
                            bolder stroke, or goes solid where that reads well
                            (inner details cut back out in the panel colour) */}
                        <Icon
                          strokeWidth={active ? 2 : 1.6}
                          className={cn(
                            "size-5 shrink-0 transition-colors",
                            active ? "text-shell-fg" : "text-shell-icon group-hover:text-shell-fg",
                            active &&
                              item.solid &&
                              "fill-current [&_circle]:fill-shell-from [&_circle]:stroke-shell-from",
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "truncate transition-colors",
                            active
                              ? "font-bold text-shell-fg"
                              : "text-shell-text group-hover:text-shell-fg",
                            deskHidden,
                          )}
                        >
                          {item.label}
                        </span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white",
                              collapsed && "lg:absolute lg:-right-1 lg:-top-1 lg:ml-0",
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

        <div className={cn("relative hidden shrink-0 pb-4 pt-2 lg:flex", collapsed ? "justify-center" : "justify-start px-4")}>
          <button
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="ds-focus-ring grid size-9 place-items-center rounded-full border border-shell-field-border bg-shell-field text-shell-fg shadow-[var(--shadow-sm)] backdrop-blur-sm transition-colors hover:border-shell-glass-border hover:bg-shell-glass"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
