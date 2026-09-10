import clsx, { type ClassValue } from "clsx";

/** Conditional className helper used by every design-system component. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
