// ArtworkCheckUpgraded — Surface 2 of the press print-spec design brief.
//
// "Prepress review" dialog — the upgraded artwork check. Shown to both the
// artist and the GoodTunes team. Structure (all Bill-ratified, Aug 2026):
//   • Header: two-tone title "Prepress review. Cover: 12″ (gatefold)." +
//     gray-chip close circle (apple-canon modal close).
//   • Full-width TL;DR verdict card (soft rose, filled red circle + white ✕).
//   • Left: preview pane with a single ··· overflow chip (top-right, over the
//     artwork per canon) holding ALL file actions: Replace file, Refresh for
//     preview, Download artwork, Download report. Filename caption below.
//   • Right, in urgency order: Needs attention → Check by eye → Passed
//     (collapsed by default; the only collapsible — it doesn't need to stand out).
//   • Footer: Override with justification — a real, audited action (per Otis:
//     justification min 8 chars, stamped who/why/when), so it LOOKS like a
//     button (quiet outline pill) with an ⓘ explaining it. Team-only.
// Colorblind rule: every verdict = icon + label, never color alone.
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock page.
// Static mockup: rendered open over a dimmed admin page. MOCK_ data only.

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  X,
  Download,
  Upload,
  FileText as FileTextIcon,
  MoreHorizontal,
  Info,
  RefreshCw,
  FileText,
  Moon,
  Sun,
} from 'lucide-react';

// ─── Themes — light = apple-canon light dialog; dark = canon charcoal ──

type Theme = {
  pageBg: string;
  surface: string;      // dialog background
  ink: string;
  subink: string;
  faint: string;        // captions, chevrons, ⓘ
  chip: string;         // gray circles (close, ···)
  pane: string;         // preview pane / recessed track
  hairline: string;     // dividers
  menuBg: string;
  menuShadow: string;
  hoverWash: string;
  verdictBg: string;    // rose card
  red: string;
  pass: string;
  warn: string;
  outlineBorder: string;
  dim: string;          // page-dim overlay
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    pageBg: '#f5f5f7',
    surface: '#ffffff',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#aeaeb2',
    chip: '#e8e8ed',
    pane: '#f5f5f7',
    hairline: 'rgba(0,0,0,0.06)',
    menuBg: '#ffffff',
    menuShadow: '0 8px 30px rgba(0,0,0,0.16)',
    hoverWash: 'rgba(0,0,0,0.04)',
    verdictBg: '#fdf2f2',
    red: '#d02f2f',
    pass: '#34a853',
    warn: '#c07f2a',
    outlineBorder: 'rgba(0,0,0,0.16)',
    dim: 'rgba(15,23,42,0.30)',
  },
  dark: {
    pageBg: '#1c1c1e',
    surface: '#232326',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    chip: '#3a3a3e',
    pane: '#26262a',
    hairline: 'rgba(255,255,255,0.08)',
    menuBg: '#2c2c2e',
    menuShadow: '0 8px 30px rgba(0,0,0,0.5)',
    hoverWash: 'rgba(255,255,255,0.06)',
    verdictBg: 'rgba(208,47,47,0.14)',
    red: '#f2555a',
    pass: '#3fbf62',
    warn: '#d99a3d',
    outlineBorder: 'rgba(255,255,255,0.22)',
    dim: 'rgba(0,0,0,0.45)',
  },
};

type CheckStatus = 'pass' | 'warn' | 'fail';

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
};

function statusColor(s: CheckStatus, t: Theme) {
  return s === 'pass' ? t.pass : s === 'warn' ? t.warn : t.red;
}

function StatusIcon({ s, className = 'w-2.5 h-2.5' }: { s: CheckStatus; className?: string }) {
  if (s === 'pass') return <Check className={className} />;
  if (s === 'warn') return <AlertTriangle className={className} />;
  return <X className={className} />;
}

// ─── Line items ───────────────────────────────────────────────────────

type MachineRow = {
  key: string;
  status: CheckStatus;
  label: string;
  message: string;
};

type AdvisoryRow = {
  key: string;
  label: string;
  message: string;
};

const MOCK_CHECKS: MachineRow[] = [
  {
    key: 'artboard',
    status: 'pass',
    label: 'Artboard size',
    message: '27.25″ × 27.0″ — matches the MRP template exactly.',
  },
  {
    key: 'pages',
    status: 'pass',
    label: 'Page count',
    message: '1 page — matches the template.',
  },
  {
    key: 'bleed',
    status: 'warn',
    label: 'Bleed',
    message: '0.125″ — meets MRP’s 0.125″ minimum, below their recommended 0.25″.',
  },
  {
    key: 'ppi-standard',
    status: 'pass',
    label: 'Image resolution',
    message: 'Lowest placed image 350 PPI — above MRP’s 300 PPI floor.',
  },
  {
    key: 'ppi-bitmap',
    status: 'fail',
    label: 'Bitmap / line-art resolution',
    message: 'Line-art logo on the spine is 800 PPI — MRP requires 1200 PPI for bitmap images.',
  },
  {
    key: 'color-space',
    status: 'pass',
    label: 'Color spaces',
    message: 'CMYK only, no RGB objects — matches the template’s color setup.',
  },
  {
    key: 'grayscale',
    status: 'pass',
    label: 'Grayscale',
    message: 'Not required for this component — color piece.',
  },
  {
    key: 'pantone',
    status: 'fail',
    label: 'Pantone spot colors',
    message: '“PANTONE 032 C 2” isn’t on MRP’s official spot-color list. Closest official name: PANTONE 032 C.',
  },
  {
    key: 'placed-format',
    status: 'pass',
    label: 'Placed-image formats',
    message: 'All placed images are TIFF or vector — no GIF/PNG-sourced images.',
  },
];

const MOCK_ADVISORIES: AdvisoryRow[] = [
  {
    key: 'edge-band',
    label: 'Bleed content',
    message:
      'The outer bleed band appears empty — if the art should run to the edge, extend it into the bleed. Fine if the border is intentional.',
  },
  {
    key: 'safety-area',
    label: 'Safety area',
    message:
      'Text sits close to the cut line near the spine. MRP asks for 0.25″ clearance — check the title block by eye.',
  },
];

// Machine-verified row — hairline-divided; verdict = icon + word, right-
// aligned in a fixed gutter so the list reads as a quiet table.
function CheckRow({ row, t }: { row: MachineRow; t: Theme }) {
  return (
    <div className="flex items-start gap-4 py-3" data-testid={`check-${row.key}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
          {row.label}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed" style={{ color: t.subink }}>
          {row.message}
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 pt-0.5"
        style={{ color: statusColor(row.status, t), width: 78, justifyContent: 'flex-end' }}
      >
        <StatusIcon s={row.status} className="w-3 h-3" /> {STATUS_LABEL[row.status]}
      </span>
    </div>
  );
}

// Advisory row — human judgment; no verdict gutter (the section header
// "Check by eye" already says it once).
function AdvisoryRowView({ row, t }: { row: AdvisoryRow; t: Theme }) {
  return (
    <div className="flex items-start gap-4 py-3" data-testid={`advisory-${row.key}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
          {row.label}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed" style={{ color: t.subink }}>
          {row.message}
        </div>
      </div>
    </div>
  );
}

// ─── The dialog ───────────────────────────────────────────────────────

function ArtworkCheckDialog({ t }: { t: Theme }) {
  const failCount = MOCK_CHECKS.filter((c) => c.status === 'fail').length;
  const passRows = MOCK_CHECKS.filter((c) => c.status === 'pass');
  const [passOpen, setPassOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  const menuItem = (testId: string, Icon: typeof Download, label: string) => (
    <button
      type="button"
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left"
      style={{ color: t.ink }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hoverWash)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      data-testid={testId}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: t.subink }} /> {label}
    </button>
  );

  return (
    <div
      className="w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
      style={{ backgroundColor: t.surface, border: `1px solid ${t.hairline}` }}
      role="dialog"
      aria-label="Prepress review — Cover: 12 inch gatefold"
      data-testid="dialog-artwork-check"
    >
      {/* Header — apple-canon: two-tone title, gray-chip close circle */}
      <div
        className="flex items-start justify-between gap-3 px-6 pt-5 pb-4"
        style={{ borderBottom: `1px solid ${t.hairline}` }}
      >
        <div>
          <h2 style={{ fontSize: 20, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.2 }}>
            <span style={{ color: t.ink }}>Prepress review. </span>
            <span style={{ color: t.subink, fontWeight: 500 }}>Cover: 12″ (gatefold).</span>
          </h2>
        </div>
        <div className="flex items-center gap-4 shrink-0 pt-0.5">
          <button
            type="button"
            aria-label="Close"
            className="w-7 h-7 rounded-full inline-flex items-center justify-center hover:opacity-80"
            style={{ backgroundColor: t.chip }}
            data-testid="button-close"
          >
            <X className="w-3.5 h-3.5" style={{ color: t.ink }} />
          </button>
        </div>
      </div>

      <div className="px-7 py-5 overflow-y-auto">
        {/* TL;DR verdict card — full width, spans both columns */}
        <div
          className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5"
          style={{ backgroundColor: t.verdictBg }}
          data-testid="dialog-verdict-card"
        >
          <span
            className="mt-px inline-flex items-center justify-center rounded-full shrink-0"
            style={{ backgroundColor: t.red, width: 16, height: 16 }}
          >
            <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </span>
          <div className="text-[12.5px] leading-relaxed">
            <span className="font-semibold" style={{ color: t.red }}>
              Not ready — {failCount} blockers, {MOCK_CHECKS.filter((c) => c.status === 'warn').length} warning.
            </span>{' '}
            <span style={{ color: t.subink }}>
              Fix the blockers below, re-upload, and this re-checks automatically.
            </span>
          </div>
        </div>

        <div className="grid gap-7" style={{ gridTemplateColumns: '230px 1fr' }}>
          {/* Preview area */}
          <div>
            <div
              className="aspect-square rounded-xl flex flex-col items-center justify-center text-center px-5 relative"
              style={{ backgroundColor: t.pane }}
              data-testid="preview-none"
            >
              {/* Overflow — all file actions live here, over the artwork */}
              <button
                type="button"
                aria-label="File actions"
                onClick={() => setFileMenuOpen((v) => !v)}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full inline-flex items-center justify-center hover:opacity-80"
                style={{ backgroundColor: t.chip }}
                data-testid="button-file-menu"
              >
                <MoreHorizontal className="w-4 h-4" style={{ color: t.ink }} />
              </button>
              {fileMenuOpen && (
                <div
                  className="absolute z-10 rounded-xl py-1.5 text-left"
                  style={{
                    top: 44,
                    right: 10,
                    minWidth: 190,
                    backgroundColor: t.menuBg,
                    boxShadow: t.menuShadow,
                    border: `1px solid ${t.hairline}`,
                  }}
                  data-testid="menu-file-actions"
                >
                  {menuItem('button-replace-file-menu', Upload, 'Replace file')}
                  {menuItem('button-refresh-preview-menu', RefreshCw, 'Refresh for preview')}
                  {menuItem('button-download', Download, 'Download artwork')}
                  {menuItem('button-download-report', FileTextIcon, 'Download report')}
                </div>
              )}
              <FileText className="w-7 h-7" style={{ color: t.faint }} />
              <div className="mt-3 text-[13px] font-medium" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
                No preview.
              </div>
            </div>
            {/* Client context — reads like a record card under the art */}
            <div className="mt-3 text-center" data-testid="text-client-context">
              <div className="text-[13px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
                Californialand
              </div>
              <div className="text-[12px]" style={{ color: t.subink }}>
                Nina Soleil
              </div>
            </div>
            <div
              className="mt-2 text-center text-[11px] truncate"
              style={{ color: t.faint }}
              title="cover_gatefold_v4.pdf"
            >
              cover_gatefold_v4.pdf · 1 page · 84 MB
            </div>
          </div>

          {/* Check list — urgency order: attention → by eye → passed */}
          <div>
            <div
              className="mb-1 text-[15px] font-semibold"
              style={{ color: t.ink, letterSpacing: '-0.01em' }}
            >
              Needs attention
            </div>
            <div className="divide-y" style={{ borderColor: t.hairline }} data-testid="list-checks">
              {MOCK_CHECKS.filter((c) => c.status !== 'pass').map((row) => (
                <CheckRow key={row.key} row={row} t={t} />
              ))}
            </div>

            <div
              className="mt-7 mb-1 text-[15px] font-semibold"
              style={{ color: t.ink, letterSpacing: '-0.01em' }}
            >
              Check by eye
            </div>
            <div className="divide-y" style={{ borderColor: t.hairline }} data-testid="list-advisories">
              {MOCK_ADVISORIES.map((row) => (
                <AdvisoryRowView key={row.key} row={row} t={t} />
              ))}
            </div>

            {/* Passed — last: least urgent, the only collapsible section */}
            <div data-testid="row-passed-group">
              <button
                type="button"
                onClick={() => setPassOpen((v) => !v)}
                className="mt-7 mb-1 w-full flex items-center gap-4 text-left hover:opacity-70"
                data-testid="button-toggle-passed"
              >
                <div className="flex-1 min-w-0 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
                  Passed
                  <span className="ml-2 text-[13px] font-normal" style={{ color: t.subink }}>
                    {passRows.length} checks
                  </span>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0"
                  style={{ color: t.pass, width: 78, justifyContent: 'flex-end' }}
                >
                  <Check className="w-3 h-3" />
                  {passOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint }} />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} />
                  )}
                </span>
              </button>
              {passOpen && (
                <div className="divide-y" style={{ borderColor: t.hairline }} data-testid="list-passed">
                  {passRows.map((row) => (
                    <CheckRow key={row.key} row={row} t={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer — Override: real audited action, team-only */}
      <div
        className="px-7 py-4 flex items-center justify-between gap-3"
        style={{ borderTop: `1px solid ${t.hairline}` }}
      >
        <span />
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="What does override mean?"
            title="Team only. Blockers stop this file from going to the press. Override accepts it anyway — you'll enter a reason, and it's logged with your name and shown on the file."
            className="inline-flex items-center justify-center hover:opacity-70"
            style={{ color: t.faint }}
            data-testid="button-override-info"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="h-8 px-3.5 rounded-full text-[12.5px] font-semibold inline-flex items-center transition-colors"
            style={{ color: t.ink, border: `1px solid ${t.outlineBorder}` }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hoverWash)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            data-testid="button-override"
          >
            Override with justification
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page — dialog open over a dimmed admin page; theme toggle floats ──

export default function ArtworkCheckUpgraded() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  return (
    <div
      className="min-h-screen relative"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.pageBg }}
    >
      {/* Hinted page behind the dialog */}
      <div className="mx-auto max-w-4xl px-6 py-10 opacity-60">
        <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600 }}>
          <span style={{ color: t.ink }}>Completed Art. </span>
          <span style={{ color: t.subink, fontWeight: 500 }}>Californialand — 12″ vinyl.</span>
        </h1>
        <div className="mt-6 grid grid-cols-4 gap-3">
          {['Cover', 'Center Labels', 'Inner Sleeve', 'Booklet'].map((label) => (
            <div
              key={label}
              className="rounded-lg p-3"
              style={{ backgroundColor: t.surface, border: `1px solid ${t.hairline}` }}
            >
              <div className="text-sm font-semibold text-center mb-2" style={{ color: t.ink }}>
                {label}
              </div>
              <div className="aspect-square rounded-md" style={{ backgroundColor: t.pane }} />
            </div>
          ))}
        </div>
      </div>

      {/* Dim + dialog */}
      <div
        className="absolute inset-0 flex items-start justify-center pt-10 px-6 pb-10"
        style={{ backgroundColor: t.dim }}
      >
        <ArtworkCheckDialog t={t} />
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-20 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.surface, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </div>
  );
}
