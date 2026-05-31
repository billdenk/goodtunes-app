import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// A4 (EU) — Path B: cert RE-PROPORTIONED to fill the A4 mat evenly. Mat opening
// 180x267mm centered on the A4 sheet = an even 15mm mount on all four sides
// (dashed pink line). The album art stays a perfect square; the navy band grows
// taller so the whole cert is A4-shaped. Navy baseline (no orange): content
// fills the opening, navy bleeds 1/8" past it (the safety bleed).
export function A4Current() {
  return (
    <CertStage
      paper="a4"
      frame="navy"
      art={GUITAR}
      matBoxIn={[7.086614, 10.511811]}
      frameRevealWin={[7.086614, 10.511811]}
    />
  );
}
