"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<(tone: ToastTone, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const toneStyle: Record<ToastTone, { cls: string; icon: ReactNode }> = {
  success: { cls: "text-[var(--color-success)]", icon: <CheckCircle2 className="size-4" /> },
  error: { cls: "text-[var(--color-danger)]", icon: <AlertTriangle className="size-4" /> },
  info: { cls: "text-[var(--color-info)]", icon: <Info className="size-4" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  role="status"
                  className="ds-animate-fade-up flex items-start gap-2.5 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-md)]"
                >
                  <span className={cn("mt-0.5", toneStyle[t.tone].cls)}>{toneStyle[t.tone].icon}</span>
                  <p className="flex-1 text-xs text-text">{t.message}</p>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="text-text-muted hover:text-text"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
