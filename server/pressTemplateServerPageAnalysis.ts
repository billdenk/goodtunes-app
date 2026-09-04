import { analyzePdfArtPage, buildImageColorIndex, type PdfPageAnalysis } from "../client/src/pages/press-templates/pdfPageAnalysis";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

export type ServerProofPage = PdfPageAnalysis & {
  page: number;
  widthMm: number;
  heightMm: number;
  referencedGtLayerNames: string[];
};

function installPdfGlobals() {
  const g = globalThis as any;
  if (!g.DOMMatrix) g.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(v?: number[]) {
      if (v) [this.a, this.b, this.c, this.d, this.e, this.f] = v;
    }
  };
  if (!g.ImageData) g.ImageData = class ImageData {};
  if (!g.Path2D) g.Path2D = class Path2D {};
}

type Paint = { hasCmyk: boolean; hasRgb: boolean; hasGray: boolean; hasSpot: boolean; unresolved: boolean };

async function sourcePaintByPage(bytes: Uint8Array): Promise<Paint[]> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  return pdf.getPages().map((page) => {
    const out: Paint = { hasCmyk: false, hasRgb: false, hasGray: false, hasSpot: false, unresolved: false };
    type Kind = "cmyk" | "rgb" | "gray" | "spot";
    type State = { fill: Kind; stroke: Kind };
    const apply = (kind: Kind) => {
      if (kind === "cmyk") out.hasCmyk = true;
      else if (kind === "rgb") out.hasRgb = true;
      else if (kind === "gray") out.hasGray = true;
      else out.hasSpot = true;
    };
    const walk = (stream: PDFRawStream, resources: PDFDict[], state: State, depth: number, ancestors: Set<string>) => {
      if (depth > 12) { out.unresolved = true; return; }
      let source = "";
      try { source = new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode()); }
      catch { out.unresolved = true; return; }
    // Remove comments, literal/hex strings and arrays so operands inside text
    // or binary literals cannot masquerade as graphics operators.
      const tokens = source
      .replace(/%[^\r\n]*/g, " ")
      .replace(/\((?:\\.|[^\\)])*\)/g, " ")
      .replace(/<(?!!)[0-9A-Fa-f\s]*>/g, " ")
      .replace(/\[(?:[^\[\]]|\[[^\]]*\])*\]/g, " ")
      .trim().split(/\s+/);
    let fill = state.fill, stroke = state.stroke;
    const stack: Array<{ fill: Kind; stroke: Kind }> = [];
    let previous = "";
    for (const token of tokens) {
      if (token === "q") stack.push({ fill, stroke });
      else if (token === "Q") ({ fill, stroke } = stack.pop() ?? { fill, stroke });
      else if (token === "k") fill = "cmyk";
      else if (token === "K") stroke = "cmyk";
      else if (token === "rg") fill = "rgb";
      else if (token === "RG") stroke = "rgb";
      else if (token === "g") fill = "gray";
      else if (token === "G") stroke = "gray";
      else if (token === "cs") {
        fill = /CMYK/i.test(previous) ? "cmyk" : /RGB/i.test(previous) ? "rgb" : /Gray/i.test(previous) ? "gray" : "spot";
      } else if (token === "CS") {
        stroke = /CMYK/i.test(previous) ? "cmyk" : /RGB/i.test(previous) ? "rgb" : /Gray/i.test(previous) ? "gray" : "spot";
      } else if (token === "scn" || token === "sc") {
        // Retain the selected fill colorspace.
      } else if (token === "SCN" || token === "SC") {
        // Retain the selected stroke colorspace.
      }
      else if (/^(?:f|F|f\*)$/.test(token)) apply(fill);
      else if (/^(?:S|s)$/.test(token)) apply(stroke);
      else if (/^(?:B|B\*|b|b\*)$/.test(token)) { apply(fill); apply(stroke); }
      else if (/^(?:Tj|TJ|'|\")$/.test(token)) apply(fill);
      else if (token === "Do") {
        const name = previous.startsWith("/") ? previous.slice(1) : "";
        // Resource dictionaries are category-wise inherited: a Form's local
        // dictionary can define (say) ColorSpace while its caller supplies
        // XObject. Look through the local-to-parent chain for this category.
        const ref = name
          ? resources.map((r) => r.lookupMaybe(PDFName.of("XObject"), PDFDict)?.get(PDFName.of(name))).find(Boolean)
          : undefined;
        const object = ref ? pdf.context.lookup(ref) : undefined;
        if (!(object instanceof PDFRawStream)) out.unresolved = true;
        else {
          const subtype = object.dict.get(PDFName.of("Subtype"))?.toString();
          if (subtype === "/Form") {
            const key = ref?.toString() ?? `form-${depth}`;
            if (ancestors.has(key)) out.unresolved = true;
            else {
              const next = new Set(ancestors); next.add(key);
              const ownResources = object.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
              // Form execution has an isolated graphics state; its local
              // resources shadow caller resources, otherwise caller entries
              // remain available per PDF resource inheritance semantics.
              walk(object, ownResources ? [ownResources, ...resources] : resources, { fill, stroke }, depth + 1, next);
            }
          } else if (subtype !== "/Image") out.unresolved = true;
        }
      }
      previous = token;
    }
    };
    const pageResources = page.node.lookupMaybe(PDFName.of("Resources"), PDFDict);
    const contents = page.node.get(PDFName.of("Contents"));
    const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    if (!objects.length) out.unresolved = true;
    for (const object of objects) {
      const stream = pdf.context.lookup(object);
      if (stream instanceof PDFRawStream) walk(stream, pageResources ? [pageResources] : [], { fill: "gray", stroke: "gray" }, 0, new Set([object.toString()]));
      else out.unresolved = true;
    }
    return out;
  });
}

export async function analyzeServerPdfBytes(bytes: Uint8Array): Promise<ServerProofPage[]> {
  installPdfGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const sourcePaint = await sourcePaintByPage(bytes);
    const config = await doc.getOptionalContentConfig().catch(() => null);
    const names: Record<string, string> = {};
    if (config) {
      for (const id of config.getOrder?.() ?? []) {
        if (typeof id === "string") {
          const group = config.getGroup(id);
          if (group?.name) names[id] = group.name;
        }
      }
    }
    const imageColors = buildImageColorIndex(bytes);
    const out: ServerProofPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const vp = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList();
      const refs = new Set<string>();
      for (let i = 0; i < operators.fnArray.length; i++) {
        if (operators.fnArray[i] !== pdfjs.OPS.beginMarkedContentProps) continue;
        const props = operators.argsArray[i]?.[1] as { id?: string } | undefined;
        const name = props?.id ? names[props.id] : undefined;
        if (name && /^GT(?:[\s_-]|$)/i.test(name)) refs.add(name);
      }
      const measured = await analyzePdfArtPage(doc as any, pageNumber, imageColors, pdfjs.OPS as any, {
        // pdf.js converts source CMYK vector colors to display RGB in its
        // operator list. Source-level paint parsing above preserves PDF ink
        // semantics; pdf.js remains authoritative for image placement/PPI.
        trackOperatorColors: false,
      });
      const source = sourcePaint[pageNumber - 1];
      out.push({
        page: pageNumber,
        widthMm: vp.width * 25.4 / 72,
        heightMm: vp.height * 25.4 / 72,
        referencedGtLayerNames: Array.from(refs),
        ...measured,
        hasCmyk: measured.hasCmyk || source?.hasCmyk === true,
        hasRgb: measured.hasRgb || source?.hasRgb === true,
        hasGray: measured.hasGray || source?.hasGray === true,
        hasSpot: measured.hasSpot || source?.hasSpot === true,
        unresolvedRasterImages: measured.unresolvedRasterImages + (source?.unresolved ? 1 : 0),
      });
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

export function serverPagePass(page: ServerProofPage, minPpi = 300): boolean {
  const resolutionPass = page.rasterImageCount === 0 ||
    (page.unresolvedRasterImages === 0 && page.minEffectivePpi != null && page.minEffectivePpi >= minPpi - 0.5);
  const colorPass = !page.hasRgb && page.unresolvedRasterImages === 0 &&
    (page.hasCmyk || page.hasGray || page.hasSpot);
  return resolutionPass && colorPass && page.referencedGtLayerNames.length === 0;
}