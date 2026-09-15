import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type WaveCrumb = { label: string; href?: string };

/**
 * Decorative page header — a slow-drifting teal wave field with the
 * breadcrumb, title and optional actions. Shared by the SAP Outward / SAP
 * Inward grids and the Rack Locator so every "operations" screen opens the
 * same way.
 *
 * Each wave <path> tiles every 400px and is drawn far wider than the viewBox,
 * so the CSS `ds-wave` drift (translateX by a 400px multiple) loops seamlessly.
 */
export function WaveBanner({
  breadcrumb,
  title,
  subtitle,
  actions,
}: {
  breadcrumb?: WaveCrumb[];
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative mb-4 min-h-[92px] w-full overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-r from-surface via-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-surface))] to-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))]">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1200 150"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          className="ds-wave ds-wave-2"
          d="M0 92 C 100 62, 300 122, 400 92 C 500 62, 700 122, 800 92 C 900 62, 1100 122, 1200 92 C 1300 62, 1500 122, 1600 92 C 1700 62, 1900 122, 2000 92 C 2100 62, 2300 122, 2400 92 L 2400 150 L 0 150 Z"
          fill="color-mix(in srgb, var(--color-primary) 12%, transparent)"
        />
        <path
          className="ds-wave ds-wave-1"
          d="M0 110 C 120 84, 280 138, 400 110 C 520 82, 680 138, 800 110 C 920 84, 1080 138, 1200 110 C 1320 82, 1480 138, 1600 110 C 1720 84, 1880 138, 2000 110 C 2120 82, 2280 138, 2400 110 L 2400 150 L 0 150 Z"
          fill="color-mix(in srgb, var(--color-primary) 18%, transparent)"
        />
        <path
          className="ds-wave ds-wave-3"
          d="M0 72 C 100 52, 300 100, 400 72 C 500 44, 700 100, 800 72 C 900 52, 1100 100, 1200 72 C 1300 44, 1500 100, 1600 72 C 1700 52, 1900 100, 2000 72 C 2100 44, 2300 100, 2400 72"
          fill="none"
          stroke="color-mix(in srgb, var(--color-primary) 15%, transparent)"
          strokeWidth={1.15}
        />
      </svg>

      <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
        <div className="min-w-0 space-y-1">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs">
              {breadcrumb.map((c, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <Fragment key={`${c.label}-${i}`}>
                    {c.href && !last ? (
                      <Link
                        href={c.href}
                        className="font-medium text-primary hover:text-[var(--color-primary-hover)]"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span className={last ? "text-text-secondary" : "text-text-muted"}>
                        {c.label}
                      </span>
                    )}
                    {!last ? (
                      <ChevronRight className="size-3 text-text-muted" aria-hidden />
                    ) : null}
                  </Fragment>
                );
              })}
            </nav>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-text-secondary">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
