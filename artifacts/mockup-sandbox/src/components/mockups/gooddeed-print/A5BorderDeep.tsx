import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

export function A5BorderDeep() {
  return <CertStage paper="a5" frame="bordered" art={GUITAR} insetIn={0.25} bleedIn={0.125} />;
}
