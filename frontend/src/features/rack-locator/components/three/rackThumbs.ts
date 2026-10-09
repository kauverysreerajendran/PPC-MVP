"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { disposeTree, glowTexture } from "./sceneKit";
import { slotsFor, type WhShelf, type WhSlot } from "./WarehouseScene";

/**
 * Still 3D pictures of single racks for the overview gallery.
 *
 * One offscreen renderer draws every rack in turn and hands back an image,
 * so a warehouse of forty racks costs one WebGL context, not forty. The rack
 * is the same as on the 3D floor: steel uprights, a beam per shelf, a light
 * lid, and each shelf's trays as thin slabs in the legend colours, split in
 * proportion to that shelf's counts.
 */

export interface ThumbRack {
  key: string;
  levels: number;
  /** per shelf, top shelf (Shelf 1) first */
  shelves: WhShelf[];
}

export interface ThumbPalette {
  steel: string;
  beam: string;
  lid: string;
  glow: string;
  slots: Record<WhSlot, string>;
}

const RACK_W = 1.5;
const RACK_D = 0.62;
const LEVEL_H = 0.36;
const SLOTS = 6;
const TRAY_H = 0.05;
const W = 480;
const H = 360;
const VIEW_DIR = new THREE.Vector3(0.62, 0.42, 1).normalize();

/** image cache by rack + palette signature, shared across mounts */
const cache = new Map<string, string>();

function signature(rack: ThumbRack, palette: ThumbPalette): string {
  return `${rack.key}|${rack.levels}|${rack.shelves
    .map((s) => `${s.capacity}.${s.occupied}.${s.reserved}.${s.blocked}`)
    .join("-")}|${JSON.stringify(palette)}`;
}

function renderAll(racks: ThumbRack[], palette: ThumbPalette): Map<string, string> {
  const out = new Map<string, string>();
  const todo = racks.filter((r) => {
    const hit = cache.get(signature(r, palette));
    if (hit) out.set(r.key, hit);
    return !hit;
  });
  if (todo.length === 0) return out;

  const canvas = document.createElement("canvas");
  // Throws when WebGL is unavailable; the caller falls back to a flat card.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe2ff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(5, 9, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd6ff, 0.6);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
  const glowTex = glowTexture();

  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.steel), roughness: 0.35, metalness: 0.55 });
  const beam = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.beam), roughness: 0.45, metalness: 0.3 });
  const lid = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.lid), roughness: 0.5 });
  const trayMat = Object.fromEntries(
    (Object.keys(palette.slots) as WhSlot[]).map((s) => {
      const c = new THREE.Color(palette.slots[s]);
      return [s, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, roughness: 0.4 })];
    }),
  ) as Record<WhSlot, THREE.MeshStandardMaterial>;
  const postGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
  const beamGeo = new RoundedBoxGeometry(RACK_W, 0.04, RACK_D, 2, 0.015);
  const lidGeo = new RoundedBoxGeometry(RACK_W + 0.08, 0.05, RACK_D + 0.08, 2, 0.02);
  const trayW = (RACK_W - 0.16) / SLOTS - 0.035;
  const trayGeo = new RoundedBoxGeometry(trayW, TRAY_H, RACK_D * 0.82, 2, 0.015);
  trayGeo.translate(0, TRAY_H / 2, 0);

  try {
    for (const rack of todo) {
      const group = new THREE.Group();
      const levels = Math.max(1, Math.min(rack.levels, 10));
      const h = levels * LEVEL_H + 0.12;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const post = new THREE.Mesh(postGeo, steel);
        post.scale.y = h;
        post.position.set((sx * RACK_W) / 2, h / 2, (sz * RACK_D) / 2);
        group.add(post);
      }
      for (let l = 0; l < levels; l++) {
        const y = 0.06 + l * LEVEL_H;
        const b = new THREE.Mesh(beamGeo, beam);
        b.position.y = y;
        group.add(b);
        const slots = slotsFor(rack.shelves[levels - 1 - l], SLOTS);
        for (let i = 0; i < SLOTS; i++) {
          const t = new THREE.Mesh(trayGeo, trayMat[slots[i] ?? "empty"]);
          t.position.set(-RACK_W / 2 + 0.08 + ((RACK_W - 0.16) / SLOTS) * (i + 0.5), y + 0.02, 0);
          group.add(t);
        }
      }
      const top = new THREE.Mesh(lidGeo, lid);
      top.position.y = h;
      group.add(top);
      // contact shadow and the warm floor light
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(RACK_W + 1.2, RACK_D + 1.2),
        new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(palette.steel), transparent: true, opacity: 0.35, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.002;
      group.add(shadow);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(RACK_W + 1.6, RACK_D + 1.6),
        new THREE.MeshBasicMaterial({
          map: glowTex,
          color: new THREE.Color(palette.glow),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.003;
      group.add(glow);
      scene.add(group);

      // frame the whole rack, a little above its middle
      const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const hfov = Math.atan(Math.tan(vfov) * camera.aspect);
      const dist = Math.max((h * 0.56 + 0.12) / Math.tan(vfov), (RACK_W * 0.62 + 0.1) / Math.tan(hfov)) + RACK_D * 0.6;
      const target = new THREE.Vector3(0, h * 0.48, 0);
      camera.position.copy(target).addScaledVector(VIEW_DIR, dist);
      camera.lookAt(target);

      renderer.render(scene, camera);
      const url = canvas.toDataURL("image/png");
      cache.set(signature(rack, palette), url);
      out.set(rack.key, url);

      scene.remove(group);
      // shared kit stays; only this rack's own planes go
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
    }
  } finally {
    const kit = new THREE.Group();
    kit.add(new THREE.Mesh(postGeo, steel), new THREE.Mesh(beamGeo, beam), new THREE.Mesh(lidGeo, lid));
    for (const m of Object.values(trayMat)) kit.add(new THREE.Mesh(trayGeo, m));
    disposeTree(kit);
    glowTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}

/**
 * Pictures for `racks`, keyed by rack key. Empty until drawn (one frame
 * later); `failed` when the browser has no WebGL, so the caller can fall back.
 */
export function useRackThumbnails(
  racks: ThumbRack[],
  palette: ThumbPalette | null,
): { urls: Map<string, string>; failed: boolean } {
  const [state, setState] = useState<{ urls: Map<string, string>; failed: boolean }>({
    urls: new Map(),
    failed: false,
  });
  const key = palette ? racks.map((r) => signature(r, palette)).join("~") : "";

  useEffect(() => {
    if (!palette) return;
    let cancelled = false;
    // after paint, so the cards show their frames first
    const id = requestAnimationFrame(() => {
      try {
        const urls = renderAll(racks, palette);
        if (!cancelled) setState({ urls, failed: false });
      } catch {
        if (!cancelled) setState({ urls: new Map(), failed: true });
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for racks + palette
  }, [key]);

  return state;
}
