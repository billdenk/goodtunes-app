// Comparison frame: the full-bleed GoodDeed Story with the DARK-navy glass chip.
// Renders the single-source-of-truth StoryCard (Stories.tsx) so it can't drift —
// only the chip style differs.
import "./_group.css";
import { StoryCard } from "./Stories";

export function StoryChipDark() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <StoryCard chipStyle="dark" />
    </div>
  );
}
