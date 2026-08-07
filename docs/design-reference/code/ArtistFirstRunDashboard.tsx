// ArtistFirstRunDashboard — the same day-one empty-state dashboard as
// ArtistFirstRun, but WITHOUT the welcome modal, so the two can sit
// side-by-side on the canvas: one with the prompt, one without.
import { ArtistFirstRun } from './ArtistFirstRun';

export function ArtistFirstRunDashboard() {
  return <ArtistFirstRun showWelcome={false} />;
}

export default ArtistFirstRunDashboard;
