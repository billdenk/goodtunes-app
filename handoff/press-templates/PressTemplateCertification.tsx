// PressTemplateCertification — Surface 2 from the template-canon brief.
// Certification proves the canon works before any customer file touches
// it: a correct control file (the finished CALIFORNIALAND center labels,
// artist Niina Soleil) must pass clean, and a known-bad file with seeded
// errors must be rejected with every planted error called out by name.
// The results view is a side-by-side that reads as PROOF, not a log.
// Statuses are icon + word — never color alone.
// Shares the apple-canon press shell verbatim — no drift.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.
//
// HANDOFF: self-contained verbatim-replacement screen. Everything the
// screen needs is inlined here (press shell chrome, THEMES, the full
// PrintedAreasStudy device + its StudyTheme tokens, and all MOCK_ data).
// Allowed imports only: react, lucide-react, and ./assets/* images.

import { createContext, useContext, useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, Cog, Gift,
  Search, Bell, MessageSquarePlus, CheckCircle2, XCircle, ShieldCheck, FileText, ChevronRight, Moon, Sun,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import mrpLogo from './assets/mrp-logo.svg';
import goodtunesLogo from './assets/goodtunes-logo.png';
import brandonPhoto from './assets/brandon-seavers.png';
import gtPreviewTemplate from './assets/gt-preview-template-circle.png';
import niinaLabel1 from './assets/niina-label-1.png';
import niinaLabel2 from './assets/niina-label-2.png';

// ══════════════════════════════════════════════════════════════════════
// PrintedAreasStudy — shared study device, inlined verbatim.
// _PrintedAreasStudy — shared device for the six "Printed areas" study tabs
// (center label, inner sleeve, jacket · template vs Niina's finished art).
// Interaction contract: pick a zone in the segmented control → the matching
// ring pulses on every panel, word tag rides the image (word + ring, never
// color alone); Lines/Areas toggle → Areas dims everything outside the zone's
// actual region; panels with allowFlip get a view-only "Flip 180°"; click a
// panel → expanded view.
// ══════════════════════════════════════════════════════════════════════

// ─── Theme tokens — surfaces / text / hairlines only ─────────────────
// This is a SHARED study device embedded by parent pages that own the
// theme toggle, so it owns no mode state and no View pill. Parents pass a
// StudyTheme (defaulting to STUDY_DARK). Dark is the canon default and its
// values are the exact hardcoded charcoal tokens this file always used —
// dark rendering stays pixel-identical. Only surface/text/hairline colors
// are themed; the WHITE printed-artwork panel, the colorblind-safe zone
// status colors (greens/amber/blue accents), and word tags stay identical
// across both themes.
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

// ══════════════════════════════════════════════════════════════════════
// MOCK data — dummy specs for the two embedded study cards.
// ══════════════════════════════════════════════════════════════════════

// The MRP 12" center-label TEMPLATE (12-LBL100M-2) with the measured zones
// drawn on: the view the press verifies at ingestion time.
const MOCK_TEMPLATE_SPEC: StudySpec = {
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

// Niina Soleil's FINISHED center-label art (Californialand) with the same
// measured zones drawn over it — used here as the certification TEST file.
// Title override: 'Test.' (this is the press-side certification test, not
// the customer's proof).
const MOCK_NIINA_SPEC: StudySpec = {
  title: 'Test.', titleRest: 'Center labels 12″',
  caption: 'Niina Soleil, Californialand · 12-LBL100M-2 zones · 2 pages → 2 areas',
  shape: 'circle',
  defaultZone: 'safe',
  zones: [
    { id: 'bleed', word: 'Bleed', detail: '103 mm — art must reach', inset: '0%', status: 'ok' },
    { id: 'cut', word: 'Cut', detail: '100 mm — trimmed edge', inset: '3.5%', status: 'ok' },
    { id: 'safe', word: 'Safe', detail: '95 mm — text stays inside', inset: '8%', status: 'ok' },
    { id: 'hole', word: 'Hole', detail: '7 mm punched — keep text clear around it', centered: ['9%', '22%'], status: 'ok' },
  ],
  panels: [
    { label: 'Side A', sub: 'Welcome to the Dream — 33⅓ RPM', img: niinaLabel1 },
    { label: 'Side B', sub: 'In the Darkness of the Desert — 33⅓ RPM', img: niinaLabel2 },
  ],
};

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──
// The whole page (shell chrome + result cards) reads from THEMES[mode].
// Dark stays the default so the canon rendering is byte-identical.
type Theme = {
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  // status accents (word + shape carry meaning; color is supportive only)
  ready: string;
  crit: string;
  readyWash: string;   // soft fill behind the ready verdict/pill
  critWash: string;    // soft fill behind the fail verdict
  neutralWash: string; // fill behind the neutral (control) header icon
  // active nav pill shadow
  navShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // breadcrumb / link hover ink class
  hoverInk: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // pop-out overlay backdrop (stays dark-tinted in both themes)
  overlayScrim: string;
  overlayShadow: string;
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
    ready: '#1c8a5b',
    crit: '#e0245e',
    readyWash: 'rgba(28,138,91,0.10)',
    critWash: 'rgba(224,36,94,0.10)',
    neutralWash: 'rgba(0,0,0,0.05)',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    hoverInk: 'hover:text-black',
    logoFilter: undefined,
    overlayScrim: 'rgba(0,0,0,0.55)',
    overlayShadow: '0 24px 80px rgba(0,0,0,0.28)',
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
    ready: '#34c98e',
    crit: '#ff5d8f',
    readyWash: 'rgba(52,201,142,0.12)',
    critWash: 'rgba(255,93,143,0.12)',
    neutralWash: 'rgba(255,255,255,0.06)',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    hoverInk: 'hover:text-white',
    logoFilter: 'invert(1) brightness(1.8)',
    overlayScrim: 'rgba(0,0,0,0.72)',
    overlayShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Apple-canon press shell (duplicated verbatim across all press mocks — no drift) ───
const PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean }> }> = [
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
            {PRESS_NAV.map((item) => {
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
                        backgroundColor: groupActive ? t.card : undefined,
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
                              backgroundColor: isActive ? t.card : undefined,
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
                    backgroundColor: isActive ? t.card : undefined,
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

// One shared parameter list — the same row in all three columns.
// Control = the canon value; good = the known-good file's result;
// blind = the blind file's result (four seeded errors land on their rows).
type CellResult = { tone: 'pass' | 'fail'; detail: string };
const MOCK_PARAM_ROWS: Array<{ param: string; control: string; good: CellResult; blind: CellResult }> = [
  {
    param: 'Trim',
    control: '100 mm cut',
    good: { tone: 'pass', detail: '100 mm — matches canon' },
    blind: { tone: 'pass', detail: '100 mm — matches canon' },
  },
  {
    param: 'Center hole',
    control: '7 mm',
    good: { tone: 'pass', detail: '7 mm — matches canon' },
    blind: { tone: 'pass', detail: '7 mm — matches canon' },
  },
  {
    param: 'Sides',
    control: 'A + B required · single LP',
    good: { tone: 'pass', detail: 'A + B present' },
    blind: { tone: 'pass', detail: 'A + B present' },
  },
  {
    param: 'Bleed',
    control: '103 mm · template layer, not PDF bleed box',
    good: { tone: 'pass', detail: 'Art reaches the template\u2019s line' },
    blind: { tone: 'pass', detail: 'Art reaches the template\u2019s line' },
  },
  {
    param: 'Safety',
    control: 'All text inside 95 mm ring',
    good: { tone: 'pass', detail: 'All text inside the ring' },
    blind: { tone: 'fail', detail: 'Track list crosses the 95 mm line on Side A' },
  },
  {
    param: 'Color',
    control: 'CMYK · PMS 877 C stays spot',
    good: { tone: 'pass', detail: 'CMYK · spot preserved' },
    blind: { tone: 'fail', detail: 'RGB objects planted on Side B' },
  },
  {
    param: 'Resolution',
    control: '300 ppi floor · 800 ppi 1-bit',
    good: { tone: 'pass', detail: '350 ppi' },
    blind: { tone: 'fail', detail: '1-bit logo at 600 ppi — floor is 800' },
  },
  {
    param: 'File hygiene',
    control: 'Template layer removed',
    good: { tone: 'pass', detail: 'Layer removed' },
    blind: { tone: 'fail', detail: 'Layer \u201CTEMPLATE — DELETE\u201D still present' },
  },
];

const ROW_H = 64; // exact height in all three columns so every row sits on the same line
const HEADER_H = 96;

// The GT PREVIEW window from the control template — same circle, same
// position, rendered for each file so the three columns compare like
// with like. Control shows the guides; the test files show only art.

function ResultCell({ result, t }: { result: CellResult; t: Theme }) {
  const color = result.tone === 'pass' ? t.ready : t.crit;
  const Icon = result.tone === 'pass' ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-2.5 py-3" style={{ height: ROW_H, overflow: 'hidden', borderBottom: `1px solid ${t.hairline}` }}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold" style={{ color }}>{result.tone === 'pass' ? 'Pass' : 'Fail'}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{result.detail}</div>
      </div>
    </div>
  );
}

function Verdict({ tone, title, sub, t }: { tone: 'pass' | 'fail'; title: string; sub: string; t: Theme }) {
  const color = tone === 'pass' ? t.ready : t.crit;
  const Icon = tone === 'pass' ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-3.5 px-6 py-5">
      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tone === 'pass' ? t.readyWash : t.critWash }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </span>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{title}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{sub}</div>
      </div>
    </div>
  );
}

export default function PressTemplateCertification() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const studyTheme = mode === 'dark' ? STUDY_DARK : STUDY_LIGHT;
  // Pop-out review — one card at a time, never both.
  const [popout, setPopout] = useState<'template' | 'test' | null>(null);
  return (
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Canon breadcrumb — GDS Breadcrumb pattern: FAINT links, ChevronRight
            separators, current page in INK. */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb-certification">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Vinyl · 12″</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Center labels</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Test</span></li>
          </ol>
        </nav>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Test. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Center labels 12″ LP.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
              Upload a finished file you know is right. Every check runs against the template — the verdict
              proves the canon works before any customer file touches it.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0" style={{ color: t.ready, border: `1px solid ${t.ready}59`, backgroundColor: t.readyWash }}>
            <ShieldCheck className="w-4 h-4" />
            Certified · Sep 14, 2026
          </span>
        </div>

        {/* Side-by-side review — the shared study device, template left, the
            uploaded test file right. Click the pop-out to review ONE at a
            time, full width; never both at once. */}
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {([
            { key: 'template' as const, spec: MOCK_TEMPLATE_SPEC, label: 'template' },
            // Press side: this is the TEST, not the customer's proof. Caption
            // trimmed so it holds one line at half width.
            { key: 'test' as const, spec: { ...MOCK_NIINA_SPEC, title: 'Test.', caption: 'Niina Soleil, Californialand · 2 pages → 2 areas' }, label: 'test file' },
          ]).map(({ key, spec, label }) => (
            <div key={key} className="relative group/pop">
              <PrintedAreasStudy
                spec={spec}
                embedded
                panelSize={190}
                theme={studyTheme}
                headerAction={key === 'test' ? (
                  <button
                    type="button"
                    className={cn('mr-8 inline-flex items-center gap-1.5 text-[12.5px] font-medium flex-shrink-0 transition-colors', t.hoverInk)}
                    style={{ color: t.subink }}
                    data-testid="button-upload-again"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 9.5V2.5M7 2.5 4.5 5M7 2.5 9.5 5M2 9.5v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
                    </svg>
                    Upload again
                  </button>
                ) : undefined}
              />
              <button
                type="button"
                onClick={() => setPopout(key)}
                title={`Review the ${label} full width`}
                aria-label={`Review the ${label} full width`}
                className="absolute z-10 flex items-center justify-center opacity-0 group-hover/pop:opacity-60 hover:!opacity-100 transition-opacity"
                style={{ top: 18, right: 16, width: 22, height: 22, color: t.subink }}
                data-testid={`button-popout-${key}`}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <path d="M7.5 1.5h3v3M10.5 1.5 7 5M4.5 10.5h-3v-3M1.5 10.5 5 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {popout && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-12 px-10" style={{ backgroundColor: t.overlayScrim }} onClick={() => setPopout(null)} data-testid="overlay-cert-popout">
            <div className="w-full" style={{ maxWidth: 1080, boxShadow: t.overlayShadow }} onClick={(e) => e.stopPropagation()}>
              <PrintedAreasStudy spec={popout === 'template' ? MOCK_TEMPLATE_SPEC : { ...MOCK_NIINA_SPEC, title: 'Test.' }} embedded theme={studyTheme} />
            </div>
          </div>
        )}

        {/* Two columns — each reads as the fine print of the card above it:
            control values under the template, check results under the test file. */}
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* 1 · The known control template — what both files are measured against */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center gap-3.5 px-6 py-5" style={{ height: HEADER_H, overflow: 'hidden' }}>
              <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.neutralWash }}>
                <FileText className="w-5 h-5" style={{ color: t.subink }} />
              </span>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>The control template</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>12-LBL100M-2 · the canon both files are measured against</div>
              </div>
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {MOCK_PARAM_ROWS.map((row) => (
                <div key={row.param} className="py-3" style={{ height: ROW_H, overflow: 'hidden', borderBottom: `1px solid ${t.hairline}` }}>
                  <div className="text-[12.5px] font-semibold" style={{ color: t.ink }}>{row.param}</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{row.control}</div>
                </div>
              ))}
              <div className="flex items-center py-3.5 text-[12.5px]">
                <span style={{ color: t.faint }}>Confirmed as canon · Sep 14, 2026</span>
              </div>
            </div>
          </div>

          {/* 2 · A file done the right way — passes */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div style={{ height: HEADER_H, overflow: 'hidden' }}>
              <Verdict tone="pass" title="The test file" sub="CALIFORNIALAND center labels · Niina Soleil · passed clean" t={t} />
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {MOCK_PARAM_ROWS.map((row) => (
                <ResultCell key={row.param} result={row.good} t={t} />
              ))}
              <div className="flex items-center justify-between py-3.5 text-[12.5px]">
                <span style={{ color: t.subink }}>8 of 8 checks passed</span>
                <span style={{ color: t.faint }}>Preview rendered</span>
              </div>
            </div>
          </div>

        </div>

        <p className="mt-4 text-[12px]" style={{ color: t.faint }}>
          If this template is superseded by a new revision, the test file stays attached and re-runs
          automatically against the new canon.
        </p>
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-[60] h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
