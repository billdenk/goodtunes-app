import { LibraryGrid, Phone, T } from "./_shared";

// BASELINE — the library exactly as it ships today (Collection.tsx Home grid +
// AlbumCard.tsx). The GoodDeed number is NOT on the card face: multi-owned
// albums get a "×N" badge, and the number is only reachable by opening the
// per-card "…" menu → "View GoodDeed®". This is the gap the options below fill.

export default function LibraryCurrent() {
  return (
    <Phone title="Home">
      <p style={{ margin: "0 20px 4px", fontSize: 13, color: T.faint }}>
        Today: the number is hidden behind the “…” menu.
      </p>
      <LibraryGrid treatment="none" />
    </Phone>
  );
}
