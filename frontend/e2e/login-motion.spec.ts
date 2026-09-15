// TEMPORARY on-screen verification of the sign-in motion layers (login/page.tsx, .login-fx-*).
//   E2E_BASE_URL=http://localhost:3000 MOTION_OUT=<dir> npx playwright test e2e/login-motion.spec.ts --workers=1
import { cpus } from "node:os";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

test.use({ headless: !process.env.HEADED });
test.describe.configure({ mode: "serial", timeout: 240_000 });

const OUT = process.env.MOTION_OUT ?? "test-results/login-motion";
const POSTER = { w: 1774, h: 887 };
const NOSE = { x: 319, y: 463 };
const HAND_ORIGIN = { x: 287 + 529 * 0.4, y: 399 + 488 * 0.95 };
const LABEL_QUAD = [
  { x: 187, y: 437 },
  { x: 268, y: 421 },
  { x: 270, y: 478 },
  { x: 188, y: 497 },
];
const POT = { x: 1575, y: 560, w: 75, h: 75 };
const LEAVES_CORE = { x: 1540, y: 340, w: 180, h: 150 };
const SCANNER = { x: 320, y: 440, w: 200, h: 120 };
const VIEWPORTS: [number, number][] = [
  [1920, 880],
  [1920, 1080],
  [1536, 864],
  [1366, 768],
  [2560, 1440],
];
const FRAMES_S = [0, 1.4, 2.8, 4.2, 5.6, 7.0];

type Pt = { x: number; y: number };
type Rect = Pt & { w: number; h: number };
type Art = Pt & { s: number };

function artBox(vw: number, vh: number): Art {
  const w = Math.max(vw, (vh * POSTER.w) / POSTER.h);
  return { x: (vw - w) / 2, y: vh - (w * POSTER.h) / POSTER.w, s: w / POSTER.w };
}
const toScreen = (p: Pt, a: Art) => ({ x: a.x + p.x * a.s, y: a.y + p.y * a.s });
function screenRect(r: Rect, a: Art, vw: number, vh: number) {
  const left = Math.max(0, Math.round(a.x + r.x * a.s));
  const top = Math.max(0, Math.round(a.y + r.y * a.s));
  return { left, top, width: Math.min(vw - left, Math.round(r.w * a.s)), height: Math.min(vh - top, Math.round(r.h * a.s)) };
}
const pixels = (png: Buffer, rect: ReturnType<typeof screenRect>) => sharp(png).extract(rect).raw().toBuffer();
function diff(a: Buffer, b: Buffer) {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > max) max = d;
  }
  return { max, mean: sum / a.length };
}
function inConvexQuad(p: Pt, quad: Pt[]) {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const c = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (c && sign && c !== sign) return false;
    if (c) sign = c;
  }
  return true;
}

async function openLogin(page: Page, vw: number, vh: number) {
  await page.setViewportSize({ width: vw, height: vh });
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __fxCls: number; __shifts: string[] };
    w.__cls = 0;
    w.__fxCls = 0;
    w.__shifts = [];
    type Shift = { value: number; hadRecentInput: boolean; startTime: number; sources: { node: Element | null }[] };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Shift[]) {
        if (e.hadRecentInput) continue;
        w.__cls += e.value;
        if (e.sources.some((s) => s.node instanceof Element && s.node.closest(".login-fx"))) w.__fxCls += e.value;
        const nodes = e.sources.map((s) => (s.node ? `${s.node.nodeName}.${s.node instanceof Element ? s.node.className : ""}` : "?"));
        w.__shifts.push(`${e.startTime.toFixed(0)}ms ${e.value.toFixed(4)} ${nodes.join(" | ")}`);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/login", { waitUntil: "load", timeout: 120_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const imgs = [...document.querySelectorAll<HTMLImageElement>(".login-art img, .login-fx img")];
          return imgs.length === 3 && imgs.every((i) => i.complete && i.naturalWidth > 0);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

/** Pause every .login-fx animation at `ms` and return the laser geometry on screen. */
function seek(page: Page, ms: number) {
  return page.evaluate(async (ms) => {
    for (const a of document.getAnimations()) {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (target?.closest(".login-fx")) {
        a.pause();
        a.currentTime = ms;
      }
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const rect = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    return { core: rect(".login-fx-core"), hit: rect(".login-fx-hit"), led: rect(".login-fx-led") };
  }, ms);
}

for (const [vw, vh] of VIEWPORTS) {
  test(`frames ${vw}x${vh}`, async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    await openLogin(page, vw, vh);
    const art = artBox(vw, vh);
    const nose = toScreen(NOSE, art);
    const origin = toScreen(HAND_ORIGIN, art);
    const quad = LABEL_QUAD.map((p) => toScreen(p, art));
    // Worst-case nose travel: 1.1 % of the hand box height plus a 0.35° turn about the wrist.
    const travel = 0.011 * 488 * art.s + Math.hypot(nose.x - origin.x, nose.y - origin.y) * Math.sin((0.35 * Math.PI) / 180) + 1;

    const shots: Buffer[] = [];
    const rows: string[] = [];
    for (const s of [...FRAMES_S, 3.5]) {
      const g = await seek(page, s * 1000);
      const shot = await page.screenshot({ path: `${OUT}/${vw}x${vh}-t${s === 3.5 ? "peak" : s}.png` });
      if (s !== 3.5) shots.push(shot);
      const noseMove = Math.hypot(g.led.cx - nose.x, g.led.cy - nose.y);
      rows.push(
        `t=${s}s beam→nose Δ(${(g.core.r - g.led.cx).toFixed(1)}, ${(g.core.b - g.led.cy).toFixed(1)}) nose moved ${noseMove.toFixed(1)}px (≤${travel.toFixed(1)}) hit on label ${inConvexQuad({ x: g.hit.cx, y: g.hit.cy }, quad)}`,
      );
      expect(Math.abs(g.core.r - g.led.cx), "beam ends at the nose (x)").toBeLessThanOrEqual(2);
      expect(Math.abs(g.core.b - g.led.cy), "beam ends at the nose (y)").toBeLessThanOrEqual(2.5);
      expect(noseMove, "nose stays on the scanner").toBeLessThanOrEqual(travel);
      expect(inConvexQuad({ x: g.hit.cx, y: g.hit.cy }, quad), "beam lands on the label").toBe(true);
    }

    const pot = screenRect(POT, art, vw, vh);
    const leaves = screenRect(LEAVES_CORE, art, vw, vh);
    const scanner = screenRect(SCANNER, art, vw, vh);
    const base = { pot: await pixels(shots[0], pot), leaves: await pixels(shots[0], leaves), scanner: await pixels(shots[0], scanner) };
    let leavesMoved = 0;
    let scannerMoved = 0;
    for (let i = 1; i < shots.length; i++) {
      const potDiff = diff(base.pot, await pixels(shots[i], pot));
      leavesMoved = Math.max(leavesMoved, diff(base.leaves, await pixels(shots[i], leaves)).mean);
      scannerMoved = Math.max(scannerMoved, diff(base.scanner, await pixels(shots[i], scanner)).mean);
      rows.push(`frame ${FRAMES_S[i]}s pot max Δ ${potDiff.max}`);
      expect(potDiff.max, `pot pixels identical at ${FRAMES_S[i]}s`).toBe(0);
    }
    rows.push(`leaves mean Δ ${leavesMoved.toFixed(2)}, scanner mean Δ ${scannerMoved.toFixed(2)}`);
    expect(leavesMoved, "leaves move").toBeGreaterThan(0.5);
    expect(scannerMoved, "scanner moves").toBeGreaterThan(0.5);

    const card = await page.evaluate(() => {
      const r = document.querySelector(".login-card-slot > div")!.getBoundingClientRect();
      const fx = document.querySelector(".login-fx")!;
      const cardEl = document.querySelector(".login-card-slot")!;
      return {
        rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
        cardAfterFx: !!(fx.compareDocumentPosition(cardEl) & Node.DOCUMENT_POSITION_FOLLOWING),
        cls: (window as unknown as { __cls: number }).__cls,
        fxCls: (window as unknown as { __fxCls: number }).__fxCls,
        shifts: (window as unknown as { __shifts: string[] }).__shifts,
      };
    });
    rows.push(`card ${card.rect.join(",")} above fx ${card.cardAfterFx} | CLS from .login-fx ${card.fxCls} | page CLS ${card.cls.toFixed(4)} ${card.shifts.join(" ; ")}`);
    console.log(`\n[${vw}x${vh}]\n  ${rows.join("\n  ")}`);
    expect(card.cardAfterFx).toBe(true);
    expect(card.rect[0]).toBeGreaterThanOrEqual(0);
    expect(card.rect[2]).toBeLessThanOrEqual(vw);
    expect(card.rect[1]).toBeGreaterThanOrEqual(0);
    expect(card.rect[3]).toBeLessThanOrEqual(vh);
    expect(card.fxCls, "the motion layers cause no layout shift").toBe(0);
  });
}

test("reduced motion: plain poster, no layers, crops not fetched", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const crops: string[] = [];
  page.on("request", (r) => /login-(hand|leaves)/.test(r.url()) && crops.push(r.url()));
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/login", { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(8000);
  console.log(`\n[reduced motion] page CLS without any layers ${(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toFixed(4)}`);
  const state = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector(".login-fx")!).display,
    animations: document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest(".login-fx")).length,
  }));
  await page.screenshot({ path: `${OUT}/reduced-motion-1920x1080.png` });
  console.log(`\n[reduced motion] display ${state.display}, fx animations ${state.animations}, crop requests ${crops.length}`);
  expect(state).toEqual({ display: "none", animations: 0 });
  expect(crops).toHaveLength(0);
  await ctx.close();
});

async function processCpu(page: Page, ms: number) {
  const cdp = await page.context().browser()!.newBrowserCDPSession();
  type Info = { processInfo: { type: string; id: number; cpuTime: number }[] };
  const sample = async () => ((await cdp.send("SystemInfo.getProcessInfo" as never)) as unknown as Info).processInfo;
  const before = await sample();
  await page.waitForTimeout(ms);
  const after = await sample();
  const byType: Record<string, number> = {};
  for (const p of after) {
    const prev = before.find((b) => b.id === p.id)?.cpuTime ?? 0;
    byType[p.type] = (byType[p.type] ?? 0) + ((p.cpuTime - prev) / (ms / 1000)) * 100;
  }
  await cdp.detach();
  return byType; // % of one core, per process type
}

test("performance: compositor only, idle CPU", async ({ page, browser }) => {
  const cores = cpus().length;
  const report = async (label: string, target: Page) => {
    await target.waitForTimeout(3000);
    const cpu = await processCpu(target, 10_000);
    const total = Object.values(cpu).reduce((a, b) => a + b, 0);
    console.log(
      `\n[cpu ${label}] ${Object.entries(cpu).map(([k, v]) => `${k} ${v.toFixed(1)}%`).join(", ")} | total ${total.toFixed(1)}% of one core = ${(total / cores).toFixed(2)}% of ${cores} cores`,
    );
    return total / cores;
  };

  const reducedCtx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1920, height: 1080 } });
  const reduced = await reducedCtx.newPage();
  await reduced.goto("/login", { waitUntil: "load", timeout: 120_000 });
  const baseline = await report("baseline, reduced motion", reduced);
  await reducedCtx.close();

  await openLogin(page, 1920, 1080);
  const motion = await report("motion layers", page);

  await page.waitForTimeout(1000);
  await browser.startTracing(page, {
    categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.animations"],
  });
  await page.waitForTimeout(5000);
  const trace = JSON.parse((await browser.stopTracing()).toString()) as {
    traceEvents: { name: string; args?: { data?: { compositeFailed?: number; unsupportedProperties?: string[]; id?: string } } }[];
  };
  const count = (name: string) => trace.traceEvents.filter((e) => e.name === name).length;
  const failed = trace.traceEvents.filter((e) => e.args?.data?.compositeFailed);
  console.log(
    `\n[trace 5 s] Paint ${count("Paint")}, Layout ${count("Layout")}, PrePaint ${count("PrePaint")}, UpdateLayoutTree ${count("UpdateLayoutTree")}, compositor frames ${count("DrawFrame")}, animations failing to composite ${failed.length} ${JSON.stringify(failed.slice(0, 5).map((e) => e.args?.data))}`,
  );
  expect(count("Paint"), "no repaint per frame").toBe(0);
  expect(count("Layout"), "no layout per frame").toBe(0);
  expect(failed, "every animation runs on the compositor").toHaveLength(0);
  expect(motion, "idle CPU with motion").toBeLessThan(3);
  expect(baseline).toBeLessThan(3);
});

test("recording + six real-time frames (1920x1080)", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  await openLogin(page, 1920, 1080);
  const t0 = Date.now();
  for (const s of FRAMES_S) {
    await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
    await page.screenshot({ path: `${OUT}/realtime-t${s}.png` });
  }
  await page.waitForTimeout(1000);
  console.log(`\n[video] ${await page.video()!.path()}`);
  await ctx.close();
});

test("sign-in still works over the motion layers", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const signIn = async (user: string, password: string) => {
    await page.goto("/login", { waitUntil: "load", timeout: 120_000 });
    await page.getByPlaceholder("Employee ID").fill(user);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await signIn("admin", "admin");
  const outcome = await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 30_000 }).then(() => "landed on /dashboard"),
    page
      .locator("form p[role=alert]")
      .waitFor({ timeout: 30_000 })
      .then(async () => `form error: ${await page.locator("form p[role=alert]").innerText()}`),
  ]);
  console.log(`\n[login admin/admin] ${outcome}`);
  if (!outcome.startsWith("landed")) {
    await page.screenshot({ path: `${OUT}/login-admin-admin.png` });
    await signIn("dev", "dev");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    console.log("[login dev/dev] landed on /dashboard");
  }
});
