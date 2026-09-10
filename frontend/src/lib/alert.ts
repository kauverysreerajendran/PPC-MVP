"use client";

import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

/**
 * App-wide SweetAlert2 wrapper. This replaces the old bottom toast system —
 * every notification is now a SweetAlert dialog, themed via `.swal2-*`
 * overrides in globals.css.
 */
export type AlertTone = "success" | "error" | "info" | "warning" | "question";

const swal = Swal.mixin({ buttonsStyling: false });

/** Centred modal the user must acknowledge — used for errors and warnings. */
export function alertModal(tone: AlertTone, title: string, text?: string) {
  return swal.fire({ icon: tone, title, text, confirmButtonText: "OK" });
}

/** Yes/No confirmation. Resolves to `true` when confirmed. */
export async function alertConfirm(
  title: string,
  text?: string,
  confirmText = "Confirm",
): Promise<boolean> {
  const r = await swal.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
  });
  return r.isConfirmed;
}
