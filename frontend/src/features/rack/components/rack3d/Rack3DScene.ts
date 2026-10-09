import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Imperative three.js engine behind the Racks page's exploded 3D view.
 *
 * A rack is drawn the way it stands in the aisle — Shelf 1 on top — and can be
 * pulled apart shelf by shelf ("explode") so every tray is visible. Each shelf
 * is a platform whose edge glows in its occupancy tone; each tray sits on it in
 * its row/column position, with height and colour carrying its state.
 *
 * Nothing here knows about React or the API: the caller hands in an already
 * shaped `SceneRack` plus resolved colours, and gets picks/hover back through
 * callbacks. Shelf chips are plain DOM elements the caller owns; this class only
 * moves them to follow their shelf on screen.
 */

export type SceneTrayState = "empty" | "occupied" | "reserved" | "blocked";

export interface SceneTray {
  code: string;
  state: SceneTrayState;
}

export interface SceneShelf {
  /** occupancy tone as a CSS colour, already resolved */
  tone: string;
  /** rows front-to-back, each a left-to-right list of trays */
  rows: SceneTray[][];
}

export interface SceneRack {
  /** top shelf first */
  shelves: SceneShelf[];
}

export interface ScenePalette {
  empty: string;
  occupied: string;
  reserved: string;
  blocked: string;
  primary: string;
  platform: string;
  steel: string;
  upright: string;
}

export interface SceneHover {
  shelf: number;
  code: string | null;
  x: number;
  y: number;
}

export interface SceneCallbacks {
  onPick: (shelf: number, trayCode: string | null) => void;
  onHover: (hover: SceneHover | null) => void;
}

// Layout, in tray units before each shelf is scaled to fit.
const PITCH_X = 1;
const PITCH_Z = 1.2;
const TRAY_W = 0.82;
const TRAY_D = 0.95;
const PLATFORM_H = 0.18;
const FIT_WIDTH = 3.4;
const TRAY_H: Record<SceneTrayState, number> = {
  empty: 0.1,
  blocked: 0.1,
  reserved: 0.45,
  occupied: 0.72,
};

const VIEW_DIR = new THREE.Vector3(8.4, 5.2, 10.2).normalize();
const BASE_FOV = 34;
/** Aim a little below centre so the stack clears the explode bar at the bottom. */
const AIM_Y = -0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

interface TrayNode {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  code: string;
  base: THREE.Color;
  /** resting emissive strength for its state */
  glow: number;
}

interface ShelfNode {
  group: THREE.Group;
  anchor: THREE.Object3D;
  stripMat: THREE.MeshStandardMaterial;
  trays: TrayNode[];
  lift: number;
  glow: number;
  y: number;
}

function glowTexture(): THREE.CanvasTexture {
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

export class Rack3DScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly glowTex = glowTexture();
  private readonly reducedMotion: boolean;

  private rack: THREE.Group | null = null;
  private shelves: ShelfNode[] = [];
  private spine: THREE.Mesh | null = null;
  private spineMat: THREE.MeshBasicMaterial | null = null;
  private uprights: THREE.Mesh[] = [];
  private feet: THREE.Mesh[] = [];
  private dots: THREE.Mesh[] = [];
  private floor: THREE.Mesh | null = null;
  private halo: THREE.Mesh | null = null;
  private haloMat: THREE.MeshBasicMaterial | null = null;

  private labels: (HTMLElement | null)[] = [];
  private width = 1;
  private height = 1;
  private gapAssembled = 1;
  private gapExploded = 2;
  private explodeTarget = 0;
  private explode = 0;
  private selectedShelf: number | null = null;
  private selectedTray: string | null = null;
  private filter: Set<string> | null = null;
  private hoverShelf: number | null = null;
  private hoverTray: string | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private resumeTimer = 0;
  private raf = 0;
  private last = performance.now();
  private clock = 0;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Throws when WebGL is unavailable; the caller shows its own fallback.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe2ff, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(5, 9, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd6ff, 0.7);
    rim.position.set(-6, 2, -4);
    this.scene.add(rim);
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    // The page scrolls; the wheel must keep scrolling it.
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.5;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.8;

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);

    if (this.reducedMotion) this.clock = 10;
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- public API

  setRack(model: SceneRack, palette: ScenePalette): void {
    this.clearRack();
    const n = model.shelves.length;
    if (n === 0) return;

    const maxCols = Math.max(1, ...model.shelves.flatMap((s) => s.rows.map((r) => r.length)));
    const maxRows = Math.max(1, ...model.shelves.map((s) => s.rows.length));
    const platW = maxCols * PITCH_X + 0.7;
    const platD = maxRows * PITCH_Z + 0.6;
    const k = FIT_WIDTH / Math.max(platW, platD * 1.25);

    this.gapAssembled = (TRAY_H.occupied + PLATFORM_H + 0.22) * k;
    this.gapExploded = Math.max(this.gapAssembled + 0.85, 1.15);

    const rack = new THREE.Group();
    this.rack = rack;
    this.root.add(rack);

    const platformGeo = new RoundedBoxGeometry(platW, PLATFORM_H, platD, 3, 0.08);
    const stripGeo = new RoundedBoxGeometry(platW + 0.06, 0.05, platD + 0.06, 2, 0.025);
    const trayGeo: Record<SceneTrayState, THREE.BufferGeometry> = {
      empty: this.binGeo(TRAY_H.empty),
      blocked: this.binGeo(TRAY_H.blocked),
      reserved: this.binGeo(TRAY_H.reserved),
      occupied: this.binGeo(TRAY_H.occupied),
    };
    const platformMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.platform),
      roughness: 0.5,
    });
    const stateColor: Record<SceneTrayState, string> = {
      empty: palette.empty,
      occupied: palette.occupied,
      reserved: palette.reserved,
      blocked: palette.blocked,
    };

    model.shelves.forEach((shelf, si) => {
      const group = new THREE.Group();
      group.userData.shelf = si;
      const inner = new THREE.Group();
      inner.scale.setScalar(k);
      group.add(inner);

      inner.add(new THREE.Mesh(platformGeo, platformMat));
      const stripMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shelf.tone),
        emissive: new THREE.Color(shelf.tone),
        emissiveIntensity: 0.9,
        roughness: 0.3,
        toneMapped: false,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.y = -PLATFORM_H / 2 - 0.02;
      inner.add(strip);

      const trays: TrayNode[] = [];
      const rows = shelf.rows.length;
      shelf.rows.forEach((row, ri) => {
        const z = (ri - (rows - 1) / 2) * PITCH_Z;
        row.forEach((tray, ti) => {
          const x = (ti - (row.length - 1) / 2) * PITCH_X;
          const base = new THREE.Color(stateColor[tray.state]);
          const glow = tray.state === "empty" ? 0.25 : 0.05;
          const mat = new THREE.MeshStandardMaterial({
            color: base.clone(),
            roughness: tray.state === "occupied" ? 0.55 : 0.35,
            emissive: base.clone(),
            emissiveIntensity: glow,
            transparent: tray.state === "blocked",
            opacity: tray.state === "blocked" ? 0.55 : 1,
          });
          const mesh = new THREE.Mesh(trayGeo[tray.state], mat);
          mesh.position.set(x, PLATFORM_H / 2, z);
          mesh.userData.trayCode = tray.code;
          mesh.userData.blocked = tray.state === "blocked";
          inner.add(mesh);
          trays.push({ mesh, mat, code: tray.code, base, glow });
        });
      });

      // Where the shelf's DOM chip pins: the front-right corner.
      const anchor = new THREE.Object3D();
      anchor.position.set(platW / 2 + 0.05, 0, platD / 2 + 0.05);
      inner.add(anchor);

      rack.add(group);
      this.shelves.push({ group, anchor, stripMat, trays, lift: 0, glow: 0.9, y: 0 });
    });

    // Four corner uprights + a lit spine, stretched to the stack every frame.
    const steelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.upright),
      roughness: 0.32,
      metalness: 0.55,
    });
    const postGeo = new THREE.BoxGeometry(0.085, 1, 0.085);
    const footGeo = new THREE.BoxGeometry(0.18, 0.025, 0.18);
    const hx = (platW / 2) * k + 0.03;
    const hz = (platD / 2) * k + 0.03;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(postGeo, steelMat);
      post.position.set(sx * hx, 0, sz * hz);
      rack.add(post);
      this.uprights.push(post);
      const foot = new THREE.Mesh(footGeo, steelMat);
      foot.position.set(sx * hx, 0, sz * hz);
      rack.add(foot);
      this.feet.push(foot);
    }

    const primary = new THREE.Color(palette.primary);
    this.spineMat = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    });
    this.spine = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), this.spineMat);
    this.spine.position.z = -hz - 0.12;
    rack.add(this.spine);
    const dotGeo = new THREE.SphereGeometry(0.05, 12, 10);
    const dotMat = new THREE.MeshStandardMaterial({
      color: primary,
      emissive: primary,
      emissiveIntensity: 2,
      toneMapped: false,
    });
    for (let i = 0; i < 6; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.z = -hz - 0.12;
      rack.add(dot);
      this.dots.push(dot);
    }

    // Contact shadow only: the stage backdrop paints the pedestal itself.
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: new THREE.Color(palette.upright),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    rack.add(this.floor);
    this.haloMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: primary,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), this.haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    rack.add(this.halo);

    this.fitCamera(n);
    this.applySelection();
  }

  /** chip elements, one per shelf in `setRack` order */
  setLabels(els: (HTMLElement | null)[]): void {
    this.labels = els;
  }

  setExplode(t: number): void {
    this.explodeTarget = clamp(t, 0, 1);
  }

  setSelection(shelf: number | null, trayCode: string | null): void {
    this.selectedShelf = shelf;
    this.selectedTray = trayCode;
    if (shelf !== null) {
      this.controls.autoRotate = false;
      window.clearTimeout(this.resumeTimer);
    } else {
      this.scheduleResume(2500);
    }
    this.applySelection();
  }

  /** Trays outside `codes` fade back; `null` shows every tray at full strength. */
  setFilter(codes: Set<string> | null): void {
    this.filter = codes;
    this.applySelection();
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.camera.aspect < 1.25 ? BASE_FOV + (1.25 - this.camera.aspect) * 40 : BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.fitCamera(this.shelves.length);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.resumeTimer);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.clearRack();
    this.glowTex.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ internals

  private binGeo(h: number): THREE.BufferGeometry {
    const g = new RoundedBoxGeometry(TRAY_W, h, TRAY_D, 2, Math.min(0.06, h / 2.2));
    g.translate(0, h / 2, 0);
    return g;
  }

  private clearRack(): void {
    if (!this.rack) return;
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.rack.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geos.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      }
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    this.root.remove(this.rack);
    this.rack = null;
    this.shelves = [];
    this.uprights = [];
    this.feet = [];
    this.dots = [];
    this.spine = this.spineMat = this.floor = this.halo = this.haloMat = null;
  }

  /** Back the camera off far enough to frame the fully exploded stack. */
  private fitCamera(n: number): void {
    if (n === 0) return;
    const half = Math.max(((n - 1) * this.gapExploded) / 2 + 0.8, FIT_WIDTH * 0.62);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(vfov) * this.camera.aspect);
    const dist = Math.max(half / Math.tan(vfov), (FIT_WIDTH * 0.75) / Math.tan(hfov)) * 1.4;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const dir = offset.lengthSq() > 0.001 ? offset.normalize() : VIEW_DIR.clone();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  private applySelection(): void {
    const primary = this.spineMat?.color ?? new THREE.Color("#0d9488");
    this.shelves.forEach((s) =>
      s.trays.forEach((t) => {
        const on = t.code === this.selectedTray;
        t.mat.emissive.copy(on ? primary : t.base);
        t.mat.color.copy(on ? primary : t.base);
        t.mesh.scale.set(on ? 1.08 : 1, on ? 1.25 : 1, on ? 1.08 : 1);
        const blocked = t.mesh.userData.blocked === true;
        const out = !on && this.filter !== null && !this.filter.has(t.code);
        if (t.mat.transparent !== (blocked || out)) {
          t.mat.transparent = blocked || out;
          t.mat.needsUpdate = true;
        }
        t.mat.opacity = out ? 0.16 : blocked ? 0.55 : 1;
        t.mat.depthWrite = !out;
      }),
    );
  }

  private scheduleResume(ms: number): void {
    window.clearTimeout(this.resumeTimer);
    if (this.reducedMotion) return;
    this.resumeTimer = window.setTimeout(() => {
      if (this.selectedShelf === null) this.controls.autoRotate = true;
    }, ms);
  }

  private pick(clientX: number, clientY: number): { shelf: number; code: string | null } | null {
    if (!this.rack) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.shelves.map((s) => s.group),
      true,
    );
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      const code = (o.userData.trayCode as string | undefined) ?? null;
      while (o && o.userData.shelf === undefined) o = o.parent;
      if (o) return { shelf: o.userData.shelf as number, code };
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.controls.autoRotate = false;
    window.clearTimeout(this.resumeTimer);
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 600) {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.callbacks.onPick(hit.shelf, hit.code);
    }
    if (this.selectedShelf === null) this.scheduleResume(3500);
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) return;
    const hit = this.pick(e.clientX, e.clientY);
    const shelf = hit?.shelf ?? null;
    const code = hit?.code ?? null;
    this.canvas.style.cursor = hit ? "pointer" : "grab";
    if (shelf === this.hoverShelf && code === this.hoverTray) return;
    this.hoverShelf = shelf;
    this.hoverTray = code;
    const rect = this.canvas.getBoundingClientRect();
    this.callbacks.onHover(
      hit ? { shelf: hit.shelf, code, x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
    );
  };

  private onLeave = () => {
    this.hoverShelf = this.hoverTray = null;
    this.callbacks.onHover(null);
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.clock += dt;

    const intro = Math.min(this.clock / 1.3, 1);
    this.root.scale.setScalar(Math.max(backOut(intro), 0.001));
    this.root.rotation.y = (1 - intro) * -1;

    this.explode += (this.explodeTarget - this.explode) * (1 - Math.exp(-dt * 4));
    const e = smooth(clamp(this.explode, 0, 1));
    const gap = lerp(this.gapAssembled, this.gapExploded, e);
    const n = this.shelves.length;
    const mid = (n - 1) / 2;

    this.shelves.forEach((s, i) => {
      const liftTo = this.selectedShelf === i ? 0.32 : this.hoverShelf === i ? 0.14 : 0;
      s.lift += (liftTo - s.lift) * Math.min(dt * 9, 1);
      s.y = (mid - i) * gap;
      s.group.position.y = s.y + s.lift * e;
      const glowTo = this.selectedShelf === i ? 1.9 : this.hoverShelf === i ? 1.5 : 0.9;
      s.glow += (glowTo - s.glow) * Math.min(dt * 8, 1);
      s.stripMat.emissiveIntensity = s.glow;
      s.trays.forEach((t) => {
        const on = t.code === this.selectedTray;
        const hover = t.code === this.hoverTray;
        t.mat.emissiveIntensity = on ? 0.9 + Math.sin(this.clock * 4) * 0.25 : hover ? 0.6 : t.glow;
      });
    });

    if (n > 0) {
      const top = mid * gap + 0.35;
      const bottom = -mid * gap - 0.3;
      const span = Math.max(top - bottom, 0.01);
      for (const post of this.uprights) {
        post.scale.y = span;
        post.position.y = (top + bottom) / 2;
      }
      if (this.spine && this.spineMat) {
        this.spine.scale.y = span;
        this.spine.position.y = (top + bottom) / 2;
        this.spineMat.opacity = 0.55 * e;
      }
      this.dots.forEach((d, i) => {
        const p = (this.clock * 0.32 + i / this.dots.length) % 1;
        d.position.y = lerp(bottom, top, i % 2 ? p : 1 - p);
        d.scale.setScalar(Math.max(e, 0.001));
      });
      const floorY = bottom - 0.02;
      for (const foot of this.feet) foot.position.y = bottom;
      if (this.floor) {
        this.floor.position.y = floorY;
        this.floor.scale.setScalar(1 + e * 0.15);
      }
      if (this.halo && this.haloMat) {
        this.halo.position.y = floorY - 0.01;
        this.haloMat.opacity = 0.2 + 0.2 * e;
      }
    }

    // Glide the orbit target to the picked shelf so it sits mid-frame.
    const focusY = this.selectedShelf !== null && this.shelves[this.selectedShelf]
      ? this.shelves[this.selectedShelf]!.y * 0.75 + AIM_Y
      : AIM_Y;
    const dy = (focusY - this.controls.target.y) * Math.min(dt * 4, 1);
    this.controls.target.y += dy;
    this.camera.position.y += dy;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    const labelAlpha = clamp((this.explode - 0.35) / 0.4, 0, 1) * (intro < 1 ? 0 : 1);
    this.labels.forEach((el, i) => {
      const shelf = this.shelves[i];
      if (!el || !shelf) return;
      shelf.anchor.getWorldPosition(this.tmp).project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * this.width;
      const y = (-this.tmp.y * 0.5 + 0.5) * this.height;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-4px,-50%)`;
      el.style.opacity = labelAlpha.toFixed(2);
      el.style.pointerEvents = labelAlpha > 0.5 ? "auto" : "none";
    });
  };
}
