import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

const base =
  "ds-focus-ring inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-[var(--radius-sm)] border transition-colors duration-150 disabled:opacity-55 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-[var(--color-primary-fg)] border-transparent hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-surface text-text border-border-strong hover:bg-surface-2 hover:border-[var(--color-text-muted)]",
  ghost: "bg-transparent text-text-secondary border-transparent hover:bg-surface-2 hover:text-text",
  danger: "bg-[var(--color-danger)] text-white border-transparent hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
