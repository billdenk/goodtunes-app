// PressAreasInnerSleeveTemplate — Printed-areas study tab 3 of 4.
// The MRP 12" inner sleeve TEMPLATE (12-SLVBD-100, board-weight Euro) with
// its zones: square panels, so the rings become frames, plus a fold/score
// edge and the optional die-cut center hole.
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import front from '../assets/tpl-sleeve-front.png';
import back from '../assets/tpl-sleeve-back.png';

export const INNER_SLEEVE_TEMPLATE_SPEC: StudySpec = {
  title: 'Template.', titleRest: 'Inner sleeve 12″',
  caption: '12-SLVBD-100 · board-weight Euro · detected — 1 page → 2 panels',
  shape: 'square',
  defaultZone: 'safety',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: 'extend background art to this line', inset: '0%' },
    { id: 'cut', word: 'Cut', detail: 'trimmed edge', inset: '2.5%' },
    { id: 'safety', word: 'Safety', detail: 'keep all important elements inside', inset: '6%' },
    { id: 'fold', word: 'Fold', detail: 'score line — front and back meet here', fold: true },
    { id: 'diecut', word: 'Die-cut', detail: 'optional center hole — label shows through', centered: ['30%', '36%'] },
  ],
  panels: [
    { label: 'Front', sub: 'Top load — head at the fold', img: front, foldEdge: 'bottom' },
    { label: 'Back', sub: 'Shares the fold with the front', img: back, foldEdge: 'top', allowFlip: true },
  ],
};

export default function PressAreasInnerSleeveTemplate() {
  return <PrintedAreasStudy spec={INNER_SLEEVE_TEMPLATE_SPEC} />;
}
