import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-text-muted">
      {items.map((c, i) => {
        const last = i === items.length - 1;
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
              <span className={last ? "text-text-secondary" : undefined}>{c.label}</span>
            )}
            {!last ? <ChevronRight className="size-3" /> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {breadcrumbs ? <Breadcrumb items={breadcrumbs} /> : null}
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
