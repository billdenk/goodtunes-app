import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// PRINT (signed GoodDeed) twin of A4BorderThin: identical layout, but the
// GoodTunes logo is swapped for the holographic sticker placement guide.
export function A4BorderThinSigned() {
  return (
    <CertStage
      paper="a4"
      frame="bordered"
      art={GUITAR}
      insetIn={0.118110}
      bleedIn={0.118110}
      matBoxIn={[7.086614, 10.511811]}
      frameRevealWin={[7.086614, 10.511811]}
      signed
    />
  );
}
