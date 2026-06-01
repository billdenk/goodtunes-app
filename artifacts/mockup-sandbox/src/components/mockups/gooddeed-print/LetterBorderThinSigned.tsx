import { CertStage } from "./_CertPrint";

const GUITAR = "/__mockup/images/album-guitar-as-a-voice.png";

// PRINT (signed GoodDeed) twin of LetterBorderThin: identical layout, but the
// GoodTunes logo is swapped for the holographic sticker placement guide.
export function LetterBorderThinSigned() {
  return <CertStage paper="letter" frame="bordered" art={GUITAR} insetIn={0.125} bleedIn={0.125} frameRevealWin={[7.5, 9.5]} lowerCreditLockup signed />;
}
