// Task #678 — Render a sample GoodDeed certificate PDF with mock data.
//
// One-off helper for Bill to *see* the printed GoodDeed certificate as
// it would actually print. It calls the SAME locked print template the
// fan-print and press-print paths use (renderGoodDeedPdf) with hard-coded
// mock recipient/sequence/QR data, so the output matches what fans and
// admins really get — no design changes here.
//
// We point it at a real catalog album so the artwork, artist, title and
// genre render exactly as they would in production (the dev server must
// be running on PORT so the template can fetch the artwork). We write
// both a Letter and an A4 sample, since paper size varies by country.
//
// Usage:
//   tsx scripts/sample-gooddeed-cert.ts
import fs from "node:fs";
import path from "node:path";
import { renderGoodDeedPdf } from "../server/goodDeedPrintTemplate";

// A real catalog album with genre + object-storage artwork so the
// sample looks fully populated.
const SAMPLE_ALBUM_ID = "5c0eef6b-c75d-487c-a789-034a84e5738e"; // Visionary Apothecary — Johanna Stahley

// Believable mock cert data.
const MOCK_RECIPIENT = "Alex Rivera";
const MOCK_SEQUENCE = 42;
const MOCK_QR = "https://goodtunes.music/g/k7m3qp9x2v";

async function main() {
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const sizes: Array<"letter" | "a4"> = ["letter", "a4"];
  for (const paperSize of sizes) {
    const pdf = await renderGoodDeedPdf({
      albumId: SAMPLE_ALBUM_ID,
      sequenceNumber: MOCK_SEQUENCE,
      recipientName: MOCK_RECIPIENT,
      qrPayload: MOCK_QR,
      paperSize,
    });
    const file = path.join(outDir, `sample-gooddeed-certificate-${paperSize}.pdf`);
    fs.writeFileSync(file, pdf);
    console.log(`Wrote ${file} (${pdf.length} bytes)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
