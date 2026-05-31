import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// A4 sheet, but the cert keeps the approved US 7.5:9.5 layout (not stretched to
// A4's taller mat). Mat opening = 180x228mm centered. Artwork = 180x228mm: flush
// to the opening, 0mm bleed.
export function A4Current() {
  return (
    <CertStage
      paper="a4"
      layout="letter"
      frame="navy"
      art={GUITAR}
      matBoxIn={[7.0866, 8.9764]}
      frameRevealWin={[7.0866, 8.9764]}
    />
  );
}
