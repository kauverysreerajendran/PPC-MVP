"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, User, type LucideIcon } from "lucide-react";
import { useLogin } from "../hooks";

const USERNAME_MAX = 100;
const PASSWORD_MAX = 128;

export function LoginForm() {
  const { submit, error, phase, pending } = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(false);

  return (
    <form
      className="relative flex w-full flex-col gap-4"
      aria-labelledby="login-title"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ email: username, password });
      }}
    >
      {phase === "redirecting" ? (
        <div className="ds-animate-fade absolute -inset-4 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface/85 text-xs font-medium text-text backdrop-blur-sm">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          Signing you in…
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-teal-900/60">Welcome to</p>
          <h1 id="login-title" className="text-xl font-bold tracking-tight text-teal-950">
            TITAN <span className="text-primary">PPC</span>
          </h1>
          <p className="mt-0.5 text-xs text-teal-900/60">Production Planning &amp; Control</p>
        </div>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-teal-900/50">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Secure Access
        </span>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Field
          id="login-username"
          label="Employee ID"
          Icon={User}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          maxLength={USERNAME_MAX}
        />
        <Field
          id="login-password"
          label="Password"
          Icon={Lock}
          type={reveal ? "text" : "password"}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          trailing={
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              aria-pressed={reveal}
              className="ds-focus-ring grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:text-text"
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          }
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="ds-focus-ring size-4 cursor-pointer rounded-sm border-border-strong text-primary accent-[var(--color-primary)]"
          />
          Remember this workstation
        </label>
        <button type="button" className="ds-focus-ring rounded font-medium text-primary hover:underline">
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="ds-focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-teal-900 via-teal-700 to-teal-500 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(4,60,70,0.55)] transition-[filter,box-shadow] hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        Sign In
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
      </button>
    </form>
  );
}

type FieldProps = {
  id: string;
  label: string;
  Icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  autoComplete: string;
  maxLength: number;
  trailing?: ReactNode;
};

function Field({ id, label, Icon, value, onChange, type = "text", autoComplete, maxLength, trailing }: FieldProps) {
  return (
    <div className="flex h-10 items-center gap-2.5 rounded-xl border border-transparent bg-white/85 pl-3.5 pr-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-[box-shadow,background-color] focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/25">
      <Icon className="size-4 shrink-0 text-teal-900/50" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required
        spellCheck={false}
        autoCapitalize="none"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted autofill:[-webkit-text-fill-color:var(--color-text)] autofill:[transition:background-color_9999s_ease-in-out_0s] autofill:[box-shadow:inset_0_0_0px_1000px_transparent]"
      />
      {trailing}
    </div>
  );
}
