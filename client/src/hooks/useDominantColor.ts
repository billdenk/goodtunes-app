import { useEffect, useState } from "react";

export type RGB = { r: number; g: number; b: number };

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function toneForBg(rgb: RGB): string {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const clampedL = Math.max(0.13, Math.min(0.26, l * 0.55));
  const clampedS = Math.max(0.25, Math.min(0.6, s));
  const out = hslToRgb(h, clampedS, clampedL);
  return `rgb(${out.r}, ${out.g}, ${out.b})`;
}

export function rgbCss(rgb: RGB, alpha = 1): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function useDominantColor(url: string | undefined): RGB | null {
  const [color, setColor] = useState<RGB | null>(null);
  useEffect(() => {
    setColor(null);
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const max = Math.max(data[i], data[i + 1], data[i + 2]);
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          if (max - min < 14 && max < 40) continue;
          if (max - min < 14 && max > 230) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (n > 0) setColor({ r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) });
        // n===0 → leave color null so caller falls back to brand navy
      } catch {
        // CORS / canvas tainted — leave color null
      }
    };
    img.onerror = () => {
      // load failure — leave color null so caller falls back to brand navy
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return color;
}
