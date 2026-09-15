import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/LoginForm";
import plate from "@/assets/images/login-plate.webp";
import scanner from "@/assets/images/login-scanner.webp";

export const metadata: Metadata = { title: "Sign in" };

/* Measured off 7.png itself, in its own pixels. The stylesheet only ever sees
   percentages derived here, so no coordinate is written twice and re-shooting
   the backdrop means editing this block alone.

   login-plate.webp is 7.png with the scanner, hand and sleeve taken out and the
   gap filled from their surroundings; login-scanner.webp is what was taken out,
   with a feathered alpha, cropped to CUT. Laid back at CUT the two are the
   original picture — which is what lets the scanner move on its own. */
const SCENE = { w: 3840, h: 2160 };
const CUT = { x: 1622, y: 762, w: 1624, h: 1388 };
/** The WC-45827-A label, as a rotated rectangle (it sits in perspective). */
const LABEL = { cx: 1339, cy: 974, w: 276, h: 175, deg: -11.78 };
/** The painted ray's own centre line — measured off its bright core, not its
    glow, which sits lower and drags the average down with it. */
const NOSE = { x: 1626, y: 953 };
const HIT = { x: 1476, y: 960 };

const pct = (value: number, of: number) => `${+((value / of) * 100).toFixed(4)}%`;

const cutStyle = {
  "--s-l": pct(CUT.x, SCENE.w),
  "--s-t": pct(CUT.y, SCENE.h),
  "--s-w": pct(CUT.w, SCENE.w),
  "--s-h": pct(CUT.h, SCENE.h),
} as CSSProperties;

const beamStyle = {
  "--s-l": pct(HIT.x, SCENE.w),
  "--s-t": pct(HIT.y, SCENE.h),
  "--s-w": pct(Math.hypot(NOSE.x - HIT.x, NOSE.y - HIT.y), SCENE.w),
  "--s-deg": `${+((Math.atan2(NOSE.y - HIT.y, NOSE.x - HIT.x) * 180) / Math.PI).toFixed(3)}deg`,
} as CSSProperties;

const ledStyle = { "--s-l": pct(NOSE.x, SCENE.w), "--s-t": pct(NOSE.y, SCENE.h) } as CSSProperties;

const sweepStyle = {
  "--s-l": pct(LABEL.cx, SCENE.w),
  "--s-t": pct(LABEL.cy, SCENE.h),
  "--s-w": pct(LABEL.w, SCENE.w),
  "--s-h": pct(LABEL.h, SCENE.h),
  "--s-deg": `${LABEL.deg}deg`,
} as CSSProperties;

export default function LoginPage() {
  return (
    <div className="login-page">
      {/* The plate and every overlay share one box — the size `object-cover`
          would give the picture, worked out explicitly — so a percentage inside
          it always lands on the same pixel however the window is shaped.
          Cropping alone could not promise that. */}
      <div className="login-scene" aria-hidden>
        <Image src={plate} alt="" fill priority sizes="100vw" className="object-cover object-top" />

        {/* Fixed to the picture: the read line stays on the barcode, and the
            laser stays welded to the ray painted into the plate. Riding with
            the hand instead would slide it off its own painted ray — which is
            what a scanner's beam does not do: it holds on what it is reading. */}
        <span className="login-scan-sweep" style={sweepStyle}>
          <span className="login-scan-line" />
        </span>
        <span className="login-scan-beam" style={beamStyle} />

        {/* Everything that belongs to the scanner rides in one rig, so the beam
            and the nose LED keep their measured places on the picture while
            still following the hand. */}
        <div className="login-scan-rig">
          <span className="login-scan-cut" style={cutStyle}>
            <Image src={scanner} alt="" fill priority sizes="100vw" className="object-contain" />
          </span>
          <span className="login-scan-led" style={ledStyle} />
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
