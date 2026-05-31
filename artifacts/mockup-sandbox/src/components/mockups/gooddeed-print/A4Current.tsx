import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function A4Current() {
  return <CertStage paper="a4" frame="navy" art={GUITAR} frameRevealWin={[7.77, 11.19]} />;
}
