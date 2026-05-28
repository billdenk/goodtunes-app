import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Footer,
  Header,
  ImageRun,
  PageBreak,
  LevelFormat,
} from "docx";

const NAVY = "00062B";
const MINT = "4AFFCA";
const BLUE = "319ED8";
const INK = "111111";
const MUTED = "555555";
const TABLE_HEADER_BG = "00062B";
const TABLE_ALT_BG = "F3F4F8";

const LOGO_PATH = "attached_assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
const OUT_PATH = "SoulChef-Escapism-Instrumentals-Estimate.docx";

const today = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const FONT = "Calibri";

function p(text, opts = {}) {
  const {
    bold = false,
    italics = false,
    size = 22,
    color = INK,
    align = AlignmentType.LEFT,
    spacingBefore = 0,
    spacingAfter = 80,
    children,
  } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { before: spacingBefore, after: spacingAfter },
    children:
      children ??
      [new TextRun({ text, bold, italics, size, color, font: FONT })],
  });
}

function richP(runs, opts = {}) {
  const { align = AlignmentType.LEFT, spacingBefore = 0, spacingAfter = 80 } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { before: spacingBefore, after: spacingAfter },
    children: runs.map((r) =>
      new TextRun({
        text: r.text,
        bold: !!r.bold,
        italics: !!r.italics,
        size: r.size ?? 22,
        color: r.color ?? INK,
        font: FONT,
      }),
    ),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 40, color: NAVY, font: FONT }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 28, color: NAVY, font: FONT }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 24, color: NAVY, font: FONT }),
    ],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      bottom: { color: "D0D4DE", style: BorderStyle.SINGLE, size: 6, space: 1 },
    },
  });
}

function bullet(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [{ text }];
  return new Paragraph({
    spacing: { before: 20, after: 60 },
    indent: { left: 360, hanging: 200 },
    children: [
      new TextRun({ text: "•  ", size: 22, color: NAVY, font: FONT, bold: true }),
      ...runs.map((r) =>
        new TextRun({
          text: r.text,
          bold: !!r.bold,
          italics: !!r.italics,
          size: r.size ?? 22,
          color: r.color ?? INK,
          font: FONT,
        }),
      ),
    ],
  });
}

function numbered(n, text) {
  const runs = Array.isArray(text) ? text : [{ text }];
  return new Paragraph({
    spacing: { before: 20, after: 60 },
    indent: { left: 420, hanging: 260 },
    children: [
      new TextRun({ text: `${n}.  `, size: 22, color: NAVY, font: FONT, bold: true }),
      ...runs.map((r) =>
        new TextRun({
          text: r.text,
          bold: !!r.bold,
          italics: !!r.italics,
          size: r.size ?? 22,
          color: r.color ?? INK,
          font: FONT,
        }),
      ),
    ],
  });
}

function cellRuns(runs, { bold = false, color = INK, align = AlignmentType.LEFT } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before: 40, after: 40 },
    children: runs.map((r) =>
      new TextRun({
        text: r.text,
        bold: r.bold ?? bold,
        italics: !!r.italics,
        size: r.size ?? 20,
        color: r.color ?? color,
        font: FONT,
      }),
    ),
  });
}

function cell(text, opts = {}) {
  return cellRuns([{ text }], opts);
}

function headerCell(text, { align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG, color: "auto" },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
            color: "FFFFFF",
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

function bodyCell(content, { align = AlignmentType.LEFT, alt = false } = {}) {
  let runs;
  if (typeof content === "string") {
    runs = [{ text: content }];
  } else if (Array.isArray(content)) {
    runs = content;
  } else {
    runs = [content];
  }
  const paragraphs = [cellRuns(runs, { align })];
  return new TableCell({
    shading: alt
      ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG, color: "auto" }
      : undefined,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: paragraphs,
  });
}

function buildTable(headers, rows, { aligns = [] } = {}) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      headerCell(h, { align: aligns[i] ?? AlignmentType.LEFT })
    ),
  });
  const bodyRows = rows.map(
    (r, ri) =>
      new TableRow({
        children: r.map((c, i) =>
          bodyCell(c, { align: aligns[i] ?? AlignmentType.LEFT, alt: ri % 2 === 1 })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D0D4DE" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D4DE" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D0D4DE" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D0D4DE" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E5E8EE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E5E8EE" },
    },
  });
}

function accentBar() {
  return new Paragraph({
    spacing: { before: 0, after: 240 },
    border: {
      bottom: { color: MINT, style: BorderStyle.SINGLE, size: 24, space: 1 },
    },
  });
}

function coverHeader() {
  const logo = fs.readFileSync(LOGO_PATH);
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 200 },
      children: [
        new ImageRun({
          data: logo,
          type: "png",
          transformation: { width: 200, height: 121 },
        }),
      ],
    }),
    accentBar(),
  ];
}

const RIGHT = AlignmentType.RIGHT;
const LEFT = AlignmentType.LEFT;
const CENTER = AlignmentType.CENTER;

const children = [
  ...coverHeader(),
  h1('SoulChef — "Escapism: Instrumentals"'),
  p('Vinyl pressing estimate · Double LP (12" 2×LP, gatefold)', {
    size: 26,
    color: NAVY,
    bold: false,
    spacingAfter: 80,
  }),
  p(`Prepared by GoodTunes® · ${today}`, { color: MUTED, size: 20, spacingAfter: 20 }),
  p("Quote validity: 30 days from above date (vendor quotes valid through 6/26/26)", {
    color: MUTED,
    size: 20,
    spacingAfter: 240,
  }),
  divider(),

  // 1. What's covered
  h2("1. What's covered"),
  p(
    "Two pressing partners (MRP and Hellbender), two run sizes (500 / 1,000), two color treatments (solid Color / Splatter). Below each vendor's list price we show GoodTunes' net to SoulChef — i.e., the price after any broker discount GoodTunes has negotiated on your behalf."
  ),
  p(
    "All prices in USD, per unit and run total. Includes pressed records, full-color jackets (gatefold on 2×LP), full-color labels, generic poly-lined inner sleeves, and shrinkwrap. Excludes shipping of finished goods to SoulChef, sales tax where applicable, optional add-ons (UPC barcode, printed inners, posters, obi, booklets, etc.), and test pressings."
  ),

  // 2. MRP
  h2("2. Memphis Record Pressing (MRP)"),
  p("Memphis, TN · 8–10 wk standard turnaround", { color: MUTED, size: 20, spacingAfter: 20 }),
  richP(
    [
      { text: "Broker discount to GoodTunes: " },
      { text: "0%", bold: true },
      { text: " (MRP quoted as flat retail) — list = net." },
    ],
    { spacingAfter: 160 },
  ),
  buildTable(
    ["Run", "Color (per unit / total)", "Splatter (per unit / total)"],
    [
      ["500", [{ text: "$82.15", bold: true }, { text: " / " }, { text: "$41,075", bold: true }],
              [{ text: "$89.65", bold: true }, { text: " / " }, { text: "$44,825", bold: true }]],
      ["1,000", [{ text: "$113.80", bold: true }, { text: " / " }, { text: "$113,800", bold: true }],
                [{ text: "$126.70", bold: true }, { text: " / " }, { text: "$126,700", bold: true }]],
    ],
    { aligns: [LEFT, RIGHT, RIGHT] },
  ),
  p("Notes:", { bold: true, spacingBefore: 200, spacingAfter: 40 }),
  bullet("Splatter = translucent base + up to 3 splatter colors."),
  bullet("±10% production tolerance on quantity (runs ≤ 1,000)."),
  bullet("UPC barcode add-on: +$35."),
  bullet("Full MRP color library available (EcoMix, Translucent, Opaque, Neon/Glow, Smoke Blends, Cream Blends)."),

  // 3. Hellbender
  h2("3. Hellbender Vinyl"),
  p("Pittsburgh, PA · 10–12 wk turnaround · boutique / collectible focus", {
    color: MUTED,
    size: 20,
    spacingAfter: 20,
  }),
  richP(
    [
      { text: "Broker discount to GoodTunes: " },
      { text: "10%", bold: true },
      { text: " off list — passed through to SoulChef below." },
    ],
    { spacingAfter: 160 },
  ),
  buildTable(
    ["Run", "Color · list / net to SoulChef", "Splatter · list / net to SoulChef"],
    [
      [
        "500",
        [
          { text: "$70.30 · " },
          { text: "$63.27", bold: true },
          { text: " / " },
          { text: "$31,635", bold: true },
        ],
        [
          { text: "$78.20 · " },
          { text: "$70.38", bold: true },
          { text: " / " },
          { text: "$35,190", bold: true },
        ],
      ],
      [
        "1,000",
        [
          { text: "$109.75 · " },
          { text: "$98.78", bold: true },
          { text: " / " },
          { text: "$98,775", bold: true },
        ],
        [
          { text: "$124.75 · " },
          { text: "$112.28", bold: true },
          { text: " / " },
          { text: "$112,275", bold: true },
        ],
      ],
    ],
    { aligns: [LEFT, RIGHT, RIGHT] },
  ),
  p("Notes:", { bold: true, spacingBefore: 200, spacingAfter: 40 }),
  bullet("Hellbender publishes 6 vinyl color groups (Black, House Mix, Translucent, Clear, Metallic, Opaque); splatter colors confirmed at quote time."),
  bullet("Audio specs and packaging extras coordinated through the assigned Hellbender PM; submissions are by shareable link (Dropbox / Google Drive)."),
  bullet("Hellbender includes gatefold (1- or 2-pocket) and wide-spine 2×LP jacket options on top of the standard package."),

  // 4. Side-by-side
  h2('4. Side-by-side spread (Color, "what does it cost to make a record")'),
  buildTable(
    ["Run", "MRP per unit", "Hellbender net per unit", "Lower-cost partner"],
    [
      ["500", "$82.15", [{ text: "$63.27", bold: true }], "Hellbender (−$18.88)"],
      ["1,000", "$113.80", [{ text: "$98.78", bold: true }], "Hellbender (−$15.02)"],
    ],
    { aligns: [LEFT, RIGHT, RIGHT, LEFT] },
  ),
  p("Splatter spread:", { spacingBefore: 200, spacingAfter: 80 }),
  buildTable(
    ["Run", "MRP per unit", "Hellbender net per unit", "Lower-cost partner"],
    [
      ["500", "$89.65", [{ text: "$70.38", bold: true }], "Hellbender (−$19.27)"],
      ["1,000", "$126.70", [{ text: "$112.28", bold: true }], "Hellbender (−$14.42)"],
    ],
    { aligns: [LEFT, RIGHT, RIGHT, LEFT] },
  ),
  p(
    "Hellbender is the cheaper press on every cell of this matrix today. MRP's trade-off is the faster lane (8–10 wk vs 10–12 wk) and a deeper published color catalog.",
    { spacingBefore: 160 },
  ),

  // 5. GoodDeed
  h2("5. The GoodDeed® opportunity"),
  p(
    "GoodDeed® is GoodTunes' artist-signed, numbered certificate that ships alongside any copy a fan opts to upgrade. The certificate carries the album art, the artist's signature, a hologram, a hand-numbered edition mark, and a QR code that links back to the fan's GoodTunes library — turning an ordinary record into a signed, scannable collectible."
  ),
  richP(
    [
      { text: "Cost stack per certificate", bold: true },
      { text: " (GoodTunes wholesale, all-in): the rung below already bundles printing, hologram, shrinkwrap, insertion into the record, and " },
      { text: "all three shipping legs", bold: true },
      { text: " (signing → printer → fan). The only additional line is the credit-card processing fee on the cert's retail price." },
    ],
    { spacingBefore: 120, spacingAfter: 160 },
  ),
  buildTable(
    ["Signed batch size", "Wholesale per cert"],
    [
      ["25 – 49", "$13.00"],
      ["50 – 99", "$12.00"],
      ["100 – 199", "$9.00"],
      ["200 – 299", "$7.00"],
      ["300+", "$6.00"],
    ],
    { aligns: [LEFT, RIGHT] },
  ),
  p("(25-unit minimum; below 25, the batch auto-refunds and doesn't print.)", {
    italics: true,
    color: MUTED,
    size: 20,
    spacingBefore: 100,
    spacingAfter: 200,
  }),

  h3("Worked example — 20% of fans upgrade to a signed copy"),
  buildTable(
    ["Run", "Signed certs", "Rung", "Wholesale / cert", "Wholesale total"],
    [
      ["500", "100", "100–199", "$9.00", "$900"],
      ["1,000", "200", "200–299", "$7.00", "$1,400"],
    ],
    { aligns: [LEFT, RIGHT, LEFT, RIGHT, RIGHT] },
  ),
  richP(
    [
      { text: "SoulChef sets the " },
      { text: "retail", bold: true },
      { text: " price per signed copy (typical artist positioning: a $20–$40 upcharge over the base record). At a $25 GoodDeed upcharge × 100 certs on the 500-run, that's $2,500 of incremental revenue against $900 of wholesale + ~$0.83/cert CC fee = ~" },
      { text: "$1,517 of additional margin on the run", bold: true },
      { text: ", before any base-record margin. On the 1,000-run the same $25 upcharge × 200 certs is $5,000 incremental against $1,400 wholesale + ~$1.65/cert CC fee = ~" },
      { text: "$3,270 of additional margin", bold: true },
      { text: "." },
    ],
    { spacingBefore: 200, spacingAfter: 120 },
  ),
  p(
    "Sign-through rate is the lever. The above uses 20%; some artists run hotter (30–40% on focused fan-base launches) and a few sit lower (10–15%).",
  ),

  // 6. Not in this estimate
  h2("6. What's not in this estimate (call-outs)"),
  bullet([
    { text: "Black vinyl", bold: true },
    { text: " runs were not part of this conversation — pricing available on request (MRP Black ladder is TBD; Hellbender Black is quotable now)." },
  ]),
  bullet([
    { text: "Test pressings", bold: true },
    { text: ", alternate jackets (tip-on, widespine, printed inners), inserts/booklets/posters, obi spine-wraps, and picture-disc labels are all available as add-ons — not included above." },
  ]),
  bullet([
    { text: "Inbound shipping", bold: true },
    { text: " of finished goods from the plant to SoulChef." },
  ]),
  bullet([
    { text: "Direct-to-fan fulfillment", bold: true },
    { text: " via the GoodTunes store (if/when you sell on GoodTunes) is priced separately under the platform's standard fan-checkout economics." },
  ]),
  bullet("Once SoulChef goes live on the GoodTunes platform, the matrix above becomes a live, in-app picker — pick a press, pick a color, pick a quantity, and the artist net + GoodDeed earnings update in real time."),

  // 7. Next steps
  h2("7. Next steps"),
  numbered(1, "SoulChef picks press + run size + Color vs Splatter (or asks us to lock the quote against a specific color from either vendor's catalog)."),
  numbered(2, "GoodTunes confirms pricing in writing with the chosen partner and locks the production slot."),
  numbered(3, "Art + audio submitted to the partner's required prep specs (we can share the MRP / Hellbender checklists alongside this estimate)."),
  numbered(4, "GoodDeed certificate run is configured once the base run is locked (signed-batch size flexes with fan demand within the ladder above)."),

  p("— GoodTunes®", {
    color: NAVY,
    bold: true,
    spacingBefore: 320,
    align: AlignmentType.RIGHT,
  }),
];

const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: {
        top: { color: "D0D4DE", style: BorderStyle.SINGLE, size: 6, space: 6 },
      },
      children: [
        new TextRun({
          text: `GoodTunes® · SoulChef estimate · prepared ${today} · valid 30 days`,
          size: 18,
          color: MUTED,
          font: FONT,
        }),
      ],
    }),
  ],
});

const doc = new Document({
  creator: "GoodTunes",
  title: "SoulChef — Escapism: Instrumentals — Pricing Estimate",
  description: "Vinyl pressing estimate for SoulChef",
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, color: INK } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1440, left: 1080 },
        },
      },
      headers: {},
      footers: { default: footer },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUT_PATH, buffer);
console.log(`Wrote ${OUT_PATH} (${buffer.length} bytes)`);
