/**
 * Build the Hellbender "Splatter" disc-swatch set from Bill's AUTHORITATIVE
 * PNG export.
 *
 * Source of truth: `attached_assets/20260616_Hellbender_-_PNGs_1781669771008.zip`
 * — 31 distinct 1200x1200 8-bit RGBA transparent disc renders Bill exported
 * himself. (The zip also carries macOS cruft we ignore: `__MACOSX/._*`
 * AppleDouble sidecars, and 0-byte `:`-colon twins of any filename whose
 * display name contains a slash — macOS stores `/` as `:`. We keep only the
 * real, non-empty `_`-form PNGs, which is exactly 31.)
 *
 * This supersedes the earlier PROVISIONAL 32-disc set extracted from the
 * press's generic `BONUS_VinylMockUp_Examples.psd`. Bill's export drops one
 * color ("Purple / White / Royal Blue Tri-Color Striped w/ White Splatter")
 * and is the renders he actually approved, so we rebuild from it rather than
 * reuse the PSD crops (which were 600x600 and not pixel-identical anyway).
 *
 * Each render is trimmed of its transparent border and re-canvased to 600x600
 * (transparent pad) — large raster art OOMs mobile WebKit, and 600 matches the
 * other catalog swatch sizes. `swatchHex` is computed as the mean opaque color
 * (a never-displayed fallback; the disc PNG is what the picker shows).
 *
 * Outputs (committed artifacts consumed by seed-hellbender-splatter.ts):
 *   scripts/data/splatter-discs/01.png .. 31.png
 *   scripts/data/hellbender-splatter-photos.json   (publicUrl filled by the loader)
 *
 * Run:  npx tsx scripts/build-hellbender-splatter-discs.ts
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import AdmZip from "adm-zip";
import sharp from "sharp";

const ZIP = "attached_assets/20260616_Hellbender_-_PNGs_1781669771008.zip";
const DISC_DIR = "scripts/data/splatter-discs";
const MANIFEST = "scripts/data/hellbender-splatter-photos.json";
const SIZE = 600;

// Curated display order (the prior set's order, minus the dropped
// "Purple / White / Royal Blue ..." color) → the exact raw PNG basename in
// Bill's export. Restores the punctuation macOS mangled (`/`→`_`/`:`, `w/`).
const NAME_TO_RAW: [name: string, raw: string][] = [
  ["Royal Blue Cloudy", "ROYAL BLUE CLOUDY.png"],
  ["Purple Cloudy", "PURPLE CLOUDY.png"],
  ["Mint + White Cornetto w/ Light Yellow Splatter", "MINT+WHITE CORNETTO W LIGHT YELLOW SPLATTER.png"],
  ["Oxblood + Silver Cornetto w/ Black Splatter", "OXBLOOD+SILVER CORNETTO W BLACK SPLATTER.png"],
  ["Cadet Blue + Silver Butterfly w/ Black Splatter", "CADET BLUE + SILVER BUTTERFLY W BLACK SPLATTER.png"],
  ["Ultra Clear + Cobalt Butterfly w/ Black Splatter", "ULTRA CLEAR + COBALT BUTTERFLY W BLACK SPLATTER.png"],
  ["Black in Purple w/ Black Splatter", "BLACK IN PURPLE W BLACK SPLATTER.png"],
  ["Oxblood in Light Yellow w/ Neon Pink Splatter", "OXBLOOD IN LIGHT YELLOW W NEON PINK SPLATTER.png"],
  ["Silver / Black / White Tri-Color Striped w/ Black Splatter", "SILVER_BLACK_WHITE TRI-COLOR STRIPED W BLACK SPLATTER.png"],
  ["Black + White Side A/B w/ Silver Splatter", "BLACK+WHITE SIDE A_B W_ SILVER SPLATTER.png"],
  ["Bone + Brown Side A/B w/ Orange Splatter", "BONE+BROWN SIDE A_B W_ ORANGE SPLATTER.png"],
  ["Mint + Blue + Purple Tri-Color Side A/B", "MINT+BLUE+PURPLE TRI-COLOR SIDE A_B.png"],
  ["Canary Yellow + Orange + Evergreen Tri-Color Side A/B", "CANARY YELLOW+ORANGE+EVERGREEN TRI-COLOR SIDE A_B.png"],
  ["White + Silver Side A/B w/ Black + Mint Splatter", "WHITE+SILVER SIDE A_B W_ BLACK+MINT SPLATTER.png"],
  ["Mint + Purple Side A/B w/ Black + Canary Yellow Splatter", "MINT+PURPLE SIDE A_B W_ BLACK+CANARY YELLOW SPLATTER.png"],
  ["Color-in-Color Black in Ultra Clear", "COLOR IN COLOR BLACK IN ULTRA CLEAR.png"],
  ["Color-in-Color Neon Pink in Cadet Blue", "COLOR IN COLOR NEON PINK IN CADET BLUE.png"],
  ["Double Color-in-Color Mint in Orange in Cadet Blue", "DOUBLE CIC MINT IN ORANGE IN CADET BLUE.png"],
  ["Double Color-in-Color Black in Purple in Royal Blue", "DOUBLE CIC BLACK IN PURPLE IN ROYAL BLUE.png"],
  ["Black in Cloudy Clear w/ Black + Neon Orange Splatter", "BLACK IN CLOUDY CLEAR W BLACK+NEON ORANGE SPLATTER.png"],
  ["Trans Purple w/ Black + Oxblood + Light Blue Splatter", "TRANS PURPLE W_ BLACK+OXBLOOD+LIGHT BLUE SPLATTER.png"],
  ["Royal Blue w/ Black Smoke", "ROYAL BLUE W BLACK SMOKE.png"],
  ["Cadet Blue w/ Neon Pink Smoke", "CADET BLUE W NEON PINK SMOKE.png"],
  ["Silver / Black Split w/ Black Splatter", "SILVER_BLACK SPLIT W_ BLACK SPLATTER.png"],
  ["Neon Orange / Cloudy Clear Split w/ Black + Cream Splatter", "NEON ORANGE_CLOUDY CLEAR SPLIT W_ BLACK+CREAM SPLATTER.png"],
  ["Mint Green / Silver Blended", "MINT GREEN _ SILVER BLENDED.png"],
  ["Purple / Sky Blue Blended", "PURPLE _ SKY BLUE BLENDED.png"],
  ["Mint + Silver Galaxy", "MINT+SILVER GALAXY.png"],
  ["Cream + Gold Galaxy", "CREAM+GOLD GALAXY.png"],
  ["Hot Light Pink w/ Black Marble", "HOT LIGHT PINK W_ BLACK MARBLE.png"],
  ["Silver w/ Black Marble", "SILVER W_ BLACK MARBLE.png"],
];

/** Mean color of mostly-opaque pixels → #rrggbb (never-displayed fallback). */
async function meanOpaqueHex(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += ch) {
    const a = ch === 4 ? data[i + 3] : 255;
    if (a < 200) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (n === 0) return "#808080";
  const to2 = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

async function main() {
  if (!existsSync(ZIP)) throw new Error(`Source zip not found: ${ZIP}`);
  const zip = new AdmZip(ZIP);

  // Real PNGs = non-empty, not __MACOSX, basename not an AppleDouble sidecar.
  const real = new Map<string, Buffer>();
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    if (e.entryName.includes("__MACOSX")) continue;
    const base = basename(e.entryName);
    if (base.startsWith("._")) continue;
    if (!base.toLowerCase().endsWith(".png")) continue;
    if (e.header.size === 0) continue; // 0-byte ":"-colon twins
    real.set(base, e.getData());
  }

  // Assert the export is exactly the 31 we mapped — fail loudly on any drift
  // so a re-export with renamed/added/removed files can't silently mis-seed.
  const mapped = new Set(NAME_TO_RAW.map(([, raw]) => raw));
  const found = new Set(real.keys());
  const missing = [...mapped].filter((r) => !found.has(r));
  const extra = [...found].filter((r) => !mapped.has(r));
  if (missing.length || extra.length || real.size !== NAME_TO_RAW.length) {
    throw new Error(
      `Export drift — mapped ${NAME_TO_RAW.length}, found ${real.size} real PNG(s).\n` +
        (missing.length ? `  missing (mapped but not in zip): ${missing.join(", ")}\n` : "") +
        (extra.length ? `  extra (in zip but unmapped): ${extra.join(", ")}\n` : ""),
    );
  }

  // Fresh disc dir (drop the stale 32-file PSD set so no 32.png lingers).
  mkdirSync(DISC_DIR, { recursive: true });
  for (const f of readdirSync(DISC_DIR)) {
    if (/^\d+\.png$/.test(f)) rmSync(join(DISC_DIR, f));
  }

  const colors: { position: number; name: string; file: string; swatchHex: string }[] = [];
  let i = 0;
  for (const [name, raw] of NAME_TO_RAW) {
    i++;
    const file = `${String(i).padStart(2, "0")}.png`;
    const disc = await sharp(real.get(raw)!)
      .trim()
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(DISC_DIR, file), disc);
    const swatchHex = await meanOpaqueHex(disc);
    colors.push({ position: i, name, file, swatchHex });
    console.log(`  ${file}  ${swatchHex}  ${name}`);
  }

  const manifest = {
    source: "attached_assets/20260616_Hellbender_-_PNGs_1781669771008.zip",
    note: "Hellbender Splatter-tier disc renders from Bill's authoritative 20260616 PNG export. swatchHex is a fallback only; swatchImageUrl (the disc render) always wins in the picker.",
    discDir: DISC_DIR,
    colors,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${colors.length} discs to ${DISC_DIR} and ${MANIFEST}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
