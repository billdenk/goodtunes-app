import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// A4 sheet, approved US 7.5:9.5 layout. Mat opening = 180x228mm centered (dashed).
// Orange border STRADDLES the opening: 3mm OUTSIDE the dots + 6mm INSIDE = a 9mm
// band. Artwork fills to the orange's inner edge (168x216mm). Orange outer edge
// = 186x234mm (3mm bleed past the opening).
export function A4BorderDeep() {
  return (
    <CertStage
      paper="a4"
      layout="letter"
      frame="bordered"
      art={GUITAR}
      bleedIn={0.354331}
      matBoxIn={[6.614173, 8.503937]}
      frameRevealWin={[7.086614, 8.976378]}
    />
  );
}
