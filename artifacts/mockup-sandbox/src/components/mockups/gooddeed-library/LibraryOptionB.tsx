import { LibraryGrid, MINT, Phone } from "./_shared";

// OPTION B — GoodDeed number as a third metadata line UNDER the title (mint).
// Keeps the artwork completely clean. Single copy reads "GoodDeed #310";
// multi-owned lists "GoodDeeds #310 · #311 · #312" (summarised past three).

export default function LibraryOptionB() {
  return (
    <Phone title="Home">
      <p style={{ margin: "0 20px 4px", fontSize: 13, color: MINT, fontWeight: 600 }}>
        Option B — number under the title
      </p>
      <LibraryGrid treatment="meta" />
    </Phone>
  );
}
