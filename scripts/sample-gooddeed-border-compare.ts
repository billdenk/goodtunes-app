// Task #678 — Mat bleed-border comparison for Bill.
//
// The inner design is sized to the mat opening exactly (7.5"×9.5" on Letter),
// so a frame that's slightly off-centre could show a sliver of white paper.
// Bill wants a navy (#00062B, same as the band) border painted just OUTSIDE
// the mat edge to absorb that misalignment. He's deciding between 1/8" and
// 1/4" thickness. The inner design does NOT change — this only fills margin.
//
// Letter only. Dev server must be running on PORT so artwork can be fetched.
//
// Usage: tsx scripts/sample-gooddeed-border-compare.ts
import fs from "node:fs";
import path from "node:path";
import { renderGoodDeedPdf } from "../server/goodDeedPrintTemplate";

const SAMPLE_ALBUM_ID = "5c0eef6b-c75d-487c-a789-034a84e5738e"; // Visionary Apothecary — Johanna Stahley
const MOCK_SEQUENCE = 42;
const MOCK_RECIPIENT = "Alex Rivera";
const MOCK_QR = "https://goodtunes.music/g/k7m3qp9x2v";

const PT_PER_INCH = 72;
const variants: Array<{ file: string; inches: number }> = [
  { file: "border-eighth.pdf", inches: 1 / 8 },
  { file: "border-quarter.pdf", inches: 1 / 4 },
];

async function main() {
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  for (const v of variants) {
    const pdf = await renderGoodDeedPdf(
      {
        albumId: SAMPLE_ALBUM_ID,
        sequenceNumber: MOCK_SEQUENCE,
        recipientName: MOCK_RECIPIENT,
        qrPayload: MOCK_QR,
        paperSize: "letter",
      },
      { matBorderPt: v.inches * PT_PER_INCH },
    );
    fs.writeFileSync(path.join(outDir, v.file), pdf);
    console.log(`Wrote ${v.file} (${(v.inches * PT_PER_INCH).toFixed(2)}pt border, ${pdf.length} bytes)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
