"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";
const KEY = "titan.theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeSetting() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(KEY) as Theme | null) ?? "system";
      setTheme(saved);
      apply(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="inline-flex rounded-[var(--radius-sm)] border border-border-strong p-0.5">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            className={cn(
              "ds-focus-ring flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-medium transition-colors",
              theme === o.value
                ? "bg-primary text-[var(--color-primary-fg)]"
                : "text-text-secondary hover:text-text",
            )}
          >
            <Icon className="size-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
