"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

/**
 * Small shared toolkit for the Rack Locator's three.js views: colour
 * resolution from the design tokens, theme tracking, easing and a couple of
 * canvas textures. Nothing here knows about racks.
 */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const backOut = (t: number) =>
  1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
/** frame-rate independent approach factor */
export const approach = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

let probeCtx: CanvasRenderingContext2D | null = null;

/**
 * Any CSS colour the page can paint — `var(--token)`, `color-mix(...)`, hex —
 * as a hex string three.js can parse. The value is resolved in `host`'s
 * cascade (so it follows the theme) and read back through a 1px canvas, which
 * flattens the `color(srgb …)` form `color-mix` computes to.
 */
export function resolveColor(host: HTMLElement, css: string, fallback = "#888888"): string {
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  host.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  if (!computed) return fallback;
  probeCtx ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probeCtx) return fallback;
  probeCtx.clearRect(0, 0, 1, 1);
  probeCtx.fillStyle = "#000";
  probeCtx.fillStyle = computed;
  probeCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

/** Bumps whenever the app theme flips, so scene colours are re-read. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

/* ---- 3D / grid preference, shared by the overview and the rack view ------- */

export type LocatorViewMode = "3d" | "grid";
const MODE_KEY = "rack-locator:view";
const listeners = new Set<() => void>();

function readMode(): LocatorViewMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "grid" ? "grid" : "3d";
  } catch {
    return "3d";
  }
}

export function setLocatorViewMode(mode: LocatorViewMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private mode — the choice just won't stick */
  }
  listeners.forEach((l) => l());
}

export function useLocatorViewMode(): LocatorViewMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readMode,
    () => "3d",
  );
}

/** True once we know whether the browser can start WebGL at all. */
let webglOk: boolean | null = null;
export function canUseWebGL(): boolean {
  if (webglOk !== null) return webglOk;
  // server render: assume yes; the 3D views load client-side only anyway
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    webglOk = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

/* ---- textures -------------------------------------------------------------- */

export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A 45° hatch for the aisle walkway, tinted by the material colour. */
export function hatchTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 7;
  for (let i = -64; i <= 128; i += 20) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Spaced capitals painted onto the floor, e.g. "AISLE A". */
export function floorTextTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,1)";
  g.font = "600 64px system-ui, -apple-system, Segoe UI, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const spaced = text.toUpperCase().split("").join(String.fromCharCode(8202, 8202));
  g.fillText(spaced, 512, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dispose every geometry and material under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => {
    const map = (m as THREE.MeshBasicMaterial).map;
    if (map && map.userData.owned) map.dispose();
    m.dispose();
  });
}

/** Screen position of a world point, in CSS px of a `w`×`h` canvas. */
export function toScreen(
  v: THREE.Vector3,
  camera: THREE.Camera,
  w: number,
  h: number,
): { x: number; y: number; visible: boolean } {
  v.project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 };
}
