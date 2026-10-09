"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth";
import type { User } from "@/lib/api/types";

export function UserMenu({ user }: { user: Pick<User, "email" | "full_name" | "role"> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const name = user.full_name || user.email;
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="ds-focus-ring flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-surface-2"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-900 dark:text-teal-200">
          {initials || "U"}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight text-text">{name}</span>
          <span className="block text-[11px] capitalize leading-tight text-text-muted">
            {user.role}
          </span>
        </span>
        <ChevronDown className="size-4 text-text-muted" />
      </button>

      {open ? (
        <div className="ds-animate-fade-up absolute right-0 mt-1.5 w-56 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-lg)]">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-xs font-medium">{name}</p>
            <p className="truncate text-[11px] text-text-muted">{user.email}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
              className={itemCls}
            >
              <UserIcon className="size-4" />
              Profile & settings
            </button>
            <button
              onClick={async () => {
                await logout();
                router.push("/login");
                router.refresh();
              }}
              className={cn(itemCls, "text-[var(--color-danger)]")}
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const itemCls =
  "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-xs text-text-secondary hover:bg-surface-2 hover:text-text";
