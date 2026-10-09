"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type Notice = { id: string; title: string; time: string; unread?: boolean };

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [notices] = useState<Notice[]>([]);
  const unread = notices.filter((n) => n.unread).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="ds-focus-ring relative flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-2 hover:text-text"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--color-danger)] ring-2 ring-surface" />
        ) : null}
      </button>

      {open ? (
        <div className="ds-animate-fade-up absolute right-0 mt-1.5 w-80 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold">Notifications</p>
            <span className="text-[11px] text-text-muted">{unread} unread</span>
          </div>
          {notices.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {notices.map((n) => (
                <li key={n.id} className="flex gap-2.5 px-3 py-2.5 hover:bg-surface-2">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      n.unread ? "bg-primary" : "bg-border-strong"
                    }`}
                  />
                  <div>
                    <p className="text-xs text-text">{n.title}</p>
                    <p className="text-[11px] text-text-muted">{n.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
