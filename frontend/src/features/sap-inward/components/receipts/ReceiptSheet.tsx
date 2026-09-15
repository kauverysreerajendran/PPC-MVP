import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Rendered for any field the paper has but the system does not hold. */
export const BLANK = "—";

/** Empty ruled rows under the data line, so the table reads like the paper form. */
const RULED_ROWS = 4;

export type ReceiptColumn = { label: string; align?: "left" | "right" };

/** An A4-proportioned paper sheet; scrolls inside its own container. */
export function ReceiptSheet({
  title,
  letterhead,
  from,
  to,
  children,
}: {
  title: string;
  letterhead?: string | undefined;
  from: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <div className="max-h-[60vh] overflow-auto rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <article
        aria-label={title}
        className="mx-auto flex aspect-[210/297] w-[600px] flex-col gap-3 border border-border-strong bg-surface p-6 text-[11px] text-text shadow-[var(--shadow-sm)]"
      >
        <header className="border-b-2 border-primary pb-2 text-center">
          {letterhead ? (
            <div className="text-sm font-bold uppercase tracking-wide text-primary">{letterhead}</div>
          ) : null}
          <h3 className="text-[13px] font-semibold uppercase tracking-wide">{title}</h3>
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-text-secondary">
            {from}
            <ArrowRight className="size-3 text-primary" aria-label="to" />
            {to}
          </p>
        </header>
        {children}
      </article>
    </div>
  );
}

/** Label / value block at the top of the paper. */
export function ReceiptHeader({ fields }: { fields: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 border-l border-t border-border-strong">
      {fields.map(([label, value]) => (
        <div key={label} className="flex gap-2 border-b border-r border-border-strong px-2 py-1.5">
          <dt className="shrink-0 text-text-secondary">{label}:</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lines table: one data row per line, then empty ruled rows. */
export function ReceiptLines({
  columns,
  rows,
  footer,
}: {
  columns: ReceiptColumn[];
  rows: ReactNode[][];
  footer?: ReactNode[] | undefined;
}) {
  const cell = (align: ReceiptColumn["align"]) =>
    cn("border border-border-strong px-1.5 py-1", align === "right" ? "text-right tabular-nums" : "text-left");
  return (
    <table className="w-full border-collapse">
      <thead className="bg-[var(--color-primary-light)] text-[10px] uppercase text-primary">
        <tr>
          {columns.map((c) => (
            <th key={c.label} className={cn(cell(c.align), "font-semibold")}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          // Paper lines have no domain id; rows are fixed and never reordered.
          <tr key={`line-${i}`}>
            {r.map((v, j) => (
              <td key={columns[j]?.label ?? j} className={cell(columns[j]?.align)}>
                {v}
              </td>
            ))}
          </tr>
        ))}
        {Array.from({ length: RULED_ROWS }, (_, i) => (
          <tr key={`ruled-${i}`} aria-hidden>
            {columns.map((c) => (
              <td key={c.label} className={cn(cell(c.align), "h-6")} />
            ))}
          </tr>
        ))}
      </tbody>
      {footer ? (
        <tfoot className="font-semibold">
          <tr>
            {footer.map((v, j) => (
              <td key={columns[j]?.label ?? j} className={cell(columns[j]?.align)}>
                {v}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/** Blank signature boxes along the bottom of the paper. */
export function ReceiptSignatures({ labels }: { labels: string[] }) {
  return (
    <div
      className="mt-auto grid gap-3 pt-6"
      style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
    >
      {labels.map((label) => (
        <div key={label} className="flex flex-col">
          <div className="h-12 border-b border-border-strong" />
          <span className="pt-1 text-center text-[10px] text-text-secondary">{label}</span>
        </div>
      ))}
    </div>
  );
}
