import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { approach, backOut, clamp, disposeTree, glowTexture, lerp, smooth } from "./sceneKit";

/**
 * Imperative three.js engine behind the Rack Locator's rack view: one rack as
 * an open frame of perforated steel uprights — Shelf 1 at the top — whose
 * shelves are flat plates edged in their occupancy tone. Each shelf's columns
 * sit side by side on the plate, and each column's trays lie on it as a small
 * grid, tray 1 at the front-left. Free trays are flat tiles; a filled tray
 * stands up as a box. The shelves can be pulled apart ("explode") so every
 * tray can be seen from above.
 *
 * The caller owns every decision (what a tray's state is, whether it is
 * selected, suggested, ranked or disabled); this class only paints them and
 * reports hovers / clicks by tray key. Shelf chips, column headers, column
 * actions and rank badges are DOM elements the caller owns; this class moves them to follow
 * the geometry.
 */

export type BayTrayState = "empty" | "occupied" | "reserved" | "blocked";

export interface BayTray {
  key: string;
  state: BayTrayState;
  selected: boolean;
  suggested: boolean;
  rank: number | undefined;
  disabled: boolean;
}

export interface BayShelf {
  key: string;
  /** occupancy tone of the shelf, resolved — paints the plate's edge */
  tone: string;
  /** left to right; each column's trays ascending (tray 1 first = front-left) */
  columns: { key: string; trays: BayTray[] }[];
}

export interface BayPalette {
  empty: string;
  occupied: string;
  reserved: string;
  blocked: string;
  primary: string;
  suggested: string;
  upright: string;
  plate: string;
}

export interface BayHover {
  key: string;
  x: number;
  y: number;
}

export interface BayCallbacks {
  onPick: (key: string) => void;
  onHover: (hover: BayHover | null) => void;
}

/** DOM elements the scene keeps glued to the rack. */
export interface BayLabels {
  /** one per shelf, pinned to the front-right upright at the shelf */
  shelves: (HTMLElement | null)[];
  /** one per column of the top shelf, pinned above it */
  columns: (HTMLElement | null)[];
  /** column action buttons by column key, pinned under the column */
  actions: Map<string, HTMLElement>;
  /** rank badges by tray key, pinned to the tray's front-right corner */
  ranks: Map<string, HTMLElement>;
  /** a card pinned above the selected tray, hidden when nothing is selected */
  selected?: HTMLElement | null;
}

const TILE = 0.2;
const PITCH = 0.25;
const COL_GAP = 0.16;
const MARGIN = 0.1;
const PLATE_H = 0.035;
const SHELF_GAP = 0.7;
/** how far apart the shelves float when fully exploded, as a multiple */
const EXPLODE_GAP = 1.8;
const FLOOR_CLEAR = 0.12;
const HEAD_ROOM = 0.3;
const POST = 0.075;
// every tray is a low box; colour, not height, carries the state
const TRAY_H: Record<BayTrayState, number> = {
  empty: 0.06,
  blocked: 0.06,
  reserved: 0.065,
  occupied: 0.07,
};
const LIFT_SELECTED = 0.09;
const LIFT_HOVER = 0.04;
const VIEW_DIR = new THREE.Vector3(0.62, 0.36, 1).normalize();
const FOV = 30;
/** The rack sits a little high (the hint pill owns the bottom), as a fraction
 * of the canvas; the tool rail on the left is narrow enough to ignore. */
const SHIFT_Y = 0.03;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.6;

interface TrayNode {
  key: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  data: BayTray;
  shelf: number;
  lift: number;
}

interface ShelfNode {
  group: THREE.Group;
  columns: { key: string; x: number }[];
  edge: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  delay: number;
}

/** Upright face: a column of punched slots, tinted by the material colour. */
function perforationTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = "rgba(20,28,38,0.55)";
  for (const y of [8, 40]) {
    g.beginPath();
    g.roundRect(12, y, 8, 16, 4);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class RackBayScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly glowTex = glowTexture();
  private readonly holeTex = perforationTexture();
  private readonly reducedMotion: boolean;

  private rack: THREE.Group | null = null;
  private trays: TrayNode[] = [];
  private byKey = new Map<string, TrayNode>();
  private shelves: ShelfNode[] = [];
  private posts: THREE.Mesh[] = [];
  private trayGeo: Record<BayTrayState, THREE.BufferGeometry> | null = null;
  private outline: THREE.Mesh | null = null;
  private outlineMat: THREE.MeshBasicMaterial | null = null;
  private palette: BayPalette | null = null;
  private structure = "";
  private labels: BayLabels = { shelves: [], columns: [], actions: new Map(), ranks: new Map() };
  private filter: Set<string> | null = null;

  private plateW = 1;
  private plateD = 1;
  private hx = 0.5;
  private hz = 0.5;
  private rackH = 1;
  private width = 1;
  private height = 1;
  private focus: number | null = null;
  private explode = 0;
  private zoom = 1;
  private explodeTarget = 0;
  private dist = 10;
  private hoverKey: string | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private raf = 0;
  private last = performance.now();
  private clock = 0;
  private builtAt = 0;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: BayCallbacks,
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
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    // The page scrolls; the wheel must keep scrolling it.
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = 0.7;
    this.controls.maxPolarAngle = 1.6;
    this.controls.minAzimuthAngle = -1.1;
    this.controls.maxAzimuthAngle = 1.1;

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);

    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- public API

  /**
   * Draw the rack. The geometry is rebuilt only when the rack's shape changes;
   * a poll that only moves trays between states just repaints them.
   */
  setRack(shelves: BayShelf[], palette: BayPalette): void {
    const structure = shelves
      .map((s) => `${s.key}:${s.columns.map((c) => `${c.key}=${c.trays.map((t) => t.key).join(",")}`).join(";")}`)
      .join("|");
    const paletteChanged = this.palette !== null && JSON.stringify(this.palette) !== JSON.stringify(palette);
    this.palette = palette;
    if (structure !== this.structure || paletteChanged || !this.rack) {
      const first = this.rack === null;
      this.build(shelves, palette);
      this.structure = structure;
      if (first) this.builtAt = this.clock;
    }
    shelves.forEach((shelf, si) => {
      const node = this.shelves[si];
      if (node) {
        node.edge.color.set(shelf.tone);
        node.edge.emissive.set(shelf.tone);
        node.glow.color.set(shelf.tone);
      }
      for (const col of shelf.columns)
        for (const t of col.trays) {
          const tray = this.byKey.get(t.key);
          if (tray) tray.data = t;
        }
    });
    this.paint();
  }

  setLabels(labels: BayLabels): void {
    this.labels = labels;
  }

  /** Bring one shelf up close, or (`null`) frame the whole rack. */
  setFocus(shelf: number | null): void {
    this.focus = shelf;
  }

  /** 0 = assembled, 1 = shelves pulled fully apart. */
  setExplode(t: number): void {
    this.explodeTarget = clamp(t, 0, 1);
  }

  /** Closer (< 1) or further (> 1) than the framing distance. */
  setZoom(z: number): void {
    this.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  /** Back to the opening three-quarter view at the framing distance. */
  resetView(): void {
    this.zoom = 1;
    this.camera.position.copy(this.controls.target).addScaledVector(VIEW_DIR, this.dist);
    this.controls.update();
  }

  /** Trays outside `keys` fade back; `null` shows every tray at full strength. */
  setFilter(keys: Set<string> | null): void {
    this.filter = keys;
    this.paint();
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.setViewOffset(
      this.width,
      this.height,
      0,
      this.height * SHIFT_Y,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
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
    this.holeTex.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ internals

  private gap(): number {
    return SHELF_GAP * lerp(1, EXPLODE_GAP, smooth(this.explode));
  }

  private heightFor(gap: number): number {
    return FLOOR_CLEAR + Math.max(0, this.shelves.length - 1) * gap + HEAD_ROOM;
  }

  private build(shelves: BayShelf[], palette: BayPalette): void {
    this.clear();
    const rack = new THREE.Group();
    this.rack = rack;
    this.root.add(rack);

    // every column gets the same tray grid, sized for the longest column
    const cols = Math.max(1, ...shelves.map((s) => s.columns.length));
    const maxTrays = Math.max(1, ...shelves.flatMap((s) => s.columns.map((c) => c.trays.length)));
    const depthRows = maxTrays <= 4 ? 1 : maxTrays <= 10 ? 2 : maxTrays <= 18 ? 3 : 4;
    const perRow = Math.ceil(maxTrays / depthRows);
    const colW = perRow * PITCH;
    const plateW = cols * colW + (cols - 1) * COL_GAP + MARGIN * 2;
    const plateD = depthRows * PITCH + MARGIN * 2;
    this.plateW = plateW;
    this.plateD = plateD;
    this.hx = plateW / 2 + POST / 2;
    this.hz = plateD / 2 + POST / 2;

    const upright = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.upright),
      map: this.holeTex,
      roughness: 0.35,
      metalness: 0.5,
    });
    const footMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.upright).multiplyScalar(0.7),
      roughness: 0.4,
      metalness: 0.5,
    });
    const plateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.plate), roughness: 0.5 });

    // posts are unit-tall and stretched every frame, so the rack can explode
    const postGeo = new THREE.BoxGeometry(POST, 1, POST);
    postGeo.translate(0, 0.5, 0);
    const footGeo = new THREE.BoxGeometry(POST * 1.9, 0.03, POST * 1.9);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(postGeo, upright);
      post.position.set(sx * this.hx, 0, sz * this.hz);
      rack.add(post);
      this.posts.push(post);
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(sx * this.hx, 0.015, sz * this.hz);
      rack.add(foot);
    }

    const plateGeo = new RoundedBoxGeometry(plateW, PLATE_H, plateD, 2, 0.012);
    const edgeGeo = new RoundedBoxGeometry(plateW + 0.03, 0.02, plateD + 0.03, 2, 0.009);
    // the neon tube along the front edge, and the light it throws underneath
    const lipGeo = new THREE.BoxGeometry(plateW + 0.04, 0.016, 0.016);
    const glowGeo = new THREE.PlaneGeometry(plateW * 1.3, plateD * 2.4);
    const bin = (h: number) => new RoundedBoxGeometry(TILE, h, TILE, 2, Math.min(0.018, h / 2 - 0.002));
    const trayGeo: Record<BayTrayState, THREE.BufferGeometry> = {
      empty: bin(TRAY_H.empty),
      blocked: bin(TRAY_H.blocked),
      reserved: bin(TRAY_H.reserved),
      occupied: bin(TRAY_H.occupied),
    };
    this.trayGeo = trayGeo;

    // Shelf 1 (the first sent) at the top, reading down. Each shelf is its own
    // group, its origin on the plate's top face, moved as the rack explodes.
    shelves.forEach((shelf, si) => {
      const group = new THREE.Group();
      rack.add(group);
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.y = -PLATE_H / 2;
      group.add(plate);
      const edge = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shelf.tone),
        emissive: new THREE.Color(shelf.tone),
        emissiveIntensity: 1.6,
        roughness: 0.3,
        toneMapped: false,
      });
      const strip = new THREE.Mesh(edgeGeo, edge);
      strip.position.y = -PLATE_H - 0.008;
      group.add(strip);
      const lip = new THREE.Mesh(lipGeo, edge);
      lip.position.set(0, -PLATE_H / 2, plateD / 2 + 0.02);
      group.add(lip);
      const glow = new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: new THREE.Color(shelf.tone),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const wash = new THREE.Mesh(glowGeo, glow);
      wash.rotation.x = -Math.PI / 2;
      wash.position.set(0, -PLATE_H - 0.03, plateD * 0.25);
      group.add(wash);

      const columns: ShelfNode["columns"] = [];
      shelf.columns.forEach((col, ci) => {
        const cx = -plateW / 2 + MARGIN + ci * (colW + COL_GAP) + colW / 2;
        columns.push({ key: col.key, x: cx });
        col.trays.forEach((t, ti) => {
          const row = Math.floor(ti / perRow);
          const along = ti % perRow;
          const mat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
          const mesh = new THREE.Mesh(trayGeo[t.state], mat);
          mesh.position.set(
            cx - colW / 2 + (along + 0.5) * PITCH,
            0,
            // tray 1 at the front
            plateD / 2 - MARGIN - (row + 0.5) * PITCH,
          );
          mesh.userData.trayKey = t.key;
          group.add(mesh);
          const node: TrayNode = { key: t.key, mesh, mat, data: t, shelf: si, lift: 0 };
          this.trays.push(node);
          this.byKey.set(t.key, node);
        });
      });
      this.shelves.push({ group, columns, edge, glow, delay: si * 0.09 });
    });

    // contact shadow, plus a soft halo on the pedestal the backdrop paints
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(plateW + 1.6, plateD + 1.6),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: new THREE.Color(palette.upright),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    rack.add(shadow);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(plateW * 3.2, plateW * 3.2),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: new THREE.Color(palette.primary),
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    rack.add(halo);

    // the selection ring: a back-faced shell drawn just around the chosen tray
    this.outlineMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.primary),
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    this.outline = new THREE.Mesh(trayGeo.empty, this.outlineMat);
    this.outline.scale.set(1.22, 1.9, 1.22);
    this.outline.visible = false;
    rack.add(this.outline);

    this.layout();
    this.dist = this.fitDistance(null);
    const dir = this.camera.position.lengthSq() > 0.001
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : VIEW_DIR.clone();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(dir.multiplyScalar(this.dist));
    this.controls.update();
  }

  /** Stack the shelves at the current explode amount, the rack centred on the pivot. */
  private layout(): void {
    const gap = this.gap();
    const n = this.shelves.length;
    this.rackH = this.heightFor(gap);
    this.shelves.forEach((s, i) => {
      s.group.position.y = FLOOR_CLEAR + (n - 1 - i) * gap;
    });
    for (const post of this.posts) post.scale.y = this.rackH;
    this.holeTex.repeat.set(1, this.rackH / 0.16);
    if (this.rack) this.rack.position.y = -this.rackH / 2;
  }

  private clear(): void {
    if (!this.rack) return;
    disposeTree(this.rack);
    // a state no tray is in right now has a geometry no mesh holds
    if (this.trayGeo) Object.values(this.trayGeo).forEach((g) => g.dispose());
    this.root.remove(this.rack);
    this.rack = null;
    this.trays = [];
    this.byKey.clear();
    this.shelves = [];
    this.posts = [];
    this.trayGeo = null;
    this.outline = null;
    this.outlineMat = null;
  }

  private colorFor(t: BayTray): string {
    const p = this.palette!;
    // occupancy wins: a filled tray paints filled even while selected
    if (t.state === "occupied") return p.occupied;
    if (t.selected) return p.primary;
    if (t.rank) return p.suggested;
    return p[t.state];
  }

  private paint(): void {
    if (!this.palette) return;
    for (const node of this.trays) {
      const geo = this.trayGeo?.[node.data.state];
      if (geo && node.mesh.geometry !== geo) node.mesh.geometry = geo;
      const c = new THREE.Color(this.colorFor(node.data));
      node.mat.color.copy(c);
      node.mat.emissive.copy(c);
      node.mat.roughness = node.data.state === "occupied" ? 0.55 : 0.35;
      const out = this.filter !== null && !this.filter.has(node.key) && !node.data.selected;
      const ghost = node.data.state === "blocked" || out;
      if (node.mat.transparent !== ghost) {
        node.mat.transparent = ghost;
        node.mat.needsUpdate = true;
      }
      node.mat.opacity = out ? 0.14 : ghost ? 0.6 : 1;
    }
  }

  /** Resting glow: free tiles shine a little, like lit bins. */
  private baseGlow(node: TrayNode): number {
    if (this.filter !== null && !this.filter.has(node.key)) return 0;
    const s = node.data.state;
    return s === "empty" ? 0.22 : s === "occupied" ? 0.04 : 0.1;
  }

  /** Camera distance that frames the rack, or one shelf of it. */
  private fitDistance(shelf: number | null): number {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(vfov) * this.camera.aspect);
    const span = Math.max(this.plateW, this.plateD);
    const h = shelf !== null ? SHELF_GAP * 2.2 : this.rackH + 0.7;
    // leave room on the right for the shelf chips
    const w = shelf !== null ? span * 1.5 : span + 1.3;
    const fit = Math.max(h / 2 / Math.tan(vfov), w / 2 / Math.tan(hfov)) + this.plateD / 2 + 0.3;
    return fit * this.zoom;
  }

  private pick(clientX: number, clientY: number): TrayNode | null {
    if (!this.rack) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.trays.map((t) => t.mesh),
      false,
    )[0];
    const key = hit?.object.userData.trayKey as string | undefined;
    return key ? (this.byKey.get(key) ?? null) : null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 600) {
      const node = this.pick(e.clientX, e.clientY);
      if (node && !node.data.disabled) this.callbacks.onPick(node.key);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) return;
    const node = this.pick(e.clientX, e.clientY);
    this.canvas.style.cursor = node ? (node.data.disabled ? "default" : "pointer") : "grab";
    const key = node?.key ?? null;
    const rect = this.canvas.getBoundingClientRect();
    if (key !== this.hoverKey || key) {
      this.hoverKey = key;
      this.callbacks.onHover(key ? { key, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    }
  };

  private onLeave = () => {
    this.hoverKey = null;
    this.callbacks.onHover(null);
  };

  /** Pin a DOM element to a point in rack space. */
  private place(el: HTMLElement | null | undefined, x: number, y: number, z: number, transform: string, alpha: number) {
    if (!el) return;
    this.tmp.set(x, y, z);
    this.rack!.localToWorld(this.tmp);
    this.tmp.project(this.camera);
    const sx = (this.tmp.x * 0.5 + 0.5) * this.width;
    const sy = (-this.tmp.y * 0.5 + 0.5) * this.height;
    const inside = sx > -40 && sx < this.width + 40 && sy > -20 && sy < this.height + 20;
    el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) ${transform}`;
    el.style.opacity = (inside ? alpha : 0).toFixed(2);
    el.style.visibility = inside && alpha > 0.02 ? "visible" : "hidden";
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.clock += dt;
    if (!this.rack) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.explode += (this.explodeTarget - this.explode) * approach(dt, 4);
    this.layout();

    const since = this.clock - this.builtAt;
    const pulse = this.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(this.clock * 4.2);
    let selected: TrayNode | null = null;
    for (const node of this.trays) {
      const d = node.data;
      const shelf = this.shelves[node.shelf]!;
      // trays drop onto their shelves one shelf at a time when the rack appears
      const enter = this.reducedMotion ? 1 : clamp((since - shelf.delay) / 0.6, 0, 1);
      const hovered = this.hoverKey === node.key && !d.disabled;
      const liftTo = d.selected ? LIFT_SELECTED : hovered ? LIFT_HOVER : 0;
      node.lift += (liftTo - node.lift) * approach(dt, 12);
      node.mesh.position.y = TRAY_H[d.state] / 2 + node.lift + (1 - backOut(enter)) * 0.35;
      node.mesh.scale.setScalar(Math.max(enter, 0.001));
      node.mat.emissiveIntensity = d.suggested
        ? 0.3 + 0.6 * pulse
        : hovered
          ? 0.45
          : d.selected
            ? 0.35
            : this.baseGlow(node);
      if (d.selected) selected = node;
    }
    if (this.outline && this.outlineMat) {
      this.outline.visible = !!selected;
      if (selected) {
        const group = this.shelves[selected.shelf]!.group;
        if (this.outline.parent !== group) group.add(this.outline);
        this.outline.geometry = selected.mesh.geometry;
        this.outline.position.copy(selected.mesh.position);
        this.outlineMat.opacity = 0.65 + 0.3 * pulse;
      }
    }

    // glide toward the focused shelf (or the whole rack)
    const s = this.focus !== null ? this.shelves[this.focus] : undefined;
    const ty = s ? s.group.position.y + 0.15 - this.rackH / 2 : 0;
    const k = approach(dt, 5);
    const dy = (ty - this.controls.target.y) * k;
    this.controls.target.y += dy;
    this.camera.position.y += dy;
    const want = this.fitDistance(this.focus);
    this.dist = lerp(this.dist, want, k);
    const off = this.camera.position.clone().sub(this.controls.target);
    if (off.lengthSq() > 1e-6) {
      off.setLength(this.dist);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // DOM overlays
    const labelAlpha = clamp((since - 0.4) / 0.5, 0, 1);
    this.shelves.forEach((sh, i) => {
      const y = sh.group.position.y;
      this.place(this.labels.shelves[i], this.hx, y - PLATE_H / 2, this.hz, "translate(-5px,-50%)", labelAlpha);
      for (const col of sh.columns) {
        this.place(
          this.labels.actions.get(col.key),
          col.x,
          y - PLATE_H - 0.03,
          this.plateD / 2 + 0.02,
          "translate(-50%,0)",
          labelAlpha,
        );
      }
    });
    const top = this.shelves[0];
    if (top) {
      top.columns.forEach((col, i) =>
        this.place(
          this.labels.columns[i],
          col.x,
          top.group.position.y + HEAD_ROOM * 0.75,
          -this.plateD / 2,
          "translate(-50%,-100%)",
          labelAlpha,
        ),
      );
    }
    const card = this.labels.selected;
    if (card) {
      if (selected) {
        const p = selected.mesh.position;
        const y = this.shelves[selected.shelf]!.group.position.y;
        this.place(card, p.x, y + p.y + TRAY_H[selected.data.state] / 2, p.z, "translate(-50%,-100%)", labelAlpha);
      } else {
        card.style.opacity = "0";
        card.style.visibility = "hidden";
      }
    }
    for (const [key, el] of this.labels.ranks) {
      const node = this.byKey.get(key);
      if (!node) continue;
      const p = node.mesh.position;
      const y = this.shelves[node.shelf]!.group.position.y;
      this.place(
        el,
        p.x + TILE / 2,
        y + p.y + TRAY_H[node.data.state] / 2,
        p.z + TILE / 2,
        "translate(-50%,-50%)",
        labelAlpha,
      );
    }
  };
}
