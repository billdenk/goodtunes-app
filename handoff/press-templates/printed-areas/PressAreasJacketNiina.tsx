// PressAreasJacketNiina — Printed-areas study tab 6 of 6.
// Niina Soleil's FINISHED Californialand jacket art on the 12-JKTSG3D-100
// zones: one continuous painting across back · spine · front.
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import spread from '../assets/niina-jacket.png';

const SPEC: StudySpec = {
  title: 'Proof.', titleRest: 'Jacket 12″',
  caption: 'Niina Soleil, Californialand · 12-JKTSG3D-100 zones · 1 page → 1 spread',
  shape: 'square',
  defaultZone: 'safety',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: 'extend background art to this line', inset: '0%', status: 'ok' },
    { id: 'cut', word: 'Cut', detail: 'trimmed edge', inset: '1.8%', status: 'ok' },
    { id: 'safety', word: 'Safety', detail: 'keep all important elements inside', inset: '4.5% 3%', status: 'attention' },
    { id: 'fold', word: 'Fold', detail: 'spine scores — back · spine · front', fold: true, status: 'ok' },
    { id: 'foil', word: 'Foil', detail: 'foil stamping stays 1 in from edges, folds and flaps', inset: '8% 4.5%', status: 'ok' },
  ],
  panels: [
    { label: 'Spread', sub: 'One painting, wrapped — Californialand title rides the front', img: spread, aspect: 1.948, foldLines: ['49.9%', '50.7%'],
      flag: {
        headline: 'We noticed the title touching the safety line on the front.',
        detail: 'The tail of the “D” in Californialand crosses the safety line at the front’s right edge — a small shift at the press could clip it. Because the painting runs edge to edge, our team would review this with the artist.',
      } },
  ],
};

export default function PressAreasJacketNiina() {
  return <PrintedAreasStudy spec={SPEC} />;
}
