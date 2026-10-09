import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  approach,
  backOut,
  clamp,
  disposeTree,
  floorTextTexture,
  glowTexture,
} from "./sceneKit";

/**
 * Imperative three.js engine behind the Rack Locator overview: one warehouse
 * drawn as a floor, every aisle a walkway with its banks of racks standing on
 * either side, each rack a steel shelving unit whose bins carry its state.
 *
 * The caller hands in an already shaped `WarehouseModel` with resolved
 * colours and gets opens / hovers back by rack key. Rack labels are DOM
 * buttons the caller owns; this class only moves them to follow their rack.
 */

export type WhSlot = "empty" | "occupied" | "reserved" | "blocked";

/** One shelf's tray counts — the slots drawn on that level follow them. */
export interface WhShelf {
  capacity: number;
  occupied: number;
  reserved: number;
  blocked: number;
}

export interface WhRack {
  key: string;
  levels: number;
  /** per shelf, top shelf (Shelf 1) first */
  shelves: WhShelf[];
  dimmed: boolean;
  active: boolean;
}

export interface WhAisle {
  /** painted on the walkway floor, e.g. "Aisle A" */
  label: string;
  /** one or two banks; the walkway runs between the first and second */
  banks: WhRack[][];
}

export interface WhPalette {
  /** the lit outline on the floor under each rack */
  glow: string;
  steel: string;
  beam: string;
  lid: string;
  /** tray colours, the same as the legend */
  slots: Record<WhSlot, string>;
  floor: string;
  walkway: string;
  primary: string;
}

export interface WhCallbacks {
  onOpen: (key: string) => void;
  onHover: (key: string | null) => void;
}

const RACK_W = 1.5;
const RACK_D = 0.62;
const RACK_GAP = 0.85;
const LEVEL_H = 0.36;
const WALK_W = 2.6;
/** the front row sits this far left of the back one, as in a staggered aisle */
const STAGGER = 0.45;
const AISLE_GAP = 1.6;
/** tray slots drawn per level */
const SLOTS = 6;
const TRAY_H = 0.05;
const VIEW_DIR = new THREE.Vector3(0.3, 0.8, 1).normalize();
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.8;
const FOV = 32;

interface RackNode {
  key: string;
  group: THREE.Group;
  body: THREE.Group;
  anchor: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  trayMats: THREE.MeshStandardMaterial[];
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  dimmed: boolean;
  active: boolean;
  delay: number;
  lift: number;
  fade: number;
}

export class WarehouseScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly glowTex = glowTexture();
  private readonly reducedMotion: boolean;

  private world: THREE.Group | null = null;
  private racks: RackNode[] = [];
  private labels = new Map<string, HTMLElement>();
  private extent = new THREE.Box3();
  private width = 1;
  private height = 1;
  private hoverKey: string | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private idleAt = 0;
  private raf = 0;
  private last = performance.now();
  private clock = 0;
  private builtAt = 0;
  private fitted = false;
  private zoom = 1;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: WhCallbacks,
  ) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Throws when WebGL is unavailable; the caller shows its own fallback.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd4e4f0, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
    fill.position.set(-8, 4, -6);
    this.scene.add(fill);
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    // The page scrolls; the wheel must keep scrolling it.
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);

    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- public API

  setWarehouse(aisles: WhAisle[], palette: WhPalette): void {
    const firstBuild = this.world === null;
    this.clear();
    const world = new THREE.Group();
    this.world = world;
    this.root.add(world);

    const steelMat = () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette.steel),
        roughness: 0.35,
        metalness: 0.55,
      });
    const beamMat = () =>
      new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.beam), roughness: 0.45, metalness: 0.3 });
    const lidMat = () =>
      new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.lid), roughness: 0.5 });

    const postGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
    const beamGeo = new RoundedBoxGeometry(RACK_W, 0.04, RACK_D, 2, 0.015);
    const lidGeo = new RoundedBoxGeometry(RACK_W + 0.08, 0.05, RACK_D + 0.08, 2, 0.02);
    const trayW = (RACK_W - 0.16) / SLOTS - 0.035;
    const binGeo = new RoundedBoxGeometry(trayW, TRAY_H, RACK_D * 0.82, 2, 0.015);
    binGeo.translate(0, TRAY_H / 2, 0);
    const shadowGeo = new THREE.PlaneGeometry(RACK_W + 0.9, RACK_D + 0.9);
    const outlineGeo = new THREE.PlaneGeometry(RACK_W + 0.5, RACK_D + 0.5);
    const haloGeo = new THREE.PlaneGeometry(RACK_W + 1.4, RACK_D + 1.4);

    let z = 0;
    let order = 0;
    const box = new THREE.Box3();

    aisles.forEach((aisle) => {
      const banks = aisle.banks.filter((b) => b.length > 0);
      const longest = Math.max(1, ...banks.map((b) => b.length));
      const runW = longest * RACK_W + (longest - 1) * RACK_GAP;
      const zFront = z;
      const walkZ = zFront + RACK_D + WALK_W / 2;

      banks.forEach((bank, bi) => {
        // the first bank stands behind, the second in front; both face the
        // viewer so every rack's trays are in sight, and the front row is
        // staggered left so it never hides the row behind
        const bankZ = bi === 0 ? walkZ - WALK_W / 2 - RACK_D / 2 : walkZ + WALK_W / 2 + RACK_D / 2;
        const facing = 0;
        const shift = bi === 0 ? 0 : -(RACK_W + RACK_GAP) * STAGGER;
        const bankW = bank.length * RACK_W + (bank.length - 1) * RACK_GAP;
        bank.forEach((rack, ri) => {
          const x = -runW / 2 + (runW - bankW) / 2 + ri * (RACK_W + RACK_GAP) + RACK_W / 2 + shift;
          const node = this.buildRack(rack, palette, {
            steel: steelMat(),
            beam: beamMat(),
            lid: lidMat(),
            postGeo,
            beamGeo,
            lidGeo,
            binGeo,
            shadowGeo,
            outlineGeo,
            haloGeo,
          });
          node.group.position.set(x, 0, bankZ);
          node.body.rotation.y = facing;
          node.delay = order++ * 0.06;
          world.add(node.group);
          this.racks.push(node);
          const h = rack.levels * LEVEL_H + 0.2;
          box.expandByPoint(new THREE.Vector3(x - RACK_W / 2, 0, bankZ - RACK_D / 2));
          box.expandByPoint(new THREE.Vector3(x + RACK_W / 2, h, bankZ + RACK_D / 2));
        });
      });

      // the aisle's name, up on the wall behind its back row
      const textTex = floorTextTexture(aisle.label);
      textTex.userData.owned = true;
      const text = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.28),
        new THREE.MeshBasicMaterial({
          map: textTex,
          color: new THREE.Color(palette.steel),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      text.position.set(0.6, 2.4, zFront - 1.1);
      world.add(text);

      z = walkZ + WALK_W / 2 + RACK_D + AISLE_GAP;
    });

    // floor slab under everything
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const floorTex = this.glowTex.clone();
      floorTex.userData.owned = true;
      floorTex.needsUpdate = true;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x + 6, size.z + 6),
        new THREE.MeshBasicMaterial({
          map: floorTex,
          color: new THREE.Color(palette.floor),
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(center.x, -0.002, center.z);
      floor.renderOrder = -1;
      world.add(floor);
      // centre the world on the origin so the orbit pivots on it
      world.position.set(-center.x, 0, -center.z);
      box.translate(new THREE.Vector3(-center.x, 0, -center.z));
    }
    this.extent.copy(box);

    if (firstBuild) {
      this.builtAt = this.clock;
      this.fitted = false;
    }
    this.fitCamera();
  }

  /** Filter / active-rack changes, without rebuilding (or re-raising) the racks. */
  setRackStates(states: Map<string, { dimmed: boolean; active: boolean }>): void {
    for (const r of this.racks) {
      const s = states.get(r.key);
      if (!s) continue;
      r.dimmed = s.dimmed;
      r.active = s.active;
    }
  }

  /** Closer (< 1) or further (> 1) than the fitted distance. */
  setZoom(z: number): void {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    this.fitCamera();
  }

  /** Back to the opening view at the fitted distance. */
  resetView(): void {
    this.zoom = 1;
    this.fitted = false;
    this.fitCamera();
  }

  /** label buttons by rack key */
  setLabels(labels: Map<string, HTMLElement>): void {
    this.labels = labels;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.fitted = false;
    this.fitCamera();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.clear();
    this.glowTex.dispose();
    this.outlineTex.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ internals

  private buildRack(
    rack: WhRack,
    palette: WhPalette,
    kit: {
      steel: THREE.MeshStandardMaterial;
      beam: THREE.MeshStandardMaterial;
      lid: THREE.MeshStandardMaterial;
      postGeo: THREE.BufferGeometry;
      beamGeo: THREE.BufferGeometry;
      lidGeo: THREE.BufferGeometry;
      binGeo: THREE.BufferGeometry;
      shadowGeo: THREE.BufferGeometry;
      outlineGeo: THREE.BufferGeometry;
      haloGeo: THREE.BufferGeometry;
    },
  ): RackNode {
    const group = new THREE.Group();
    group.userData.rackKey = rack.key;
    const body = new THREE.Group();
    group.add(body);
    const levels = Math.max(1, Math.min(rack.levels, 10));
    const h = levels * LEVEL_H + 0.12;

    // one material per state, shared by this rack's trays
    const trayMat: Record<WhSlot, THREE.MeshStandardMaterial> = {
      empty: this.trayMaterial(palette.slots.empty),
      occupied: this.trayMaterial(palette.slots.occupied),
      reserved: this.trayMaterial(palette.slots.reserved),
      blocked: this.trayMaterial(palette.slots.blocked),
    };

    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(kit.postGeo, kit.steel);
      post.scale.y = h;
      post.position.set((sx * RACK_W) / 2, h / 2, (sz * RACK_D) / 2);
      body.add(post);
    }
    for (let l = 0; l < levels; l++) {
      const y = 0.06 + l * LEVEL_H;
      const beam = new THREE.Mesh(kit.beamGeo, kit.beam);
      beam.position.y = y;
      body.add(beam);
      // level 0 is the floor; Shelf 1 is the top level
      const slots = slotsFor(rack.shelves[levels - 1 - l]);
      for (let b = 0; b < SLOTS; b++) {
        const x = -RACK_W / 2 + 0.08 + ((RACK_W - 0.16) / SLOTS) * (b + 0.5);
        const tray = new THREE.Mesh(kit.binGeo, trayMat[slots[b] ?? "empty"]);
        tray.position.set(x, y + 0.02, 0);
        body.add(tray);
      }
    }
    const lid = new THREE.Mesh(kit.lidGeo, kit.lid);
    lid.position.y = h;
    body.add(lid);

    const outline = new THREE.Mesh(
      kit.outlineGeo,
      new THREE.MeshBasicMaterial({
        map: this.outlineTex,
        color: new THREE.Color(palette.glow),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.004;
    group.add(outline);

    const shadow = new THREE.Mesh(
      kit.shadowGeo,
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: new THREE.Color(palette.steel),
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    group.add(shadow);

    const haloMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: new THREE.Color(palette.primary),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const halo = new THREE.Mesh(kit.haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.006;
    group.add(halo);

    const anchor = new THREE.Object3D();
    anchor.position.set(0, h + 0.12, 0);
    group.add(anchor);

    const trayMats = Object.values(trayMat);
    const mats = [kit.steel, kit.beam, kit.lid, ...trayMats];
    mats.forEach((m) => {
      m.transparent = true;
    });
    return {
      key: rack.key,
      group,
      body,
      anchor,
      mats,
      trayMats,
      halo,
      haloMat,
      dimmed: rack.dimmed,
      active: rack.active,
      delay: 0,
      lift: 0,
      fade: rack.dimmed ? 0.22 : 1,
    };
  }

  private readonly outlineTex = frameTexture();

  private trayMaterial(color: string): THREE.MeshStandardMaterial {
    const c = new THREE.Color(color);
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1, roughness: 0.4 });
  }

  private clear(): void {
    if (!this.world) return;
    // shared geometries are reachable from every rack; disposeTree de-dupes
    disposeTree(this.world);
    this.root.remove(this.world);
    this.world = null;
    this.racks = [];
  }

  /** Back the camera off far enough to frame every aisle. */
  private fitCamera(): void {
    if (this.extent.isEmpty()) return;
    const size = this.extent.getSize(this.tmp);
    const radius = 0.5 * Math.hypot(size.x, size.y * 1.4, size.z);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(vfov) * this.camera.aspect);
    const dist = Math.max(radius / Math.tan(vfov), radius / Math.tan(hfov)) * 0.8 * this.zoom;
    this.controls.target.set(0, size.y * 0.2, 0);
    if (!this.fitted) {
      this.camera.position.copy(this.controls.target).addScaledVector(VIEW_DIR, dist);
      this.fitted = true;
    } else {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    }
    // keep the idle sway centred on the fitted view
    const az = Math.atan2(VIEW_DIR.x, VIEW_DIR.z);
    this.controls.minAzimuthAngle = az - 0.75;
    this.controls.maxAzimuthAngle = az + 0.75;
    this.controls.update();
  }

  private pick(clientX: number, clientY: number): string | null {
    if (!this.world) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.racks.map((r) => r.body),
      true,
    );
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.rackKey === undefined) o = o.parent;
      if (o) return o.userData.rackKey as string;
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.idleAt = this.clock + 6;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    this.idleAt = this.clock + 6;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 600) {
      const key = this.pick(e.clientX, e.clientY);
      if (key) this.callbacks.onOpen(key);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) return;
    const key = this.pick(e.clientX, e.clientY);
    this.canvas.style.cursor = key ? "pointer" : "grab";
    this.setHover(key);
  };

  private onLeave = () => this.setHover(null);

  /** also driven by the DOM labels, so both surfaces light the same rack */
  setHover(key: string | null): void {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.callbacks.onHover(key);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.clock += dt;

    // gentle idle sway; any interaction parks it for a few seconds
    if (!this.reducedMotion && this.clock > this.idleAt && !this.down) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = Math.sin(this.clock * 0.22) * 0.45;
    } else {
      this.controls.autoRotate = false;
    }

    const since = this.clock - this.builtAt;
    for (const r of this.racks) {
      // racks rise out of the floor one after another
      const grow = this.reducedMotion ? 1 : clamp((since - r.delay) / 0.7, 0, 1);
      r.body.scale.y = Math.max(backOut(grow), 0.001);

      const hovered = this.hoverKey === r.key;
      const liftTo = hovered ? 0.1 : 0;
      r.lift += (liftTo - r.lift) * approach(dt, 10);
      r.body.position.y = r.lift;

      const fadeTo = r.dimmed && !hovered ? 0.2 : 1;
      r.fade += (fadeTo - r.fade) * approach(dt, 8);
      for (const m of r.mats) {
        m.opacity = r.fade;
        m.depthWrite = r.fade > 0.95;
      }
      for (const m of r.trayMats) m.emissiveIntensity = hovered ? 0.35 : 0.1;

      const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock * 3);
      r.haloMat.opacity = r.active ? 0.45 + 0.25 * pulse : hovered ? 0.3 : 0;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    for (const r of this.racks) {
      const el = this.labels.get(r.key);
      if (!el) continue;
      r.anchor.getWorldPosition(this.tmp).project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * this.width;
      const y = (-this.tmp.y * 0.5 + 0.5) * this.height;
      const grow = clamp((since - r.delay - 0.4) / 0.4, 0, 1);
      el.style.transform = `translate(${x.toFixed(1)}px,${(y - r.lift * 40).toFixed(1)}px) translate(-50%,-100%)`;
      el.style.opacity = (grow * (r.dimmed && this.hoverKey !== r.key ? 0.45 : 1)).toFixed(2);
    }
  };
}

/**
 * A shelf's trays spread over the drawn slots in proportion — filled first,
 * then reserved and blocked, the rest empty. Any non-zero count keeps at
 * least one slot, so a single filled tray still shows.
 */
export function slotsFor(shelf: WhShelf | undefined, slots = SLOTS): WhSlot[] {
  const out: WhSlot[] = [];
  if (!shelf || shelf.capacity <= 0) return Array<WhSlot>(slots).fill("empty");
  const share = (n: number) => (n > 0 ? Math.max(1, Math.round((n / shelf.capacity) * slots)) : 0);
  for (const [state, n] of [
    ["occupied", shelf.occupied],
    ["reserved", shelf.reserved],
    ["blocked", shelf.blocked],
  ] as const) {
    for (let i = 0; i < share(n) && out.length < slots; i++) out.push(state);
  }
  while (out.length < slots) out.push("empty");
  return out;
}

/** A soft, glowing rounded frame — the light strip around a rack's footprint. */
function frameTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,1)";
  g.shadowColor = "rgba(255,255,255,1)";
  g.lineWidth = 4;
  for (const blur of [14, 6, 0]) {
    g.shadowBlur = blur;
    g.beginPath();
    g.roundRect(18, 18, 220, 92, 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
