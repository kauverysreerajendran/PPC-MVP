"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Step 1 blocking states (docs/08 §2.3 — say what happened and what to do).
 * Nothing else renders on the page while one of these is showing.
 */
export function BlockedMessage({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { label: string; href: string } | undefined;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-danger)_30%,var(--color-border))] bg-[var(--color-danger-bg)] px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface text-[var(--color-danger)] shadow-[var(--shadow-sm)]">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <p className="max-w-sm text-sm text-text-secondary">{description}</p>
      {cta ? (
        <Button size="sm" onClick={() => router.push(cta.href)}>
          {cta.label}
        </Button>
      ) : null}
    </div>
  );
}
