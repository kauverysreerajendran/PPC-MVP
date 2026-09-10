"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  leadingIcon?: ReactNode;
};

const fieldClass =
  "h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted transition-[border-color,box-shadow] duration-150 outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] disabled:opacity-55 aria-[invalid=true]:border-[var(--color-danger)]";

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, leadingIcon, id, type = "text", className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && reveal ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
      </label>
      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted [&>svg]:size-4">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(fieldClass, leadingIcon && "pl-9", isPassword && "pr-10", className)}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide" : "Show"}
            title={reveal ? "Hide password" : "Show password"}
            className="ds-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-text-muted">{hint}</span>
      ) : null}
    </div>
  );
});
