"use client";

import { useState } from "react";
import { ArrowRight, Info, Loader2, Lock, User } from "lucide-react";
import { useLogin } from "../hooks";

const TEAL = "#0c7c88";

export function LoginForm() {
  const { submit, error, phase, pending } = useLogin();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(false);

  return (
    <div className="relative w-full max-w-[460px] overflow-hidden rounded-[20px] bg-[linear-gradient(150deg,rgba(255,255,255,0.7),rgba(212,247,250,0.5)_55%,rgba(255,255,255,0.62))] px-7 pb-7 pt-5 shadow-[0_28px_80px_-24px_rgba(12,40,46,0.5)] backdrop-blur-2xl backdrop-saturate-150 sm:px-9 sm:pb-9 sm:pt-6">
      {phase === "redirecting" ? (
        <div className="ds-animate-fade absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-xs font-medium text-slate-600 backdrop-blur-sm">
          <Loader2 className="size-5 animate-spin" style={{ color: TEAL }} />
          Signing you in…
        </div>
      ) : null}

      <div className="mb-2.5 flex justify-end">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Secure Access
        </span>
      </div>

      <p className="text-sm text-slate-500">Welcome to</p>
      <h1 className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
        TITAN <span style={{ color: TEAL }}>PPC</span>
      </h1>
      <p className="mt-1.5 text-xs tracking-wide text-slate-500">
        Production Planning &amp; Control
      </p>

      <form
        className="mt-6 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ email: employeeId, password });
        }}
        noValidate
      >
        <Field
          icon={<User className="size-4" />}
          label="Employee ID"
          value={employeeId}
          onChange={setEmployeeId}
          autoComplete="username"
        />
        <Field
          icon={<Lock className="size-4" />}
          label="Password"
          type={reveal ? "text" : "password"}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          trailing={
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide" : "Show"}
              className="text-slate-400 hover:text-slate-600"
            >
              {reveal ? <EyeOff /> : <Eye />}
            </button>
          }
        />

        <div className="flex items-center justify-between pt-0.5 text-xs">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 rounded border-slate-300"
              style={{ accentColor: TEAL }}
            />
            Remember this workstation
          </label>
          <button type="button" className="font-medium" style={{ color: TEAL }}>
            Forgot password?
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: TEAL }}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Sign In
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
        <span>
          Use your Titan employee credentials. This workstation is monitored and
          activity is logged.
        </span>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-white/70 bg-white/85 px-3.5 transition-colors focus-within:border-[#0c7c88] focus-within:bg-white">
        <span className="text-slate-400">{icon}</span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none autofill:[-webkit-text-fill-color:#0f172a] autofill:[box-shadow:inset_0_0_0_1000px_#ffffff]"
        />
        {trailing}
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7a9 9 0 0 0 5.4-1.6M3 3l18 18" />
    </svg>
  );
}
