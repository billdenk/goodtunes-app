// PressTemplateIngestion — Surface 1 from the template-canon brief: the
// centerpiece. A press has just uploaded a template PDF; the platform
// parsed it and now PROPOSES what it found — identity from the title
// block, geometry measured from the vector layers, rules lifted from
// the printed instructions. Everything reads as "Extracted — not yet
// canon" until the press confirms. Correcting one field never restarts
// the flow (inline edit affordance per row).
//
// Worked example (real files): MRP 12" LP Center Label for 2LP,
// 100mm trim, code 12-LBL100M-2, revision R-091125.
// Shares the apple-canon press shell verbatim — no drift.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.
//
// ─── HANDOFF COPY ────────────────────────────────────────────────────
// Self-contained verbatim-replacement screen for the real GoodTunes app
// ("Otis"). No imports from ../mockups or shared mock modules — the
// PressShell chrome, THEMES map, the full PrintedAreasStudy device (with
// its StudyTheme/STUDY_DARK/STUDY_LIGHT tokens), and all dummy data
// (MOCK_-prefixed consts) are inlined below so this file compiles alone.

import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, Cog, Gift,
  Search, Bell, MessageSquarePlus, FileText, Pencil, Cpu, Eye, ChevronRight, Download, Moon, Sun,
} from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import mrpLogo from './assets/mrp-logo.svg';
import gtPreviewTemplate from './assets/gt-preview-template-circle.png';
import goodtunesLogo from './assets/goodtunes-logo.png';
import brandonPhoto from './assets/brandon-seavers.png';

// ═════════════════════════════════════════════════════════════════════
// PrintedAreasStudy — inlined shared study device (from _PrintedAreasStudy.tsx)
// Interaction contract: pick a zone in the segmented control → the matching
// ring pulses on every panel, word tag rides the image (word + ring, never
// color alone); Lines/Areas toggle → Areas dims everything outside the zone's
// actual region; panels get a view-only "Flip 180°"; click a panel →
// expanded view.
// ═════════════════════════════════════════════════════════════════════

// ─── Study theme tokens — surfaces / text / hairlines only ───────────
// The WHITE printed-artwork panel, the colorblind-safe zone status colors
// (greens/amber/blue accents), and word tags stay identical across both
// themes. Dark is the canon default.
type StudyTheme = {
  /** Full-bleed page canvas (non-embedded wrapper). */
  canvas: string;
  /** Raised card + expanded-view surface. */
  card: string;
  /** Nested popover/tooltip surface (flag card, zone tooltip). */
  cardSoft: string;
  /** Inset chip / input surface (segmented active pill, text inputs, close btn). */
  chip: string;
  /** Zone hover tooltip surface. */
  tooltip: string;
  /** Inset input fill (text/email inputs inside the flag card). */
  inputBg: string;
  /** Hairline border. */
  hairline: string;
  /** Inactive dashed ring border over the artwork. */
  ringIdle: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  /** Dim overlay used in Areas mode (shades everything outside the zone). */
  dim: string;
  /** Deep shadow for popovers / expanded modal. */
  popoverShadow: string;
  modalShadow: string;
};

const STUDY_DARK: StudyTheme = {
  canvas: '#161617',
  card: '#1e1e20',
  cardSoft: '#232325',
  chip: '#3a3a3c',
  tooltip: '#2c2c2e',
  inputBg: 'rgba(255,255,255,0.06)',
  hairline: 'rgba(255,255,255,0.10)',
  ringIdle: 'rgba(255,255,255,0.35)',
  ink: '#f5f5f7',
  subink: '#98989d',
  faint: '#6e6e73',
  blue: '#319ED8',
  dim: 'rgba(24,24,26,0.78)',
  popoverShadow: '0 16px 48px rgba(0,0,0,0.55)',
  modalShadow: '0 24px 80px rgba(0,0,0,0.6)',
};

const STUDY_LIGHT: StudyTheme = {
  canvas: '#f5f5f7',
  card: '#ffffff',
  cardSoft: '#ffffff',
  chip: '#ffffff',
  tooltip: '#ffffff',
  inputBg: '#f0f0f2',
  hairline: '#e6e6ea',
  ringIdle: 'rgba(0,0,0,0.28)',
  ink: '#1d1d1f',
  subink: '#6e6e73',
  faint: '#a1a1a6',
  blue: '#319ED8',
  dim: 'rgba(24,24,26,0.78)',
  popoverShadow: '0 16px 48px rgba(0,0,0,0.18)',
  modalShadow: '0 24px 80px rgba(0,0,0,0.28)',
};

const ThemeCtx = createContext<StudyTheme>(STUDY_DARK);
const useT = () => useContext(ThemeCtx);

type StudyZone = {
  id: string;
  word: string;
  detail: string;
  /** Inset ring following the panel edge (circle or rounded-rect). */
  inset?: string;
  /** Centered rings (e.g. spindle hole + keep-clear, die-cut opening). */
  centered?: string[];
  /** Dashed line along the panel's fold edge (per-panel edge). */
  fold?: boolean;
  /** Fit-check verdict for finished-art tabs: ✓ at a glance, ✕ needs attention.
   *  Omit on template tabs (there is nothing to judge). */
  status?: 'ok' | 'attention';
};

type StudyPanel = {
  label: string;
  sub: string;
  img: string;
  /** Which edge is the fold/score line, when the zone set includes one. */
  foldEdge?: 'top' | 'bottom';
  /** Vertical fold/score lines (spine etc.), as left-% positions. */
  foldLines?: string[];
  /** Width ÷ height. Defaults to 1 (square/circle). */
  aspect?: number;
  /** @deprecated Flip is now available on every panel; kept for old specs. */
  allowFlip?: boolean;
  /** Fit-check flag: natural-language finding the platform raises for this
   *  panel (designer, artist, or press can Fix or Accept & note why). */
  flag?: { headline: string; detail: string };
  /** Auto-remediated version (art scaled inside safety, background matched).
   *  When present, a "Fix" control offers the corrected preview; the original
   *  file always stays on record. */
  fixImg?: string;
};

type StudySpec = {
  title: string;
  caption: string;
  zones: StudyZone[];
  panels: StudyPanel[];
  shape: 'circle' | 'square';
  defaultZone: string;
  footnote?: string;
  /** Optional gray tail after the bold lead word, e.g. title "Proof." + titleRest "Inner sleeve 12″". */
  titleRest?: string;
};

type ViewMode = 'lines' | 'areas';

/** In Areas mode: dim everything except the zone's real region.
 *  Bleed = the band between the bleed edge and the cut line; other inset
 *  zones = clear inside their line; centered pairs = the ring between the
 *  two circles; fold falls back to its lines. */
function RegionDim({ spec, zoneDef, circle }: { spec: StudySpec; zoneDef: StudyZone; circle: boolean }) {
  const t = useT();
  const round = circle ? 'rounded-full' : 'rounded-md';
  const edge = `1.5px solid ${t.blue}`;
  if (zoneDef.centered) {
    const sorted = [...zoneDef.centered].sort((a, b) => parseFloat(b) - parseFloat(a));
    const [outer, inner] = sorted;
    return (
      <>
        <div className="absolute rounded-full pointer-events-none" style={{ left: '50%', top: '50%', width: outer, height: outer, transform: 'translate(-50%, -50%)', boxShadow: `0 0 0 4000px ${t.dim}`, border: edge }} />
        {inner && (
          <div className="absolute rounded-full pointer-events-none" style={{ left: '50%', top: '50%', width: inner, height: inner, transform: 'translate(-50%, -50%)', backgroundColor: t.dim, border: edge }} />
        )}
      </>
    );
  }
  if (zoneDef.inset !== undefined) {
    if (zoneDef.id === 'bleed') {
      const cut = spec.zones.find((z) => z.id === 'cut');
      return (
        <>
          <div className={`absolute pointer-events-none ${round}`} style={{ inset: zoneDef.inset, boxShadow: `0 0 0 4000px ${t.dim}` }} />
          {cut?.inset !== undefined && (
            <div className={`absolute pointer-events-none ${round}`} style={{ inset: cut.inset, backgroundColor: t.dim, border: edge }} />
          )}
        </>
      );
    }
    return <div className={`absolute pointer-events-none ${round}`} style={{ inset: zoneDef.inset, boxShadow: `0 0 0 4000px ${t.dim}`, border: edge }} />;
  }
  return null;
}

function StudyThumb({ spec, panel, zone, mode, flipped, onFlip, fixed, onFix, size = 300, onExpand, flagDecision, flagOpen, onFlagToggle, onFlagFix, onFlagAccept, onFlagReview, onFlagReset }: { spec: StudySpec; panel: StudyPanel; zone: string | null; mode: ViewMode; flipped: boolean; onFlip?: () => void; fixed?: boolean; onFix?: () => void; size?: number; onExpand?: () => void; flagDecision?: Decision; flagOpen?: boolean; onFlagToggle?: () => void; onFlagFix?: () => void; onFlagAccept?: (reason: string) => void; onFlagReview?: (recipient: string) => void; onFlagReset?: () => void }) {
  const t = useT();
  const circle = spec.shape === 'circle';
  const ringStyle = (active: boolean) => ({
    border: active ? `2.5px dashed ${t.blue}` : `1px dashed ${t.ringIdle}`,
    transition: 'border 120ms ease',
  });
  const zoneDef = zone ? spec.zones.find((z) => z.id === zone) : null;
  const areas = mode === 'areas' && zoneDef && !zoneDef.fold;
  // Word tag: appears centered when the zone changes, then fades away;
  // hovering the panel brings it back (word + ring, never color alone).
  const [tagShown, setTagShown] = useState(false);
  useEffect(() => {
    if (!zone) return;
    setTagShown(true);
    const timer = setTimeout(() => setTagShown(false), 1600);
    return () => clearTimeout(timer);
  }, [zone]);
  // `size` is the panel height; wide panels (jacket spreads) grow horizontally.
  const aspect = panel.aspect ?? 1;
  const width = Math.round(size * Math.max(aspect, 1));
  const height = Math.round(width / aspect);
  const foldEdgeFor = (e: 'top' | 'bottom') => (flipped ? (e === 'top' ? 'bottom' : 'top') : e);
  return (
    <div className="relative flex flex-col items-center" data-testid={`study-thumb-${panel.label.toLowerCase().replace(/ /g, '-')}`}>
      <div className="relative group" style={{ width, height }}>
      {onExpand && (
        <span
          aria-hidden
          className="absolute z-20 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ top: 2, right: -26, width: 20, height: 20, color: t.subink }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M7.5 1.5h3v3M10.5 1.5 7 5M4.5 10.5h-3v-3M1.5 10.5 5 7" />
          </svg>
        </span>
      )}
      {onFlip && (
        <button
          type="button"
          onClick={onFlip}
          title={flipped ? 'Showing upside-down — click for as-printed' : 'Flip top-to-bottom (view only)'}
          aria-label={flipped ? 'Show as printed' : 'Flip top to bottom'}
          className={`absolute z-20 flex items-center justify-center transition-opacity hover:opacity-100 ${flipped ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
          style={{ top: 28, right: -26, width: 20, height: 20, color: flipped ? t.blue : t.subink, background: 'transparent' }}
          data-testid={`button-flip-${panel.label.toLowerCase().replace(/ /g, '-')}`}
        >
          {/* SF-style flip top-to-bottom: triangles stacked and mirrored across the horizontal axis, vertical arrow beside */}
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 1.5v11M2 1.5 .8 2.8M2 1.5l1.2 1.3M2 12.5.8 11.2M2 12.5l1.2-1.3" />
            <path d="M5.5 6.2h7L5.5 1.6V6.2Z" fill="currentColor" stroke="none" />
            <path d="M5.5 7.8h7L5.5 12.4V7.8Z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={onExpand}
        className={`relative overflow-hidden w-full h-full ${circle ? 'rounded-full' : 'rounded-lg'} ${onExpand ? 'cursor-zoom-in transition-transform hover:scale-[1.02]' : 'cursor-default'}`}
        style={{ backgroundColor: '#fff', border: `1px solid ${t.hairline}` }}
        aria-label={onExpand ? `Expand ${panel.label}` : undefined}
      >
        <img
          src={fixed && panel.fixImg ? panel.fixImg : panel.img}
          alt={`${panel.label} — printed area with zones`}
          className="w-full h-full object-cover"
          style={{ transform: flipped ? 'rotate(180deg)' : undefined, transition: 'transform 220ms ease' }}
        />
        {!areas && spec.zones.map(({ id, inset, centered, fold }) => {
          const active = zone === id;
          if (fold) {
            // Score lines only appear when Fold is selected — they read as
            // stray rules when drawn faintly alongside the edge rings.
            if (!active) return null;
            const lineStyle = `2.5px dashed ${t.blue}`;
            if (panel.foldLines) {
              return panel.foldLines.map((left) => (
                <div
                  key={`${id}-${left}`}
                  className={`absolute top-[4%] bottom-[4%] pointer-events-none ${active ? 'animate-pulse' : ''}`}
                  style={{ left, width: 0, borderLeft: lineStyle, transition: 'border 120ms ease' }}
                />
              ));
            }
            const edge = foldEdgeFor(panel.foldEdge ?? 'bottom');
            return (
              <div
                key={id}
                className={`absolute left-[6%] right-[6%] pointer-events-none ${active ? 'animate-pulse' : ''}`}
                style={{ [edge]: '1.5%', height: 0, borderTop: lineStyle, transition: 'border 120ms ease' }}
              />
            );
          }
          if (centered) {
            return centered.map((d) => (
              <div
                key={`${id}-${d}`}
                className={`absolute rounded-full pointer-events-none ${active ? 'animate-pulse' : ''}`}
                style={{ left: '50%', top: '50%', width: d, height: d, transform: 'translate(-50%, -50%)', ...ringStyle(active) }}
              />
            ));
          }
          return (
            <div
              key={id}
              className={`absolute pointer-events-none ${circle ? 'rounded-full' : 'rounded-md'} ${active ? 'animate-pulse' : ''}`}
              style={{ inset, ...ringStyle(active) }}
            />
          );
        })}
        {areas && zoneDef && <RegionDim spec={spec} zoneDef={zoneDef} circle={circle} />}
        {areas && zoneDef?.fold && null}
        {mode === 'areas' && zoneDef?.fold && spec.zones.filter((z) => z.fold).map(({ id }) => {
          const lineStyle = `2.5px dashed ${t.blue}`;
          if (panel.foldLines) {
            return panel.foldLines.map((left) => (
              <div key={`${id}-a-${left}`} className="absolute top-[4%] bottom-[4%] pointer-events-none animate-pulse" style={{ left, width: 0, borderLeft: lineStyle }} />
            ));
          }
          const edge = foldEdgeFor(panel.foldEdge ?? 'bottom');
          return <div key={`${id}-a`} className="absolute left-[6%] right-[6%] pointer-events-none animate-pulse" style={{ [edge]: '1.5%', height: 0, borderTop: lineStyle }} />;
        })}
        {zoneDef && (
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[12px] font-semibold z-10 pointer-events-none transition-opacity duration-700 ${tagShown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ backgroundColor: 'rgba(22,22,23,0.85)', color: '#fff' }}
          >
            {zoneDef.word}
          </div>
        )}
      </button>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: t.ink }}>
        {panel.flag && onFlagToggle && (
          <button
            type="button"
            onClick={onFlagToggle}
            title={flagDecision ? (flagDecision.status === 'fixed' ? 'Fixed — click for details' : 'Accepted as-is — click for details') : 'Needs attention — click for details'}
            aria-label={flagDecision ? 'Fit check resolved — details' : 'Fit check needs attention — details'}
            className={`flex items-center justify-center rounded-full ${!flagDecision && !flagOpen ? 'animate-pulse' : ''}`}
            style={{ width: 17, height: 17, backgroundColor: flagDecision ? (flagDecision.status === 'review' ? t.blue : '#34C759') : '#FF9F0A', color: flagDecision?.status === 'review' ? '#fff' : '#1c1c1e', fontSize: 11, fontWeight: 700, lineHeight: 1 }}
            data-testid={`badge-flag-${panel.label.toLowerCase().replace(/ /g, '-')}`}
          >
            {flagDecision ? (flagDecision.status === 'review' ? '→' : '✓') : '!'}
          </button>
        )}
        {panel.label}
      </div>
      {flagOpen && panel.flag && (
        <div
          className="absolute z-40 text-left"
          style={{ left: '50%', top: height + 40, transform: 'translateX(-50%)', width: 460, maxWidth: '92vw' }}
          data-testid={`popover-flag-${panel.label.toLowerCase().replace(/ /g, '-')}`}
        >
          <FitFlagCard panel={panel} decision={flagDecision} onFix={onFlagFix!} onAccept={onFlagAccept!} onReview={onFlagReview} onReset={onFlagReset!} onClose={onFlagToggle} />
        </div>
      )}
      <div className="text-[11.5px]" style={{ color: t.faint }}>{panel.sub}</div>
      <div className="flex items-center gap-2">
      {panel.fixImg && onFix && (
        <button
          type="button"
          onClick={onFix}
          className="mt-1.5 text-[11.5px] rounded-full px-3 py-1 transition-colors"
          style={{ color: fixed ? '#fff' : t.subink, backgroundColor: fixed ? '#34C759' : 'transparent', border: fixed ? '1px solid transparent' : `1px solid ${t.hairline}` }}
          data-testid={`button-fix-${panel.label.toLowerCase().replace(/ /g, '-')}`}
        >
          {fixed ? 'Fixed — original kept on file' : 'Fix — bring inside safety'}
        </button>
      )}
      </div>
    </div>
  );
}

type Decision = { status: 'fixed' | 'accepted' | 'review'; reason?: string };

const ACCEPT_REASONS = [
  'Text is a graphic element — meant to run off the edge',
  'My printer has approved this layout',
  'Other…',
];

function FitFlagCard({ panel, decision, onFix, onAccept, onReview, onReset, onClose }: { panel: StudyPanel; decision?: Decision; onFix: () => void; onAccept: (reason: string) => void; onReview?: (recipient: string) => void; onReset: () => void; onClose?: () => void }) {
  const t = useT();
  const [accepting, setAccepting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState(ACCEPT_REASONS[0]);
  const [other, setOther] = useState('');
  const flag = panel.flag!;
  const closeButton = onClose && (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
      style={{ top: 10, right: 10, width: 22, height: 22, backgroundColor: t.hairline, color: t.subink }}
      data-testid="button-flag-close"
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M1 1l8 8M9 1L1 9" />
      </svg>
    </button>
  );
  if (decision) {
    const fixed = decision.status === 'fixed';
    const review = decision.status === 'review';
    return (
      <div className="relative rounded-[10px] px-4 py-3 pr-10 flex items-start gap-3" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, boxShadow: onClose ? t.popoverShadow : 'none' }} data-testid={`flag-resolved-${panel.label.toLowerCase()}`}>
        {closeButton}
        <span className="mt-0.5 text-[13px]" style={{ color: review ? t.blue : fixed ? '#34C759' : t.subink }}>{review ? '→' : '✓'}</span>
        <div className="flex-1 text-[12.5px]" style={{ color: t.subink }}>
          <span className="font-semibold" style={{ color: t.ink }}>{panel.label} — {review ? 'Sent for review' : fixed ? 'Fixed' : 'Accepted as-is'}</span>
          <span style={{ color: t.faint }}> · noted Aug 12, 2026</span>
          <div style={{ color: t.faint }}>
            {review
              ? `Proof report emailed to ${decision.reason} with a link to this page. We'll hold this proof until they respond.`
              : fixed
              ? 'A corrected file will be generated for press. The original stays on file.'
              : `“${decision.reason}” — original file goes to press unchanged.`}
          </div>
        </div>
        <button type="button" className="text-[12px] hover:opacity-80" style={{ color: t.blue }} onClick={onReset} data-testid={`button-flag-change-${panel.label.toLowerCase()}`}>Change</button>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl px-6 py-5" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, boxShadow: onClose ? t.popoverShadow : 'none' }} data-testid={`flag-open-${panel.label.toLowerCase()}`}>
      {closeButton}
      <div>
        <div className="pr-6">
          <div className="text-[13.5px] font-semibold leading-snug flex items-center gap-2" style={{ color: t.ink }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#FF9F0A' }} aria-hidden />
            {flag.headline}
          </div>
          <div className="mt-2 text-[12.5px] leading-relaxed" style={{ color: t.faint }}>{flag.detail}</div>
          {reviewing ? (
            <div className="mt-4">
              <div className="text-[12px] mb-1.5" style={{ color: t.faint }}>We’ll email a proof report — the artwork, the measured zones, and what we found — with a link back to this page.</div>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Their email — your designer, or yourself"
                className="w-full rounded-lg px-3 py-1.5 text-[12.5px] outline-none"
                style={{ backgroundColor: t.inputBg, border: `1px solid ${t.hairline}`, color: t.ink }}
                data-testid="input-review-recipient"
              />
              <div className="mt-2.5 flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!/^\S+@\S+\.\S+$/.test(recipient.trim())}
                  onClick={() => onReview?.(recipient.trim())}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40"
                  style={{ backgroundColor: t.blue, color: '#fff' }}
                  data-testid="button-review-send"
                >
                  Send report
                </button>
                <button
                  type="button"
                  onClick={() => { try { navigator.clipboard?.writeText(window.location.href); } catch { /* mock */ } setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                  style={{ color: copied ? '#34C759' : t.subink, border: `1px solid ${t.hairline}` }}
                  data-testid="button-review-copy-link"
                >
                  {copied ? 'Link copied' : 'Copy link to this proof'}
                </button>
                <button type="button" onClick={() => setReviewing(false)} className="text-[12px] hover:opacity-80" style={{ color: t.subink }} data-testid="button-review-cancel">Back</button>
              </div>
            </div>
          ) : !accepting ? (
            <div className="mt-4 flex items-center gap-2.5">
              {panel.fixImg && (
                <button type="button" onClick={onFix} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: t.blue, color: '#fff' }} data-testid={`button-flag-fix-${panel.label.toLowerCase()}`}>Fix it for me</button>
              )}
              {!panel.fixImg && (
                <button type="button" onClick={() => setReviewing(true)} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: t.blue, color: '#fff' }} data-testid={`button-flag-review-${panel.label.toLowerCase()}`}>Send to design review</button>
              )}
              <button type="button" onClick={() => setAccepting(true)} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ color: t.subink, border: `1px solid ${t.hairline}` }} data-testid={`button-flag-accept-${panel.label.toLowerCase()}`}>Accept as-is…</button>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-[12px] mb-1.5" style={{ color: t.faint }}>Why is this okay? (kept with the order)</div>
              <div className="flex flex-col gap-1.5">
                {ACCEPT_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: reason === r ? t.ink : t.subink }}>
                    <input type="radio" name={`reason-${panel.label}`} checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: t.blue }} data-testid={`radio-reason-${ACCEPT_REASONS.indexOf(r)}`} />
                    {r}
                  </label>
                ))}
              </div>
              {reason === 'Other…' && (
                <input
                  type="text"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  placeholder="Tell us why — e.g. art is intended to run off the edge"
                  className="mt-2 w-full rounded-lg px-3 py-1.5 text-[12.5px] outline-none"
                  style={{ backgroundColor: t.inputBg, border: `1px solid ${t.hairline}`, color: t.ink }}
                  data-testid="input-reason-other"
                />
              )}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={reason === 'Other…' && !other.trim()}
                  onClick={() => onAccept(reason === 'Other…' ? other.trim() : reason)}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40"
                  style={{ backgroundColor: '#34C759', color: '#fff' }}
                  data-testid="button-accept-note"
                >
                  Accept & note
                </button>
                <button type="button" onClick={() => setAccepting(false)} className="text-[12px] hover:opacity-80" style={{ color: t.subink }} data-testid="button-accept-cancel">Back</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ZoneControl({ spec, zone, setZone, mode, setMode, resolved }: { spec: StudySpec; zone: string | null; setZone: (z: string | null) => void; mode: ViewMode; setMode: (m: ViewMode) => void; resolved?: boolean }) {
  const t = useT();
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredDef = hovered ? spec.zones.find((z) => z.id === hovered) : null;
  const seg = (active: boolean) => ({
    color: active ? t.ink : t.subink,
    backgroundColor: active ? t.chip : 'transparent',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.35)' : 'none',
    transition: 'all 140ms ease',
  });
  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.inputBg }} data-testid="control-zones">
          {spec.zones.map(({ id, word, status }) => {
            const shown = status === 'attention' && resolved ? 'ok' : status;
            return (
            <button
              key={id}
              type="button"
              onClick={() => setZone(zone === id ? null : id)}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-medium flex items-center gap-1.5"
              style={seg(zone === id)}
              data-testid={`chip-zone-${id}`}
            >
              {shown && (
                <span aria-label={shown === 'ok' ? 'okay' : 'needs attention'} className="text-[11px] font-bold" style={{ color: shown === 'ok' ? '#34C759' : '#FF9F0A', lineHeight: 1 }}>
                  {shown === 'ok' ? '✓' : '✕'}
                </span>
              )}
              {word}
            </button>
            );
          })}
        </div>
        {/* View key — quiet icon pair, not a competing chip: dashed square = Lines, shaded square = Areas. */}
        <div className="inline-flex items-center gap-1" data-testid="control-view-mode">
          {(['lines', 'areas'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              title={m === 'lines' ? 'Lines — printer’s guides' : 'Areas — shade everything outside the zone'}
              aria-label={m === 'lines' ? 'Show guide lines' : 'Show zone areas'}
              className="flex items-center justify-center transition-colors hover:opacity-100"
              style={{ width: 24, height: 24, color: mode === m ? t.ink : t.faint, background: 'transparent' }}
              data-testid={`toggle-${m}`}
            >
              {m === 'lines' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" strokeDasharray="2.4 1.8" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <rect x="1" y="1" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.35" />
                  <rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
      {hoveredDef && (
        <div className="absolute left-1 top-full mt-1.5 z-30 rounded-lg px-3 py-1.5 text-[12px] pointer-events-none" style={{ backgroundColor: t.tooltip, border: `1px solid ${t.hairline}`, color: t.subink, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }} data-testid="tooltip-zone">
          <span className="font-semibold" style={{ color: t.ink }}>{hoveredDef.word}</span>
          <span style={{ color: t.faint }}> — {hoveredDef.detail}</span>
        </div>
      )}
    </div>
  );
}

function PrintedAreasStudy({ spec, embedded, panelSize, headerAction, theme = STUDY_DARK }: { spec: StudySpec; embedded?: boolean; panelSize?: number; headerAction?: React.ReactNode; theme?: StudyTheme }) {
  const t = theme;
  const [zone, setZone] = useState<string | null>(spec.defaultZone);
  const [mode, setMode] = useState<ViewMode>('lines');
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<StudyPanel | null>(null);
  const flipOf = (p: StudyPanel) => !!flipped[p.label];
  const toggleFlip = (p: StudyPanel) => setFlipped((f) => ({ ...f, [p.label]: !f[p.label] }));
  const [fixedMap, setFixedMap] = useState<Record<string, boolean>>({});
  const fixOf = (p: StudyPanel) => !!fixedMap[p.label];
  const toggleFix = (p: StudyPanel) => setFixedMap((f) => ({ ...f, [p.label]: !f[p.label] }));
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const flaggedPanels = spec.panels.filter((p) => p.flag);
  // "Sent for review" keeps the chip ✕ — only a fix or an accepted note clears it.
  const resolved = flaggedPanels.length > 0 && flaggedPanels.every((p) => decisions[p.label] && decisions[p.label].status !== 'review');
  const [openFlag, setOpenFlag] = useState<string | null>(null);
  const card = (
      <div className="w-full rounded-2xl px-6 pt-5 pb-6" style={{ maxWidth: embedded ? undefined : 1080, backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-printed-areas-study">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h3 className="text-[19px] font-semibold tracking-[-0.01em]" style={{ color: t.ink }}>
              {spec.title}
              {spec.titleRest && <span style={{ color: t.subink }}> {spec.titleRest}</span>}
            </h3>
            <div className="mt-1 text-[12px]" style={{ color: t.faint }}>{spec.caption}</div>
          </div>
          {headerAction}
        </div>
        <div className="mt-3.5">
          <ZoneControl spec={spec} zone={zone} setZone={setZone} mode={mode} setMode={setMode} resolved={resolved} />
        </div>
        <div className="mt-6 flex items-start justify-center gap-16 flex-wrap">
          {spec.panels.map((p) => (
            <StudyThumb
              key={p.label}
              spec={spec}
              panel={p}
              zone={zone}
              mode={mode}
              flipped={flipOf(p)}
              onFlip={() => toggleFlip(p)}
              fixed={fixOf(p)}
              onFix={p.fixImg ? () => toggleFix(p) : undefined}
              size={panelSize}
              onExpand={() => setExpanded(p)}
              flagDecision={decisions[p.label]}
              flagOpen={openFlag === p.label}
              onFlagToggle={p.flag ? () => setOpenFlag((o) => (o === p.label ? null : p.label)) : undefined}
              onFlagFix={() => { setFixedMap((f) => ({ ...f, [p.label]: true })); setDecisions((d) => ({ ...d, [p.label]: { status: 'fixed' } })); }}
              onFlagAccept={(reason) => setDecisions((d) => ({ ...d, [p.label]: { status: 'accepted', reason } }))}
              onFlagReview={(recipient) => setDecisions((d) => ({ ...d, [p.label]: { status: 'review', reason: recipient } }))}
              onFlagReset={() => { setFixedMap((f) => ({ ...f, [p.label]: false })); setDecisions((d) => { const n = { ...d }; delete n[p.label]; return n; }); }}
            />
          ))}
        </div>
        {expanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} onClick={() => setExpanded(null)} data-testid="overlay-study-expanded">
            <div className="rounded-3xl px-10 pt-8 pb-9 flex flex-col items-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }} onClick={(e) => e.stopPropagation()}>
              <div className="w-full flex items-center justify-between gap-8 mb-5">
                <div className="text-[15px] font-semibold" style={{ color: t.ink }}>{expanded.label} <span className="font-normal" style={{ color: t.faint }}>· {expanded.sub}</span></div>
                <button type="button" className="flex items-center gap-1.5 text-[13px] hover:opacity-80" style={{ color: t.subink }} onClick={() => setExpanded(null)} data-testid="button-close-expanded">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <path d="M4.5 1.5v3h-3M4.5 4.5 1 1M7.5 10.5v-3h3M7.5 7.5 11 11" />
                  </svg>
                  Close
                </button>
              </div>
              <div className="mb-6 w-full">
                <ZoneControl spec={spec} zone={zone} setZone={setZone} mode={mode} setMode={setMode} resolved={resolved} />
              </div>
              <StudyThumb spec={spec} panel={expanded} zone={zone} mode={mode} flipped={flipOf(expanded)} onFlip={() => toggleFlip(expanded)} fixed={fixOf(expanded)} onFix={expanded.fixImg ? () => toggleFix(expanded) : undefined} size={560} />
            </div>
          </div>
        )}
        {spec.footnote && <div className="mt-5 text-[12px]" style={{ color: t.faint }}>{spec.footnote}</div>}
      </div>
  );
  const themed = <ThemeCtx.Provider value={t}>{card}</ThemeCtx.Provider>;
  if (embedded) return themed;
  return (
    <ThemeCtx.Provider value={t}>
      <div className="min-h-screen font-sans flex items-start justify-center" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, padding: '48px 40px 72px' }}>
        {card}
      </div>
    </ThemeCtx.Provider>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Center-label template spec (from PressAreasCenterLabelTemplate.tsx).
// The MRP 12" center-label TEMPLATE (12-LBL100M-2) with the measured
// zones drawn on: the view the press verifies at ingestion time.
// ═════════════════════════════════════════════════════════════════════
const MOCK_SPEC: StudySpec = {
  title: 'Template.', titleRest: 'Center labels 12″',
  caption: '12-LBL100M-2 · R-091125 · detected — 2 pages → 2 areas',
  shape: 'circle',
  defaultZone: 'safe',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: '103 mm — art must reach', inset: '0%' },
    { id: 'cut', word: 'Cut', detail: '100 mm — trimmed edge', inset: '3.5%' },
    { id: 'safe', word: 'Safe', detail: '95 mm — text stays inside', inset: '8%' },
    { id: 'hole', word: 'Hole', detail: '7 mm punched — keep text clear around it', centered: ['9%', '22%'] },
  ],
  panels: [
    { label: 'Side A', sub: 'Page 1', img: gtPreviewTemplate },
    { label: 'Side B', sub: 'Page 2', img: gtPreviewTemplate },
  ],
};

// ═════════════════════════════════════════════════════════════════════
// Themes — dark = canon charcoal (unchanged); light = apple-canon
// The whole page (shell chrome, cards, and modal) reads from THEMES[mode].
// Dark stays the default so the canon rendering is byte-identical.
// ═════════════════════════════════════════════════════════════════════
type Theme = {
  // shell / page surfaces + ink
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  // warning accent (word + shape carry meaning; color is supportive only)
  warn: string;
  // active nav pill fill + shadow
  navActive: string;
  navShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // modal scrim (dark-tinted in both themes) + panel shadow
  modalScrim: string;
  modalShadow: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    soft: '#f0f0f2',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    blue: '#319ED8',
    warn: '#c98a00',
    navActive: '#ffffff',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    logoFilter: undefined,
    modalScrim: 'rgba(0,0,0,0.42)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.24)',
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    soft: '#26262a',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    blue: '#319ED8',
    warn: '#e8b34b', // brightened warning accent on dark
    navActive: '#1e1e20',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    logoFilter: 'invert(1) brightness(1.8)',
    modalScrim: 'rgba(0,0,0,0.72)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const MOCK_PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean }> }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Catalog',
    icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'White Label', icon: NavLayers, soon: true },
      { label: 'GoodDeed Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave, soon: true },
      { label: 'Templates', icon: NavTemplate, soon: true },
    ],
  },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function PressShell({ active, t, children }: { active: string; t: Theme; children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            Memphis Record Pressing
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 flex-shrink-0', t.avatarRing)}>
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.soft }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {MOCK_PRESS_NAV.map((item) => {
              if (item.children) {
                const groupActive = item.label === active;
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !groupActive && t.hoverWash)}
                      style={{
                        fontWeight: groupActive ? 600 : 500,
                        color: groupActive ? t.ink : t.subink,
                        backgroundColor: groupActive ? t.navActive : undefined,
                        boxShadow: groupActive ? t.navShadow : undefined,
                      }}
                    >
                      <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    </button>
                    <div className="space-y-0.5">
                      {item.children.map(({ label, icon: Icon, soon }) => {
                        const isActive = label === active;
                        return (
                          <a
                            key={label}
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                            style={{
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? t.ink : t.subink,
                              backgroundColor: isActive ? t.navActive : undefined,
                              boxShadow: isActive ? t.navShadow : undefined,
                            }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                            <span className="truncate flex-1">{label}</span>
                            {soon && (
                              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.soft, color: t.subink }}>
                                Request
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              const { label, icon: Icon } = item;
              const isActive = label === active;
              return (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !isActive && t.hoverWash)}
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? t.ink : t.subink,
                    backgroundColor: isActive ? t.navActive : undefined,
                    boxShadow: isActive ? t.navShadow : undefined,
                  }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                  <span className="truncate flex-1">{label}</span>
                </a>
              );
            })}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Row({ label, value, sub, t }: { label: string; value: string; sub?: string; t: Theme }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 group" style={{ borderBottom: `1px solid ${t.hairline}` }}>
      <div className="min-w-0">
        <div className="text-[12px]" style={{ color: t.subink }}>{label}</div>
        <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>{value}</div>
        {sub && <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>{sub}</div>}
      </div>
      <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
        <Pencil className="w-3 h-3" />
        Correct
      </button>
    </div>
  );
}

const MOCK_RULES: Array<{ text: string; kind: 'auto' | 'eye' | 'both' }> = [
  { text: 'Art minimum 300ppi', kind: 'auto' },
  { text: '1-bit images minimum 800ppi', kind: 'auto' },
  { text: 'CMYK mode; Pantone spot inks stay as spot; no RGB', kind: 'auto' },
  { text: 'Art extends to the bleed line', kind: 'auto' },
  { text: 'Important text and graphics inside the safety line', kind: 'both' },
  { text: 'Final art submitted as high-resolution PDF with bleed included', kind: 'auto' },
  { text: 'Template layer deleted before submission', kind: 'auto' },
];

function RuleKind({ kind, t }: { kind: 'auto' | 'eye' | 'both'; t: Theme }) {
  const items = kind === 'auto' ? [{ Icon: Cpu, label: 'Automated' }] : kind === 'eye' ? [{ Icon: Eye, label: 'Check by eye' }] : [{ Icon: Cpu, label: 'Automated' }, { Icon: Eye, label: 'Plus judgment' }];
  return (
    <span className="flex items-center gap-2.5 flex-shrink-0">
      {items.map(({ Icon, label }) => (
        <span key={label} className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: t.faint }}>
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
      ))}
    </span>
  );
}

export default function PressTemplateIngestion() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [testOpen, setTestOpen] = useState(false);
  return (
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Breadcrumb — Templates lands back on the library exactly where you left it
            (format + size preserved: Vinyl · 12″). */}
        {/* Canon breadcrumb — GDS Breadcrumb pattern: FAINT links, ChevronRight
            separators, current page in INK. Templates / Vinyl · 12″ land back on
            the library exactly where you left it. */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb-ingestion">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" className="transition-opacity hover:opacity-70" style={{ color: t.faint }} data-testid="link-back-templates">Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className="transition-opacity hover:opacity-70" style={{ color: t.faint }} data-testid="link-back-vinyl-12">Vinyl · 12″</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Center labels</span></li>
          </ol>
        </nav>
        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Center labels. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>12″ LP.</span>
            </h1>
        {/* Official file identity lives under the heading — name + provenance,
            download revealed on hover. Replaces the old intro paragraph and the
            source-file strip (the big printed-areas images just below carry the
            visual now). */}
            <div className="mt-1.5 group/file" data-testid="file-identity">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13.5px] font-medium truncate" style={{ color: t.ink }}>12-LBL100M-2 — 12in Center Labels for 2LP.pdf</span>
                <button
                  type="button"
                  title="Download the official template"
                  aria-label="Download the official template"
                  className="flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity hover:opacity-80"
                  style={{ color: t.blue }}
                  data-testid="button-download-template"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          {/* Canon ghost pill — quiet until hover; its baseline sits with the
              provenance line, right above the Printed areas card. */}
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className={cn('h-8 px-4 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors', t.hoverWash)}
            style={{ color: t.subink, border: `1px solid ${t.hairline}`, backgroundColor: 'transparent' }}
            data-testid="button-test-template"
          >
            Test
          </button>
        </div>

        {/* Printed areas first — coming back to this page, you see the template
            itself before the fine print. The SHARED study device (inlined
            above), same spec as the study tab — no drift. */}
        <div className="mt-5">
          <PrintedAreasStudy spec={MOCK_SPEC} embedded theme={mode === 'dark' ? STUDY_DARK : STUDY_LIGHT} />
        </div>

        {/* Used by — where this template is linked. Print prep and Components point
            at templates by name; this card shows every package that leans on it. */}
        <div className="mt-4 rounded-2xl px-5 pt-4 pb-4" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-used-by">
          <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Used by</h3>
          <div className="mt-3 grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>GoodTunes® Packages</div>
              <div className="mt-1.5 text-[13px]" style={{ color: t.subink }}>12″ 1LP — Standard</div>
              <div className="mt-1 text-[13px]" style={{ color: t.subink }}>12″ 2LP — Gatefold</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Memphis Record Pressing Packages</div>
              <div className="mt-1.5 text-[13px]" style={{ color: t.faint }}>None yet — quick-pick packages you build will link here.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Identity */}
          <div className="rounded-2xl px-5 pt-4 pb-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Identity</h3>
              <span className="text-[11.5px]" style={{ color: t.faint }}>Extracted — please verify</span>
            </div>
            <div className="mt-2">
              <Row label="Press" value="Memphis Record Pressing" t={t} />
              <Row label="Component" value={'12" LP center label'} sub="Pre-filled — the template names itself. Change it if we misread." t={t} />
              <div className="flex items-start justify-between gap-4 py-2.5 group" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Variant</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>2LP · 100mm trim size</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.warn }}>Read from curved title text — worth a second look.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
              <Row label="Template code" value="12-LBL100M-2" t={t} />
              <div className="flex items-start justify-between gap-4 py-2.5 group">
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Revision</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>R-091125</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>R-072326 is live canon for this code — confirming supersedes it. Jobs in flight get flagged.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
            </div>
          </div>

          {/* Geometry */}
          <div className="rounded-2xl px-5 pt-4 pb-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Geometry</h3>
            </div>
            <div className="mt-2">
              <Row label="Cut" value="100 mm diameter" t={t} />
              <Row label="Center hole" value="7 mm" t={t} />
              <Row label="Bleed ring" value="103 mm" sub="Art must reach this line" t={t} />
              <Row label="Safety ring" value="95 mm" sub="Text and important graphics stay inside" t={t} />
              <div className="py-2.5 group flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Side map</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>A + B required · C + D for double LP</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>Required page count derives from each project's LP count.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Printed areas — the visual verification Bill asked for: the machine
            detected the areas (pages) and drew the zones it measured; the press
            verifies by LOOKING, not by proofreading millimeters. Clicking a zone
            chip animates that ring on both thumbs. Same overlays later power the
            artist's drag-and-drop fit check. Zone state = word + ring, never
            color alone (colorblind rule). */}

        {/* The preview thumbnail was cropped from
            the template's GT PREVIEW layer (a circle for center labels; a rect
            sized per component otherwise). Its position + area become THE
            preview window everywhere: here on ingestion, on the artist's upload
            (layer hidden, so only art shows), and on the good-file / blind-file
            certification tests. One crop, one truth. */}

        {/* Rules */}
        <div className="mt-4 rounded-2xl px-5 pt-4 pb-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Rules — each becomes a check</h3>
            <span className="text-[11.5px]" style={{ color: t.faint }}>Lifted from the printed instructions</span>
          </div>
          <div className="mt-2">
            {MOCK_RULES.map((r, i) => (
              <div key={r.text} className="flex items-center justify-between gap-4 py-2.5" style={{ borderBottom: i < MOCK_RULES.length - 1 ? `1px solid ${t.hairline}` : undefined }}>
                <span className="text-[13px]" style={{ color: t.ink }}>{r.text}</span>
                <RuleKind kind={r.kind} t={t} />
              </div>
            ))}
          </div>
        </div>

        {/* Test modal — same upload pattern as the Templates library modal:
            drop zone + choose file. First a finished file you know is right,
            then a blind second file. Scrim stays dark-tinted in both themes. */}
        {testOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: t.modalScrim }} onClick={() => setTestOpen(false)} data-testid="overlay-test-template">
            <div className="rounded-3xl px-8 pt-7 pb-8" style={{ width: 520, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-[17px] font-semibold" style={{ color: t.ink }}>Test this template.</div>
                  <div className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Upload a finished file you know is right — we&rsquo;ll run every check against it. Then a blind second file.</div>
                </div>
                <button type="button" className="text-[13px] hover:opacity-80 flex-shrink-0" style={{ color: t.subink }} onClick={() => setTestOpen(false)} data-testid="button-close-test">Close</button>
              </div>
              <div className="mt-5 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.soft }}>
                <FileText className="w-6 h-6 mb-2.5" style={{ color: t.faint }} />
                <div className="text-[13.5px] font-medium" style={{ color: t.ink }}>Drop the finished file here</div>
                <div className="mt-1 text-[12px]" style={{ color: t.faint }}>PDF with bleed included · layered vector preferred</div>
                <button type="button" className={cn('mt-4 h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }} data-testid="button-choose-test-file">
                  Choose file…
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
