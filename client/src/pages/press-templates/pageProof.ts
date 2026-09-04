import type { GtLayer } from './gtOverlayEngine';
import type { PdfPageAnalysis } from './pdfPageAnalysis';

export type ProofPage = {
  wMm: number | null;
  hMm: number | null;
  gtLayerNames: string[];
  analysis?: PdfPageAnalysis | null;
};

export type ProofTemplatePage = { layers: GtLayer[] };
export type PageVerdict = 'untested' | 'fail' | 'pass';

export function pageVerdicts(
  templates: ProofTemplatePage[],
  artwork: ProofPage[],
  pageCountMismatch: boolean,
  resolutionTone: (analysis: PdfPageAnalysis) => 'pass' | 'fail' | 'na',
  colorTone: (analysis: PdfPageAnalysis) => 'pass' | 'fail' | 'na',
): PageVerdict[] {
  return templates.map((template, index) => {
    const art = artwork[index];
    if (!art || pageCountMismatch) return art ? 'fail' : 'untested';
    if (art.wMm === null || art.hMm === null || !art.analysis) return 'untested';
    if (art.gtLayerNames.length) return 'fail';
    const bleed = template.layers.find((layer) => layer.zone === 'Bleed' && layer.kind === 'line')
      ?? template.layers.find((layer) => layer.zone === 'Bleed');
    if (bleed) {
      const covers = (w: number, h: number) => art.wMm! >= w - 1 && art.hMm! >= h - 1;
      if (!covers(bleed.wMm, bleed.hMm) && !covers(bleed.hMm, bleed.wMm)) return 'fail';
    }
    const resolution = resolutionTone(art.analysis);
    const color = colorTone(art.analysis);
    if (resolution === 'fail' || color === 'fail') return 'fail';
    if (resolution === 'na' || color === 'na') return 'untested';
    return 'pass';
  });
}

export const aggregatePagePass = (states: PageVerdict[]) =>
  states.length > 0 && states.every((state) => state === 'pass');