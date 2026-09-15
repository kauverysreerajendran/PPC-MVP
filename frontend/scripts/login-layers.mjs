// One-off asset build for the sign-in motion layers (app/(auth)/login/page.tsx).
//
//   node scripts/login-layers.mjs
//
// Crops the HAND and LEAVES boxes out of the poster (114.png) and writes them as
// 2× WebP next to it. The boxes are read from page.tsx, which is their only
// source, so a re-measured box needs one edit there and one re-run here. The
// output is deterministic: running it again rewrites byte-identical files.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const IMAGES = `${ROOT}src/assets/images/`;
const POSTER = `${IMAGES}114.png`;
const PAGE = `${ROOT}src/app/(auth)/login/page.tsx`;
const SCALE = 2; // high-DPI displays
const QUALITY = 82;
// Outline of scanner + hand + sleeve in poster pixels (clockwise from the nose; the last
// points run below the poster so the sleeve stays opaque to the bottom edge). Baked into
// the hand crop's alpha, dilated by MARGIN (≥ the float travel, so the static hand beneath
// never peeks out) and feathered by FEATHER — only that thin band of background moves.
const HAND_OUTLINE = [
  [315, 449], [366, 440], [421, 436], [466, 444], [498, 465], [511, 497], [512, 530], [536, 550],
  [558, 587], [573, 630], [583, 669], [593, 702], [621, 734], [680, 784], [740, 829], [790, 864],
  [790, 900], [506, 900], [492, 819], [486, 759], [441, 754], [429, 714], [411, 694], [396, 660],
  [385, 620], [376, 580], [371, 557], [376, 540], [356, 515], [331, 497], [314, 490],
];
const MARGIN = 10;
const FEATHER = 4;
const LAYERS = [
  { name: "HAND", file: "login-hand.webp", outline: HAND_OUTLINE },
  { name: "LEAVES", file: "login-leaves.webp" },
];

/** Greyscale alpha for a crop: the outline, dilated and blurred, in output pixels. */
async function outlineAlpha(outline, box) {
  const w = box.width * SCALE;
  const h = box.height * SCALE;
  const points = outline.map(([x, y]) => `${(x - box.left) * SCALE},${(y - box.top) * SCALE}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%"/><polygon points="${points}" fill="#fff" stroke="#fff" stroke-width="${2 * MARGIN * SCALE}" stroke-linejoin="round"/></svg>`;
  return sharp(Buffer.from(svg)).blur(FEATHER * SCALE).extractChannel(0).raw().toBuffer();
}

const page = await readFile(PAGE, "utf8");
const { width: posterW, height: posterH } = await sharp(POSTER).metadata();

function readBox(name) {
  const match = page.match(new RegExp(`const ${name} = \\{ x: (\\d+), y: (\\d+), w: (\\d+), h: (\\d+) \\}`));
  if (!match) throw new Error(`const ${name} = { x, y, w, h } not found in ${PAGE}`);
  const [x, y, w, h] = match.slice(1).map(Number);
  if (x + w > posterW || y + h > posterH) throw new Error(`${name} box exceeds the ${posterW}×${posterH} poster`);
  return { left: x, top: y, width: w, height: h };
}

for (const { name, file, outline } of LAYERS) {
  const box = readBox(name);
  let image = sharp(POSTER)
    .extract(box)
    .resize(box.width * SCALE, box.height * SCALE, { kernel: "lanczos3" });
  if (outline) {
    const alpha = await outlineAlpha(outline, box);
    image = sharp(await image.removeAlpha().toBuffer()).joinChannel(alpha, {
      raw: { width: box.width * SCALE, height: box.height * SCALE, channels: 1 },
    });
  }
  const info = await image.webp({ quality: QUALITY, alphaQuality: 90, effort: 6 }).toFile(`${IMAGES}${file}`);
  console.log(
    `${file}: crop ${box.width}×${box.height} at (${box.left}, ${box.top}) → ${info.width}×${info.height}, ${(info.size / 1024).toFixed(1)} KB`,
  );
}
