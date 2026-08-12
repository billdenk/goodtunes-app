// PressAreasCenterLabelNiina — Printed-areas study tab 2 of 4.
// Niina Soleil's FINISHED center-label art (Californialand) with the same
// measured zones drawn over it: the seed of the customer/artist fit-check
// view — drop art on an area, see instantly whether it reaches bleed and
// keeps text inside safe.
// Shared device lives in _PrintedAreasStudy.tsx — edit it once for all tabs.

import PrintedAreasStudy, { type StudySpec } from './_PrintedAreasStudy';
import sideA from '../assets/niina-label-1.png';
import sideB from '../assets/niina-label-2.png';

export const CENTER_LABEL_NIINA_SPEC: StudySpec = {
  title: 'Proof.', titleRest: 'Center labels 12″',
  caption: 'Niina Soleil, Californialand · 12-LBL100M-2 zones · 2 pages → 2 areas',
  shape: 'circle',
  defaultZone: 'safe',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: '103 mm — art must reach', inset: '0%', status: 'ok' },
    { id: 'cut', word: 'Cut', detail: '100 mm — trimmed edge', inset: '3.5%', status: 'ok' },
    { id: 'safe', word: 'Safe', detail: '95 mm — text stays inside', inset: '8%', status: 'ok' },
    { id: 'hole', word: 'Hole', detail: '7 mm punched — keep text clear around it', centered: ['9%', '22%'], status: 'ok' },
  ],
  panels: [
    { label: 'Side A', sub: 'Welcome to the Dream — 33⅓ RPM', img: sideA },
    { label: 'Side B', sub: 'In the Darkness of the Desert — 33⅓ RPM', img: sideB },
  ],
};

export default function PressAreasCenterLabelNiina() {
  return <PrintedAreasStudy spec={CENTER_LABEL_NIINA_SPEC} />;
}
