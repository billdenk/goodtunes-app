// PressAreasCenterLabelTemplate — Printed-areas study tab 1 of 4.
// The MRP 12" center-label TEMPLATE (12-LBL100M-2) with the measured zones
// drawn on: the view the press verifies at ingestion time.
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import gtPreviewTemplate from '../assets/gt-preview-template-circle.png';

export const CENTER_LABEL_TEMPLATE_SPEC: StudySpec = {
  title: 'Template.', titleRest: 'Center labels 12″',
  caption: '12-LBL100M-2 · R-091125 · detected — 2 pages → 2 areas',
  shape: 'circle',
  defaultZone: 'safe',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: '103 mm — art must reach', inset: '0%' },
    { id: 'cut', word: 'Cut', detail: '100 mm — trimmed edge', inset: '3.5%' },
    { id: 'safe', word: 'Safe', detail: '95 mm — text stays inside', inset: '8%' },
    { id: 'hole', word: 'Hole', detail: '7 mm punched — keep text clear around it', centered: ['9%', '22%'] },
  ],
  panels: [
    { label: 'Side A', sub: 'Page 1', img: gtPreviewTemplate },
    { label: 'Side B', sub: 'Page 2', img: gtPreviewTemplate },
  ],
};

export default function PressAreasCenterLabelTemplate() {
  return <PrintedAreasStudy spec={CENTER_LABEL_TEMPLATE_SPEC} />;
}
