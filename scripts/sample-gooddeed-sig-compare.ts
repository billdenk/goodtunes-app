// Task #678 — Signature-placement comparison for Bill.
//
// Bill is deciding how the signature + "William E. Denk" block should
// behave when a super-long recipient name and/or album title forces the
// "This GoodDeed® certifies…" headline onto a second line.
//
// Two placement strategies, each rendered with a normal (one-line) and a
// long (two-line) headline so the trade-off is visible:
//   - "dynamic": signature follows the headline; a 2nd line pushes the
//     signature + name down.
//   - "fixed":   signature sits at a permanent slot ~1.6 lines below the
//     headline top — a one-line headline shows a small gap, a two-line
//     headline tucks under it.
//
// Letter only (that's the size under review). Dev server must be running
// on PORT so the template can fetch artwork.
//
// Usage: tsx scripts/sample-gooddeed-sig-compare.ts
import fs from "node:fs";
import path from "node:path";
import { renderGoodDeedPdf } from "../server/goodDeedPrintTemplate";

const SAMPLE_ALBUM_ID = "5c0eef6b-c75d-487c-a789-034a84e5738e"; // Visionary Apothecary — Johanna Stahley
const MOCK_SEQUENCE = 42;
const MOCK_QR = "https://goodtunes.music/g/k7m3qp9x2v";

// Short name → one-line headline; long name → forces a two-line headline.
const SHORT_NAME = "Alex Rivera";
const LONG_NAME = "Alexandria Catherine Worthington-Montgomery III";

const variants: Array<{
  file: string;
  recipientName: string;
  sigPlacement: "dynamic" | "fixed";
}> = [
  { file: "compare-1-asis-1line.pdf", recipientName: SHORT_NAME, sigPlacement: "dynamic" },
  { file: "compare-2-dynamic-2line.pdf", recipientName: LONG_NAME, sigPlacement: "dynamic" },
  { file: "compare-3-fixed-1line.pdf", recipientName: SHORT_NAME, sigPlacement: "fixed" },
  { file: "compare-3-fixed-2line.pdf", recipientName: LONG_NAME, sigPlacement: "fixed" },
];

async function main() {
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  for (const v of variants) {
    const pdf = await renderGoodDeedPdf(
      {
        albumId: SAMPLE_ALBUM_ID,
        sequenceNumber: MOCK_SEQUENCE,
        recipientName: v.recipientName,
        qrPayload: MOCK_QR,
        paperSize: "letter",
      },
      { sigPlacement: v.sigPlacement },
    );
    const file = path.join(outDir, v.file);
    fs.writeFileSync(file, pdf);
    console.log(`Wrote ${file} (${pdf.length} bytes)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
