import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] disabled:opacity-55";

export function FormField({
  label,
  required,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  required,
  error,
  hint,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FormField label={label} required={required} error={error} hint={hint} htmlFor={fieldId}>
      <select id={fieldId} className={cn(control, "h-9 py-0", className)} {...props}>
        {children}
      </select>
    </FormField>
  );
}

export function Textarea({
  label,
  required,
  error,
  hint,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FormField label={label} required={required} error={error} hint={hint} htmlFor={fieldId}>
      <textarea id={fieldId} rows={4} className={cn(control, "resize-y", className)} {...props} />
    </FormField>
  );
}
