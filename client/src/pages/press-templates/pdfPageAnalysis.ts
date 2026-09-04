import type * as Pdfjs from 'pdfjs-dist';

export type PdfPageAnalysis = {
  rasterImageCount: number;
  unresolvedRasterImages: number;
  minEffectivePpi: number | null;
  hasCmyk: boolean;
  hasRgb: boolean;
  hasGray: boolean;
  hasSpot: boolean;
};

type Matrix = [number, number, number, number, number, number];
type PdfColorKind = 'cmyk' | 'rgb' | 'gray' | 'spot' | 'unknown';
type PdfImageObject = { width?: number; height?: number };

const mulM = (a: Matrix, b: number[]): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

const decoder = new TextDecoder('latin1');

function findAscii(bytes: Uint8Array, text: string, from = 0) {
  const needle = new TextEncoder().encode(text);
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function objectDictionary(bytes: Uint8Array, ref: number) {
  const marker = `${ref} 0 obj`;
  let start = findAscii(bytes, `\n${marker}`);
  if (start >= 0) start += 1;
  else start = findAscii(bytes, marker);
  if (start < 0) return '';
  const streamAt = findAscii(bytes, 'stream', start);
  const endAt = findAscii(bytes, 'endobj', start);
  const ends = [streamAt, endAt].filter((n) => n >= start);
  const end = ends.length ? Math.min(...ends) : Math.min(start + 65536, bytes.length);
  return decoder.decode(bytes.subarray(start, Math.min(end, start + 65536)));
}

function colorKind(bytes: Uint8Array, ref: number, cache: Map<number, PdfColorKind>, depth = 0): PdfColorKind {
  const cached = cache.get(ref);
  if (cached) return cached;
  if (depth > 4) return 'unknown';
  const dict = objectDictionary(bytes, ref);
  let kind: PdfColorKind = 'unknown';
  if (/\/(?:Separation|DeviceN)\b/.test(dict)) kind = 'spot';
  else if (/\/N\s*4\b/.test(dict) || /\/DeviceCMYK\b/.test(dict)) kind = 'cmyk';
  else if (/\/N\s*3\b/.test(dict) || /\/DeviceRGB\b/.test(dict)) kind = 'rgb';
  else if (/\/N\s*1\b/.test(dict) || /\/DeviceGray\b/.test(dict)) kind = 'gray';
  else {
    const indirect = dict.match(/\/(?:ColorSpace|ICCBased)\s*\[?\s*(\d+)\s+\d+\s+R/);
    if (indirect) kind = colorKind(bytes, Number(indirect[1]), cache, depth + 1);
  }
  cache.set(ref, kind);
  return kind;
}

/** Index image dictionaries by embedded pixel dimensions, excluding SMask images. */
export function buildImageColorIndex(bytes: Uint8Array) {
  const refs = new Set<number>();
  for (const marker of ['/Subtype/Image', '/Subtype /Image']) {
    for (let cursor = 0; cursor < bytes.length;) {
      const hit = findAscii(bytes, marker, cursor);
      if (hit < 0) break;
      const prefix = decoder.decode(bytes.subarray(Math.max(0, hit - 8192), hit));
      const matches = Array.from(prefix.matchAll(/(\d+)\s+\d+\s+obj/g));
      const ref = Number(matches.at(-1)?.[1]);
      if (Number.isFinite(ref)) refs.add(ref);
      cursor = hit + marker.length;
    }
  }
  const dictionaries = new Map<number, string>();
  const softMasks = new Set<number>();
  for (const ref of Array.from(refs)) {
    const dict = objectDictionary(bytes, ref);
    dictionaries.set(ref, dict);
    const mask = Number(dict.match(/\/SMask\s*(\d+)\s+\d+\s+R/)?.[1]);
    if (Number.isFinite(mask)) softMasks.add(mask);
  }
  const cache = new Map<number, PdfColorKind>();
  const index = new Map<string, PdfColorKind[]>();
  for (const ref of Array.from(refs)) {
    if (softMasks.has(ref)) continue;
    const dict = dictionaries.get(ref) ?? '';
    const width = Number(dict.match(/\/Width\s*(\d+)/)?.[1]);
    const height = Number(dict.match(/\/Height\s*(\d+)/)?.[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    const key = `${width}x${height}`;
    const kinds = index.get(key) ?? [];
    const kind = colorKind(bytes, ref, cache);
    if (!kinds.includes(kind)) kinds.push(kind);
    index.set(key, kinds);
  }
  return index;
}

/**
 * Measures one page from paint operators. Color assignments count only when a
 * fill/stroke/text/mask/image paints. Effective PPI uses embedded pixels over
 * the image CTM's painted physical size, never the preview viewport.
 */
export async function analyzePdfArtPage(
  doc: Pdfjs.PDFDocumentProxy,
  pageNum: number,
  imageColors: Map<string, PdfColorKind[]>,
  OPS: Record<string, number>,
): Promise<PdfPageAnalysis> {
  const page = await doc.getPage(pageNum);
  const operators = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let fillColor: PdfColorKind = 'gray';
  let strokeColor: PdfColorKind = 'gray';
  const stack: Array<{ ctm: Matrix; fillColor: PdfColorKind; strokeColor: PdfColorKind }> = [];
  const ppis: number[] = [];
  let rasterImageCount = 0, unresolvedRasterImages = 0;
  let hasCmyk = false, hasRgb = false, hasGray = false, hasSpot = false;
  const applyColor = (kind: PdfColorKind) => {
    if (kind === 'cmyk') hasCmyk = true;
    else if (kind === 'rgb') hasRgb = true;
    else if (kind === 'gray') hasGray = true;
    else if (kind === 'spot') hasSpot = true;
    else unresolvedRasterImages++;
  };
  const recordImage = (pixelWidth: number, pixelHeight: number, colors: PdfColorKind[]) => {
    rasterImageCount++;
    const widthPt = Math.hypot(ctm[0], ctm[1]);
    const heightPt = Math.hypot(ctm[2], ctm[3]);
    if (pixelWidth > 0 && pixelHeight > 0 && widthPt > 0 && heightPt > 0) {
      ppis.push(Math.min(pixelWidth / (widthPt / 72), pixelHeight / (heightPt / 72)));
    } else unresolvedRasterImages++;
    if (!colors.length) applyColor('unknown');
    else colors.forEach(applyColor);
  };
  const fillOps = new Set([OPS.fill, OPS.eoFill]);
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke]);
  const bothOps = new Set([OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const textOps = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  const maskOps = new Set([OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectRepeat, OPS.paintImageMaskXObjectGroup, OPS.paintSolidColorImageMask]);
  for (let i = 0; i < operators.fnArray.length; i++) {
    const fn = operators.fnArray[i];
    const args = operators.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ctm: [...ctm] as Matrix, fillColor, strokeColor });
    else if (fn === OPS.restore) {
      const state = stack.pop();
      if (state) ({ ctm, fillColor, strokeColor } = state);
    } else if (fn === OPS.transform) ctm = mulM(ctm, args as number[]);
    else if (fn === OPS.setFillCMYKColor) fillColor = 'cmyk';
    else if (fn === OPS.setStrokeCMYKColor) strokeColor = 'cmyk';
    else if (fn === OPS.setFillRGBColor) fillColor = 'rgb';
    else if (fn === OPS.setStrokeRGBColor) strokeColor = 'rgb';
    else if (fn === OPS.setFillGray) fillColor = 'gray';
    else if (fn === OPS.setStrokeGray) strokeColor = 'gray';
    else if (fn === OPS.setFillColorN) fillColor = 'spot';
    else if (fn === OPS.setStrokeColorN) strokeColor = 'spot';
    else if (fillOps.has(fn)) applyColor(fillColor);
    else if (strokeOps.has(fn)) applyColor(strokeColor);
    else if (bothOps.has(fn)) { applyColor(fillColor); applyColor(strokeColor); }
    else if (textOps.has(fn) || maskOps.has(fn)) applyColor(fillColor);
    else if (fn === OPS.paintImageXObject) {
      const width = Number(args[1] ?? 0), height = Number(args[2] ?? 0);
      recordImage(width, height, imageColors.get(`${width}x${height}`) ?? []);
    } else if (fn === OPS.paintInlineImageXObject) {
      const image = args[0] as PdfImageObject | undefined;
      const width = Number(image?.width ?? 0), height = Number(image?.height ?? 0);
      recordImage(width, height, imageColors.get(`${width}x${height}`) ?? []);
    } else if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintInlineImageXObjectGroup) {
      rasterImageCount++;
      unresolvedRasterImages++;
    }
  }
  return {
    rasterImageCount, unresolvedRasterImages,
    minEffectivePpi: ppis.length ? Math.min(...ppis) : null,
    hasCmyk, hasRgb, hasGray, hasSpot,
  };
}