// PressAreasInnerSleeveNiina — Printed-areas study tab 4 of 4.
// Niina Soleil's FINISHED inner-sleeve art (Californialand) on the
// 12-SLVBD-100 zones: sunburst front, credits back.
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import front from '../assets/niina-sleeve-front.png';
import back from '../assets/niina-sleeve-back.png';
import backFixed from '../assets/niina-sleeve-back-fixed.png';

const SPEC: StudySpec = {
  title: 'Proof.', titleRest: 'Inner sleeve 12″',
  caption: 'Niina Soleil, Californialand · 12-SLVBD-100 zones · 1 page → 2 panels',
  shape: 'square',
  defaultZone: 'safety',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: 'extend background art to this line', inset: '0%', status: 'ok' },
    { id: 'cut', word: 'Cut', detail: 'trimmed edge', inset: '2.5%', status: 'ok' },
    { id: 'safety', word: 'Safety', detail: 'keep all important elements inside', inset: '6%', status: 'attention' },
    { id: 'fold', word: 'Fold', detail: 'score line — front and back meet here', fold: true, status: 'attention' },
    { id: 'diecut', word: 'Die-cut', detail: 'optional center hole — label shows through', centered: ['30%', '36%'], status: 'ok' },
  ],
  panels: [
    { label: 'Front', sub: 'Sunburst — cream field reaches bleed', img: front, foldEdge: 'bottom' },
    { label: 'Back', sub: 'Credits — “This record was made by humans”', img: back, foldEdge: 'top', fixImg: backFixed,
      flag: {
        headline: 'We noticed type outside the safety area on the Back.',
        detail: '“THIS RECORD WAS MADE BY HUMANS” and the written/produced credits sit between the safety line and the trim edge — a small shift at the press could clip them. The “Manufactured by Memphis Record Pressing” line also crosses onto the fold.',
      } },
  ],
};

export default function PressAreasInnerSleeveNiina() {
  return <PrintedAreasStudy spec={SPEC} />;
}
