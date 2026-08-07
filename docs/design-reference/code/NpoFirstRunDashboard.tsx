// NpoFirstRunDashboard — the same day-one empty-state NPO dashboard as
// NpoFirstRun, but WITHOUT the welcome modal, so the two can sit
// side-by-side on the canvas: one with the prompt, one without.
import { NpoFirstRun } from './NpoFirstRun';

export function NpoFirstRunDashboard() {
  return <NpoFirstRun showWelcome={false} />;
}

export default NpoFirstRunDashboard;
