import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// A4 sheet, approved US 7.5:9.5 layout. Mat opening = 180x228mm centered (dashed).
// Orange border STRADDLES the opening: 3mm OUTSIDE the dots + 3mm INSIDE = a 6mm
// band. Artwork fills to the orange's inner edge (174x222mm). Orange outer edge
// = 186x234mm (3mm bleed past the opening).
export function A4BorderThin() {
  return (
    <CertStage
      paper="a4"
      layout="letter"
      frame="bordered"
      art={GUITAR}
      bleedIn={0.236220}
      matBoxIn={[6.850394, 8.740157]}
      frameRevealWin={[7.086614, 8.976378]}
    />
  );
}
