import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function LetterBorderThin() {
  return <CertStage paper="letter" frame="bordered" art={GUITAR} insetIn={0.125} bleedIn={0.125} />;
}
