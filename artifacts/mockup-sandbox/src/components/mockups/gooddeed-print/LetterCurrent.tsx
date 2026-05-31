import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function LetterCurrent() {
  return <CertStage paper="letter" frame="navy" art={GUITAR} />;
}
