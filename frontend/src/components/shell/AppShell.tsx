"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, ScanLine, Search, X } from "lucide-react";
import logo from "@/assets/images/logo.png";
import type { User } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useSearchStore } from "@/stores/search";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { NotificationMenu } from "./NotificationMenu";
import { LiveIndicator } from "./LiveIndicator";
import { ServiceOutageBanner } from "./ServiceOutageBanner";

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  // The menu panel always starts minimized; the user expands it when needed.
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Header search is page-scoped: a query typed on one screen must not keep
  // filtering the next one.
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clearQuery = useSearchStore((s) => s.clear);
  useEffect(() => clearQuery(), [pathname, clearQuery]);

  const toggle = () => setCollapsed((c) => !c);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* ---------- top header ---------- */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="ds-focus-ring flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-2 lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 lg:w-[188px]">
          <Image
            src={logo}
            alt="TITAN"
            width={24}
            height={24}
            priority
            className="size-6 rounded-[var(--radius-xs)] object-contain"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            TITAN <span className="font-normal text-text-muted">PPC</span>
          </span>
        </Link>

        <div className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") clearQuery();
            }}
            aria-label="Search"
            placeholder="Search DC, PO, material, vendor, batch…"
            className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-8 text-sm placeholder:text-text-muted outline-none focus:border-primary focus:bg-surface focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Clear search"
              className="ds-focus-ring absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/scan"
            className={cn(
              "ds-focus-ring inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors",
              pathname.startsWith("/scan")
                ? "bg-primary text-[var(--color-primary-fg)]"
                : "bg-primary-light text-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)]",
            )}
          >
            <ScanLine className="size-4" />
            <span className="hidden sm:inline">Scan</span>
          </Link>
          <LiveIndicator />
          <div className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
          <NotificationMenu />
          <UserMenu user={user} />
        </div>
      </header>
      <ServiceOutageBanner />

      {/* ---------- body ---------- */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggle}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
