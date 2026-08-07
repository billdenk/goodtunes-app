// PressFirstRunDashboard — the same day-one empty-state press dashboard as
// PressFirstRun, but WITHOUT the welcome modal, so the two can sit
// side-by-side on the canvas: one with the prompt, one without.
import { PressFirstRun } from './PressFirstRun';

export function PressFirstRunDashboard() {
  return <PressFirstRun showWelcome={false} />;
}

export default PressFirstRunDashboard;
