import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// Stress-test of the thin-line US Letter cert: a long recipient name AND a long
// album title, so we can see how the headline wraps and where the signature
// lands beneath it.
export function LetterBorderThinLong() {
  return (
    <CertStage
      paper="letter"
      frame="bordered"
      art={GUITAR}
      insetIn={0.125}
      bleedIn={0.125}
      frameRevealWin={[7.5, 9.5]}
      sample={{
        recipient: "Maximilian Aleksandrov-Castellanos",
        title: "Songs from the Edge of a Long Forgotten Summer",
        num: "1287",
      }}
    />
  );
}
