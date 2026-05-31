import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function A4BorderThin() {
  return <CertStage paper="a4" frame="bordered" art={GUITAR} insetIn={0.125} bleedIn={0.125} frameRevealWin={[7.77, 11.19]} />;
}
