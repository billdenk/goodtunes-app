// PressAreasJacketTemplate — Printed-areas study tab 5 of 6.
// The MRP 12" Single 3D Jacket TEMPLATE (12-JKTSG3D-100, gusseted pocket,
// 3.5mm spine): one wide spread — back · spine · front — so the fold zone
// becomes the two spine score lines, and a jacket-only zone appears:
// foil-stamping safety (1 inch clear of edges, folds and flaps).
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import spread from '../assets/tpl-jacket.png';

export const JACKET_TEMPLATE_SPEC: StudySpec = {
  title: 'Template.', titleRest: 'Jacket 12″',
  caption: '12-JKTSG3D-100 · single 3D, gusseted pocket, 3.5 mm spine · 1 page → 1 spread',
  shape: 'square',
  defaultZone: 'safety',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: 'extend background art to this line', inset: '0%' },
    { id: 'cut', word: 'Cut', detail: 'trimmed edge', inset: '1.8%' },
    { id: 'safety', word: 'Safety', detail: 'keep all important elements inside', inset: '4.5% 3%' },
    { id: 'fold', word: 'Fold', detail: 'spine scores — back · spine · front', fold: true },
    { id: 'foil', word: 'Foil', detail: 'foil stamping stays 1 in from edges, folds and flaps', inset: '8% 4.5%' },
  ],
  panels: [
    { label: 'Spread', sub: 'Back · spine · front — one sheet, wrapped', img: spread, aspect: 1.864, foldLines: ['49.9%', '50.7%'] },
  ],
};

export default function PressAreasJacketTemplate() {
  return <PrintedAreasStudy spec={JACKET_TEMPLATE_SPEC} />;
}
