// ALTERNATE-COVER STUDY: the exact same StoryCard from Stories.tsx (single
// source of truth — no layout drift) fed a LIGHTER, warmer album cover
// ("California Way" by TOMMYGUNN) so Bill can see how the full-bleed art →
// navy fade and the dark-navy chip read against a bright photo instead of the
// dark "Guitar as a Voice" cover.
import "./_group.css";
import { StoryCard, type StoryData } from "./Stories";

const CALIFORNIA_WAY: StoryData = {
  art: "/__mockup/images/album-california-way.png",
  ownerPhoto: "/__mockup/images/sample-owner-photo.png",
  album: { title: "California Way", artist: "TOMMYGUNN" },
  ownerName: "Jordan Ellis",
  certNumStr: "12",
};

export function StoriesCaliforniaWay() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <StoryCard data={CALIFORNIA_WAY} />
    </div>
  );
}
