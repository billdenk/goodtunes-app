import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function A4BorderDeep() {
  return <CertStage paper="a4" frame="bordered" art={GUITAR} insetIn={0.25} bleedIn={0.125} frameRevealIn={0.25} />;
}
