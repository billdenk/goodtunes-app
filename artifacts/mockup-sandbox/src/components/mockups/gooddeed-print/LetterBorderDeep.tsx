import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function LetterBorderDeep() {
  return <CertStage paper="letter" frame="bordered" art={GUITAR} insetIn={0.25} bleedIn={0.125} frameRevealWin={[7.5, 9.5]} />;
}
