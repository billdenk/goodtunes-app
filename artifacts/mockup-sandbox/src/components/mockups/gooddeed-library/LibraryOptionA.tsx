import { LibraryGrid, MINT, Phone } from "./_shared";

// OPTION A — GoodDeed number as a mint pill ON the artwork (bottom-left).
// Single copy shows "#310"; multi-owned shows "#310 +2". The number is visible
// at a glance on every owned album without opening a menu, and it sits over the
// art the way a collector's number sits on a sleeve.

export default function LibraryOptionA() {
  return (
    <Phone title="Home">
      <p style={{ margin: "0 20px 4px", fontSize: 13, color: MINT, fontWeight: 600 }}>
        Option A — number pill on the cover
      </p>
      <LibraryGrid treatment="badge" />
    </Phone>
  );
}
