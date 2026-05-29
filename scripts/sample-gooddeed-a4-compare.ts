// Task #678 — A4 layout comparison for Bill.
//
// "A4 as it is today" is the OLD vertically-centred A4 stack with NO mat
// border (captured separately as exports/a4-today.pdf before the default
// border landed). This script renders the NEW A4 — the same principles we
// arrived at on Letter: enlarged avatar + centred artist block, indented
// dynamic headline, fixed signature slot above the founder name, the
// provenance demoted to a small bottom footnote, the QR + "GoodDeed®"
// caption locked to the footnote's last-line baseline, and the ⅛" navy
// bleed border — applied to A4 via the forceNewLayout preview flag.
//
// Usage (dev server must be running on PORT so artwork can be fetched):
//   tsx scripts/sample-gooddeed-a4-compare.ts
import fs from "node:fs";
import path from "node:path";
import { renderGoodDeedPdf } from "../server/goodDeedPrintTemplate";

const SAMPLE_ALBUM_ID = "5c0eef6b-c75d-487c-a789-034a84e5738e"; // Visionary Apothecary — Johanna Stahley
const MOCK_RECIPIENT = "Alex Rivera";
const MOCK_SEQUENCE = 42;
const MOCK_QR = "https://goodtunes.music/g/k7m3qp9x2v";

async function main() {
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const pdf = await renderGoodDeedPdf(
    {
      albumId: SAMPLE_ALBUM_ID,
      sequenceNumber: MOCK_SEQUENCE,
      recipientName: MOCK_RECIPIENT,
      qrPayload: MOCK_QR,
      paperSize: "a4",
    },
    { forceNewLayout: true }, // matBorderPt defaults to the ⅛" production value
  );
  const file = path.join(outDir, "a4-new.pdf");
  fs.writeFileSync(file, pdf);
  console.log(`Wrote ${file} (${pdf.length} bytes)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
