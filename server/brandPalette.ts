// Task #3257 — brand palette suggestion from a scraped page. Pure helpers so
// the extraction is unit-testable without any network. The scrape flow is
// SUGGEST-ONLY: nothing returned here is ever persisted without an operator
// confirming it in the White Label tab.

/** Normalize a CSS hex color ("#abc", "#aabbcc", with/without #) to
 *  uppercase "#RRGGBB", or null when it isn't a valid hex color. */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s.split("").map((c) => c + c).join("")}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toUpperCase();
  return null;
}

export function isValidAccentHex(raw: unknown): raw is string {
  return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance 0..1 (same formula the White Label tab uses for its
 *  too-light-on-dark contrast check). */
export function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Saturation 0..1 (HSL). Used to drop greys — a grey accent suggestion is
 *  never what a brand scrape should offer. */
function hexSaturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/** A hex is a plausible ACCENT when it's neither near-white/near-black nor
 *  grey. Exported so the suggest endpoint and tests share one definition. */
export function isPlausibleAccent(hex: string): boolean {
  const lum = hexLuminance(hex);
  if (lum > 0.85 || lum < 0.04) return false; // near-white / near-black
  return hexSaturation(hex) >= 0.18; // drop greys
}

/**
 * Extract a suggested accent palette from raw page HTML (inline CSS, style
 * attributes, meta theme-color, SVG fills). Returns up to `max` plausible
 * accent hexes, most-frequent first, with theme-color (the site's own
 * declared brand color) always ranked first when plausible.
 */
export function extractPaletteFromHtml(html: string, max = 6): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string, weight = 1) => counts.set(hex, (counts.get(hex) ?? 0) + weight);

  // meta theme-color — the site's own declared brand color, weighted heavily.
  const theme =
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i.exec(html);
  const themeHex = theme ? normalizeHex(theme[1]) : null;
  if (themeHex) bump(themeHex, 1000);

  // Every hex literal in the document (inline <style>, style="", SVG fills…).
  const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = re.exec(html)) && seen < 20000) {
    seen++;
    const hex = normalizeHex(m[0]);
    if (hex) bump(hex);
  }

  return Array.from(counts.entries())
    .filter(([hex]) => isPlausibleAccent(hex))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([hex]) => hex);
}
