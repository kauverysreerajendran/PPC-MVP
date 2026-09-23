import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/LoginForm";
import scene from "@/assets/images/login-scene-clean.webp";
import arm from "@/assets/images/login-arm-clean.webp";
import swoosh from "@/assets/images/login-swoosh.webp";

export const metadata: Metadata = { title: "Sign in" };

/*
 * The process artwork (4.png) split into three layers so the operator can
 * actually move:
 *
 *   login-scene-clean.webp   the office, trays and label, with the arm painted out
 *   login-arm-clean.webp     the hand + scanner, cut out with its own alpha
 *   login-swoosh.webp  the teal corner, on top so the sleeve tucks under it
 *
 * Every number below is in 4.png's own pixels (2048 × 768). The stylesheet only
 * ever sees percentages derived here, so nothing is measured twice and a
 * re-shot backdrop means editing this block alone.
 */
const SCENE = { w: 2048, h: 768 };
/** Where the arm layer sits in the scene, and its size. */
const ARM = { x: 882, y: 372, w: 851, h: 396 };
/** Scanner nose, in the arm layer's own pixels — the light comes out here. */
const NOSE = { x: 4, y: 102 };
/** Where the teal corner layer sits. */
const SWOOSH = { x: 1628, y: 409, w: 420, h: 359 };
/** The WC-45827-A label the light lands on — a portrait label, tilted with
 *  the tray face (measured off the repainted label in the backdrop). */
const LABEL = { cx: 803, cy: 535, w: 93, h: 110, deg: -12 };

const pct = (value: number, of: number) => `${+((value / of) * 100).toFixed(4)}%`;

const sceneStyle = { "--scene-ar": `${+(SCENE.w / SCENE.h).toFixed(5)}` } as CSSProperties;

const armStyle = {
  "--l": pct(ARM.x, SCENE.w),
  "--t": pct(ARM.y, SCENE.h),
  "--w": pct(ARM.w, SCENE.w),
  "--h": pct(ARM.h, SCENE.h),
} as CSSProperties;

const swooshStyle = {
  "--l": pct(SWOOSH.x, SCENE.w),
  "--t": pct(SWOOSH.y, SCENE.h),
  "--w": pct(SWOOSH.w, SCENE.w),
  "--h": pct(SWOOSH.h, SCENE.h),
} as CSSProperties;

// The beam leaves the nose and points at the label: angle and length from the
// two points, so moving either in the constants above re-aims it.
const noseScene = { x: ARM.x + NOSE.x, y: ARM.y + NOSE.y };
const dx = LABEL.cx - noseScene.x;
const dy = LABEL.cy - noseScene.y;
const beamStyle = {
  "--l": pct(NOSE.x, ARM.w),
  "--t": pct(NOSE.y, ARM.h),
  "--len": pct(Math.hypot(dx, dy), ARM.w),
  "--deg": `${+((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(3)}deg`,
} as CSSProperties;

const labelStyle = {
  "--l": pct(LABEL.cx, SCENE.w),
  "--t": pct(LABEL.cy, SCENE.h),
  "--w": pct(LABEL.w, SCENE.w),
  "--h": pct(LABEL.h, SCENE.h),
  "--deg": `${LABEL.deg}deg`,
} as CSSProperties;

export default function LoginPage() {
  return (
    <div className="login-page">
      {/* One box for the backdrop and every layer on it — the size
          `object-cover` would give the picture, worked out explicitly — so a
          percentage inside it always lands on the same pixel of the artwork
          however the window is shaped. */}
      <div className="login-scene" style={sceneStyle} aria-hidden>
        <Image src={scene} alt="" fill priority sizes="100vw" className="object-cover object-top" />

        {/* Glow where the light lands, and a read line sweeping the barcode. */}
        <span className="login-hit" style={labelStyle} />
        <span className="login-label" style={labelStyle}>
          <span className="login-label-line" />
        </span>

        {/* The operator: the whole layer pivots slowly about the elbow (off the
            right edge), so the scanner sweeps the label and the beam, being a
            child of the layer, moves with it. */}
        <div className="login-arm" style={armStyle}>
          <Image src={arm} alt="" fill priority sizes="45vw" className="object-fill" />
          <span className="login-beam" style={beamStyle}>
            <span className="login-beam-cone" />
            <span className="login-beam-core" />
          </span>
          <span className="login-led" style={beamStyle} />
        </div>

        <div className="login-swoosh" style={swooshStyle}>
          <Image src={swoosh} alt="" fill sizes="25vw" className="object-fill" />
        </div>
      </div>

      {/* The card floats on top of the artwork, aligned to the right so it
          clears the poster's own focal point. */}
      <div className="login-card-wrap">
        <div className="login-card">
          <span className="login-card-fold" aria-hidden />
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
