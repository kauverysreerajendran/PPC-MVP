"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/** Events closer together than this belong to the gesture that opened the card. */
const OPEN_GESTURE_MS = 400;

/**
 * A small card that opens on hover, focus or click of its trigger. It is
 * rendered in a portal with fixed positioning, so table overflow containers
 * never clip it, and it stays open while the pointer is over the trigger OR the
 * card — so the card can hold actions (e.g. "View more").
 */
export function HoverCard({
  trigger,
  label,
  width = 288,
  align = "end",
  triggerClassName,
  children,
}: {
  trigger: ReactNode;
  /** accessible name of the trigger / card */
  label: string;
  width?: number;
  /** which trigger edge the card lines up with */
  align?: "start" | "end";
  /** extra classes on the trigger button, e.g. to color a link-style trigger */
  triggerClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openedAt = useRef(0);
  const id = useId();

  const close = () => {
    clearTimeout(timer.current);
    setPos(null);
  };
  const open = () => {
    clearTimeout(timer.current);
    if (!pos) openedAt.current = Date.now();
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = align === "end" ? r.right - width : r.left;
    const left = Math.min(Math.max(8, x), window.innerWidth - width - 8);
    // Flip above when there is not enough room below for a typical card.
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  };
  const closeSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos(null), 140);
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Any scroll moves the trigger away from the fixed card — just close it.
    const onScroll = () => close();
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [pos]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={!!pos}
        aria-controls={pos ? id : undefined}
        onMouseEnter={open}
        onMouseLeave={closeSoon}
        onFocus={open}
        onClick={(e) => {
          e.stopPropagation();
          // A tap fires mouseenter + focus (which open the card) and then click
          // in one gesture — only a later click toggles it closed.
          if (pos && Date.now() - openedAt.current > OPEN_GESTURE_MS) close();
          else open();
        }}
        className={cn(
          "ds-focus-ring cursor-pointer rounded-[var(--radius-xs)] underline decoration-transparent decoration-1 underline-offset-[3px] transition-[text-decoration-color] hover:decoration-current",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              id={id}
              role="dialog"
              aria-label={label}
              onMouseEnter={() => clearTimeout(timer.current)}
              onMouseLeave={closeSoon}
              style={{
                top: pos.top,
                left: pos.left,
                width,
                transform: pos.above ? "translateY(-100%)" : undefined,
              }}
              className="ds-animate-fade fixed z-50 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left text-xs text-text shadow-[var(--shadow-lg)]"
            >
              {typeof children === "function" ? children(close) : children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
