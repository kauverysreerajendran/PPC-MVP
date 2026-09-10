"use client";

import type { ReactNode } from "react";
import { alertModal } from "@/lib/alert";

/**
 * Back-compat shim. The app no longer shows floating bottom toasts — every
 * notification is a SweetAlert dialog (see `@/lib/alert`). `useToast()` keeps
 * its old `(tone, message)` signature so existing call sites don't change.
 */
type ToastTone = "success" | "error" | "info";

const TITLE: Record<ToastTone, string> = {
  success: "Done",
  error: "Error",
  info: "Notice",
};

export function useToast() {
  return (tone: ToastTone, message: string) => {
    void alertModal(tone, TITLE[tone], message);
  };
}

/** No-op passthrough — kept so existing layout/provider code is unaffected. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
