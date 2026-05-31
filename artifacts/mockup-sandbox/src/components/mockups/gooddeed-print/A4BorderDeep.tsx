import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// A4 (EU) — Path B. Mat opening 180x267mm centered = an even 15mm mount all
// around (dashed pink line). Orange border STRADDLES the opening: 6mm INSIDE
// the dots + 3mm OUTSIDE = a 9mm band; album art fills to the orange's inner
// edge. Square art + a taller navy band so the cert fills the A4 mat evenly.
export function A4BorderDeep() {
  return (
    <CertStage
      paper="a4"
      frame="bordered"
      art={GUITAR}
      insetIn={0.236220}
      bleedIn={0.118110}
      matBoxIn={[7.086614, 10.511811]}
      frameRevealWin={[7.086614, 10.511811]}
    />
  );
}
