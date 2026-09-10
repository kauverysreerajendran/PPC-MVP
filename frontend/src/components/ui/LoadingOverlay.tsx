import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function LoadingOverlay({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[inherit] bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] backdrop-blur-[1px] text-xs text-text-secondary",
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-text-secondary">
      <Loader2 className="size-6 animate-spin text-primary" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
