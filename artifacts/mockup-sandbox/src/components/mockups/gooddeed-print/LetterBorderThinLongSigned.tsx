import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// PRINT (signed GoodDeed) twin of LetterBorderThinLong: long name/title stress
// test, with the GoodTunes logo swapped for the holographic sticker placement
// guide.
export function LetterBorderThinLongSigned() {
  return (
    <CertStage
      paper="letter"
      frame="bordered"
      art={GUITAR}
      insetIn={0.125}
      bleedIn={0.125}
      frameRevealWin={[7.5, 9.5]}
      longLockup
      signed
      sample={{
        recipient: "Maximilian Aleksandrov-Castellanos",
        title: "Songs from the Edge of a Long Forgotten Summer",
        num: "1287",
      }}
    />
  );
}
