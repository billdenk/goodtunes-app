// PrintedAreasStudy — shared study device, extracted verbatim from the
// Ruby press-templates handoff (handoff/press-templates/PressTemplateIngestion.tsx
// + PressTemplateCertification.tsx, where it was inlined IDENTICALLY). The
// interaction contract is unchanged: pick a zone in the segmented control →
// the matching ring pulses on every panel, a word tag rides the image (word +
// ring, never color alone); Lines/Areas toggle → Areas dims everything outside
// the zone's actual region; every panel gets a view-only "Flip 180°"; click a
// panel → expanded view.
//
// Difference from the mock: `zones` and `panels` are OPTIONAL on StudySpec —
// real API data may lack a zone (no bleed line measured) or a panel image, so
// callers omit what they don't have. Panels with no real image fall back to
// the gt-preview-template-circle placeholder as the diagram backdrop.
//
// The visuals — the WHITE printed-artwork panel, the colorblind-safe zone
// status colors, the word tags — are kept handoff-verbatim. Themeing is
// surface/ink/hairline only, via the StudyTheme the caller passes.

import { createContext, useContext, useEffect, useState } from "react";
import gtPreviewTemplate from "../../pages/press-templates/assets/gt-preview-template-circle.png";

// ─── Study theme tokens — surfaces / text / hairlines only ───────────
export type StudyTheme = {
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

export const STUDY_DARK: StudyTheme = {
  canvas: "#161617",
  card: "#1e1e20",
  cardSoft: "#232325",
  chip: "#3a3a3c",
  tooltip: "#2c2c2e",
  inputBg: "rgba(255,255,255,0.06)",
  hairline: "rgba(255,255,255,0.10)",
  ringIdle: "rgba(255,255,255,0.35)",
  ink: "#f5f5f7",
  subink: "#98989d",
  faint: "#6e6e73",
  blue: "#319ED8",
  dim: "rgba(24,24,26,0.78)",
  popoverShadow: "0 16px 48px rgba(0,0,0,0.55)",
  modalShadow: "0 24px 80px rgba(0,0,0,0.6)",
};

export const STUDY_LIGHT: StudyTheme = {
  canvas: "#f5f5f7",
  card: "#ffffff",
  cardSoft: "#ffffff",
  chip: "#ffffff",
  tooltip: "#ffffff",
  inputBg: "#f0f0f2",
  hairline: "#e6e6ea",
  ringIdle: "rgba(0,0,0,0.28)",
  ink: "#1d1d1f",
  subink: "#6e6e73",
  faint: "#a1a1a6",
  blue: "#319ED8",
  dim: "rgba(24,24,26,0.78)",
  popoverShadow: "0 16px 48px rgba(0,0,0,0.18)",
  modalShadow: "0 24px 80px rgba(0,0,0,0.28)",
};

const ThemeCtx = createContext<StudyTheme>(STUDY_DARK);
const useT = () => useContext(ThemeCtx);

export type StudyZone = {
  id: string;
  word: string;
  detail: string;
  /** Inset ring following the panel edge (circle or rounded-rect). */
  inset?: string;
  /** Centered rings (e.g. spindle hole + keep-clear, die-cut opening). */
  centered?: string[];
  /** Dashed line along the panel's fold edge (per-panel edge). */
  fold?: boolean;
  /** Fit-check verdict for finished-art tabs: ✓ at a glance, ✕ needs attention. */
  status?: "ok" | "attention";
};

export type StudyPanel = {
  label: string;
  sub?: string;
  /** Real diagram image; when omitted the circle placeholder is used. */
  img?: string;
  /** Which edge is the fold/score line, when the zone set includes one. */
  foldEdge?: "top" | "bottom";
  /** Vertical fold/score lines (spine etc.), as left-% positions. */
  foldLines?: string[];
  /** Width ÷ height. Defaults to 1 (square/circle). */
  aspect?: number;
  /** @deprecated Flip is now available on every panel; kept for old specs. */
  allowFlip?: boolean;
  /** Fit-check flag: natural-language finding raised for this panel. */
  flag?: { headline: string; detail: string };
  /** Auto-remediated version (art scaled inside safety, background matched). */
  fixImg?: string;
};

export type StudySpec = {
  title: string;
  caption: string;
  /** Zones drawn over the artwork — optional; omit any not measured. */
  zones?: StudyZone[];
  /** Panels (pages/sides) — optional; omit when there is nothing to show. */
  panels?: StudyPanel[];
  shape: "circle" | "square";
  defaultZone: string;
  footnote?: string;
  /** Optional gray tail after the bold lead word, e.g. title "Proof." + titleRest "Inner sleeve 12″". */
  titleRest?: string;
};

type ViewMode = "lines" | "areas";

/** In Areas mode: dim everything except the zone's real region. */
function RegionDim({ spec, zoneDef, circle }: { spec: StudySpec; zoneDef: StudyZone; circle: boolean }) {
  const t = useT();
  const round = circle ? "rounded-full" : "rounded-md";
  const edge = `1.5px solid ${t.blue}`;
  if (zoneDef.centered) {
    const sorted = [...zoneDef.centered].sort((a, b) => parseFloat(b) - parseFloat(a));
    const [outer, inner] = sorted;
    return (
      <>
        <div className="absolute rounded-full pointer-events-none" style={{ left: "50%", top: "50%", width: outer, height: outer, transform: "translate(-50%, -50%)", boxShadow: `0 0 0 4000px ${t.dim}`, border: edge }} />
        {inner && (
          <div className="absolute rounded-full pointer-events-none" style={{ left: "50%", top: "50%", width: inner, height: inner, transform: "translate(-50%, -50%)", backgroundColor: t.dim, border: edge }} />
        )}
      </>
    );
  }
  if (zoneDef.inset !== undefined) {
    if (zoneDef.id === "bleed") {
      const cut = (spec.zones ?? []).find((z) => z.id === "cut");
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
  const zones = spec.zones ?? [];
  const circle = spec.shape === "circle";
  const ringStyle = (active: boolean) => ({
    border: active ? `2.5px dashed ${t.blue}` : `1px dashed ${t.ringIdle}`,
    transition: "border 120ms ease",
  });
  const zoneDef = zone ? zones.find((z) => z.id === zone) : null;
  const areas = mode === "areas" && zoneDef && !zoneDef.fold;
  const imgSrc = fixed && panel.fixImg ? panel.fixImg : panel.img ?? gtPreviewTemplate;
  // Word tag: appears centered when the zone changes, then fades away.
  const [tagShown, setTagShown] = useState(false);
  useEffect(() => {
    if (!zone) return;
    setTagShown(true);
    const timer = setTimeout(() => setTagShown(false), 1600);
    return () => clearTimeout(timer);
  }, [zone]);
  const aspect = panel.aspect ?? 1;
  const width = Math.round(size * Math.max(aspect, 1));
  const height = Math.round(width / aspect);
  const foldEdgeFor = (e: "top" | "bottom") => (flipped ? (e === "top" ? "bottom" : "top") : e);
  return (
    <div className="relative flex flex-col items-center" data-testid={`study-thumb-${panel.label.toLowerCase().replace(/ /g, "-")}`}>
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
          title={flipped ? "Showing upside-down — click for as-printed" : "Flip top-to-bottom (view only)"}
          aria-label={flipped ? "Show as printed" : "Flip top to bottom"}
          className={`absolute z-20 flex items-center justify-center transition-opacity hover:opacity-100 ${flipped ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}
          style={{ top: 28, right: -26, width: 20, height: 20, color: flipped ? t.blue : t.subink, background: "transparent" }}
          data-testid={`button-flip-${panel.label.toLowerCase().replace(/ /g, "-")}`}
        >
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
        className={`relative overflow-hidden w-full h-full ${circle ? "rounded-full" : "rounded-lg"} ${onExpand ? "cursor-zoom-in transition-transform hover:scale-[1.02]" : "cursor-default"}`}
        style={{ backgroundColor: "#fff", border: `1px solid ${t.hairline}` }}
        aria-label={onExpand ? `Expand ${panel.label}` : undefined}
      >
        <img
          src={imgSrc}
          alt={`${panel.label} — printed area with zones`}
          className="w-full h-full object-cover"
          style={{ transform: flipped ? "rotate(180deg)" : undefined, transition: "transform 220ms ease" }}
        />
        {!areas && zones.map(({ id, inset, centered, fold }) => {
          const active = zone === id;
          if (fold) {
            if (!active) return null;
            const lineStyle = `2.5px dashed ${t.blue}`;
            if (panel.foldLines) {
              return panel.foldLines.map((left) => (
                <div
                  key={`${id}-${left}`}
                  className={`absolute top-[4%] bottom-[4%] pointer-events-none ${active ? "animate-pulse" : ""}`}
                  style={{ left, width: 0, borderLeft: lineStyle, transition: "border 120ms ease" }}
                />
              ));
            }
            const edge = foldEdgeFor(panel.foldEdge ?? "bottom");
            return (
              <div
                key={id}
                className={`absolute left-[6%] right-[6%] pointer-events-none ${active ? "animate-pulse" : ""}`}
                style={{ [edge]: "1.5%", height: 0, borderTop: lineStyle, transition: "border 120ms ease" }}
              />
            );
          }
          if (centered) {
            return centered.map((d) => (
              <div
                key={`${id}-${d}`}
                className={`absolute rounded-full pointer-events-none ${active ? "animate-pulse" : ""}`}
                style={{ left: "50%", top: "50%", width: d, height: d, transform: "translate(-50%, -50%)", ...ringStyle(active) }}
              />
            ));
          }
          return (
            <div
              key={id}
              className={`absolute pointer-events-none ${circle ? "rounded-full" : "rounded-md"} ${active ? "animate-pulse" : ""}`}
              style={{ inset, ...ringStyle(active) }}
            />
          );
        })}
        {areas && zoneDef && <RegionDim spec={spec} zoneDef={zoneDef} circle={circle} />}
        {mode === "areas" && zoneDef?.fold && zones.filter((z) => z.fold).map(({ id }) => {
          const lineStyle = `2.5px dashed ${t.blue}`;
          if (panel.foldLines) {
            return panel.foldLines.map((left) => (
              <div key={`${id}-a-${left}`} className="absolute top-[4%] bottom-[4%] pointer-events-none animate-pulse" style={{ left, width: 0, borderLeft: lineStyle }} />
            ));
          }
          const edge = foldEdgeFor(panel.foldEdge ?? "bottom");
          return <div key={`${id}-a`} className="absolute left-[6%] right-[6%] pointer-events-none animate-pulse" style={{ [edge]: "1.5%", height: 0, borderTop: lineStyle }} />;
        })}
        {zoneDef && (
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[12px] font-semibold z-10 pointer-events-none transition-opacity duration-700 ${tagShown ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            style={{ backgroundColor: "rgba(22,22,23,0.85)", color: "#fff" }}
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
            title={flagDecision ? (flagDecision.status === "fixed" ? "Fixed — click for details" : "Accepted as-is — click for details") : "Needs attention — click for details"}
            aria-label={flagDecision ? "Fit check resolved — details" : "Fit check needs attention — details"}
            className={`flex items-center justify-center rounded-full ${!flagDecision && !flagOpen ? "animate-pulse" : ""}`}
            style={{ width: 17, height: 17, backgroundColor: flagDecision ? (flagDecision.status === "review" ? t.blue : "#34C759") : "#FF9F0A", color: flagDecision?.status === "review" ? "#fff" : "#1c1c1e", fontSize: 11, fontWeight: 700, lineHeight: 1 }}
            data-testid={`badge-flag-${panel.label.toLowerCase().replace(/ /g, "-")}`}
          >
            {flagDecision ? (flagDecision.status === "review" ? "→" : "✓") : "!"}
          </button>
        )}
        {panel.label}
      </div>
      {flagOpen && panel.flag && (
        <div
          className="absolute z-40 text-left"
          style={{ left: "50%", top: height + 40, transform: "translateX(-50%)", width: 460, maxWidth: "92vw" }}
          data-testid={`popover-flag-${panel.label.toLowerCase().replace(/ /g, "-")}`}
        >
          <FitFlagCard panel={panel} decision={flagDecision} onFix={onFlagFix!} onAccept={onFlagAccept!} onReview={onFlagReview} onReset={onFlagReset!} onClose={onFlagToggle} />
        </div>
      )}
      {panel.sub && <div className="text-[11.5px]" style={{ color: t.faint }}>{panel.sub}</div>}
      <div className="flex items-center gap-2">
      {panel.fixImg && onFix && (
        <button
          type="button"
          onClick={onFix}
          className="mt-1.5 text-[11.5px] rounded-full px-3 py-1 transition-colors"
          style={{ color: fixed ? "#fff" : t.subink, backgroundColor: fixed ? "#34C759" : "transparent", border: fixed ? "1px solid transparent" : `1px solid ${t.hairline}` }}
          data-testid={`button-fix-${panel.label.toLowerCase().replace(/ /g, "-")}`}
        >
          {fixed ? "Fixed — original kept on file" : "Fix — bring inside safety"}
        </button>
      )}
      </div>
    </div>
  );
}

type Decision = { status: "fixed" | "accepted" | "review"; reason?: string };

const ACCEPT_REASONS = [
  "Text is a graphic element — meant to run off the edge",
  "My printer has approved this layout",
  "Other…",
];

function FitFlagCard({ panel, decision, onFix, onAccept, onReview, onReset, onClose }: { panel: StudyPanel; decision?: Decision; onFix: () => void; onAccept: (reason: string) => void; onReview?: (recipient: string) => void; onReset: () => void; onClose?: () => void }) {
  const t = useT();
  const [accepting, setAccepting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState(ACCEPT_REASONS[0]);
  const [other, setOther] = useState("");
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
    const fixed = decision.status === "fixed";
    const review = decision.status === "review";
    return (
      <div className="relative rounded-[10px] px-4 py-3 pr-10 flex items-start gap-3" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, boxShadow: onClose ? t.popoverShadow : "none" }} data-testid={`flag-resolved-${panel.label.toLowerCase()}`}>
        {closeButton}
        <span className="mt-0.5 text-[13px]" style={{ color: review ? t.blue : fixed ? "#34C759" : t.subink }}>{review ? "→" : "✓"}</span>
        <div className="flex-1 text-[12.5px]" style={{ color: t.subink }}>
          <span className="font-semibold" style={{ color: t.ink }}>{panel.label} — {review ? "Sent for review" : fixed ? "Fixed" : "Accepted as-is"}</span>
          <div style={{ color: t.faint }}>
            {review
              ? `Proof report emailed to ${decision.reason} with a link to this page. We'll hold this proof until they respond.`
              : fixed
              ? "A corrected file will be generated for press. The original stays on file."
              : `“${decision.reason}” — original file goes to press unchanged.`}
          </div>
        </div>
        <button type="button" className="text-[12px] hover:opacity-80" style={{ color: t.blue }} onClick={onReset} data-testid={`button-flag-change-${panel.label.toLowerCase()}`}>Change</button>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl px-6 py-5" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, boxShadow: onClose ? t.popoverShadow : "none" }} data-testid={`flag-open-${panel.label.toLowerCase()}`}>
      {closeButton}
      <div>
        <div className="pr-6">
          <div className="text-[13.5px] font-semibold leading-snug flex items-center gap-2" style={{ color: t.ink }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#FF9F0A" }} aria-hidden />
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
                  style={{ backgroundColor: t.blue, color: "#fff" }}
                  data-testid="button-review-send"
                >
                  Send report
                </button>
                <button
                  type="button"
                  onClick={() => { try { navigator.clipboard?.writeText(window.location.href); } catch { /* noop */ } setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                  style={{ color: copied ? "#34C759" : t.subink, border: `1px solid ${t.hairline}` }}
                  data-testid="button-review-copy-link"
                >
                  {copied ? "Link copied" : "Copy link to this proof"}
                </button>
                <button type="button" onClick={() => setReviewing(false)} className="text-[12px] hover:opacity-80" style={{ color: t.subink }} data-testid="button-review-cancel">Back</button>
              </div>
            </div>
          ) : !accepting ? (
            <div className="mt-4 flex items-center gap-2.5">
              {panel.fixImg && (
                <button type="button" onClick={onFix} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: t.blue, color: "#fff" }} data-testid={`button-flag-fix-${panel.label.toLowerCase()}`}>Fix it for me</button>
              )}
              {!panel.fixImg && (
                <button type="button" onClick={() => setReviewing(true)} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: t.blue, color: "#fff" }} data-testid={`button-flag-review-${panel.label.toLowerCase()}`}>Send to design review</button>
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
              {reason === "Other…" && (
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
                  disabled={reason === "Other…" && !other.trim()}
                  onClick={() => onAccept(reason === "Other…" ? other.trim() : reason)}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40"
                  style={{ backgroundColor: "#34C759", color: "#fff" }}
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
  const zones = spec.zones ?? [];
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredDef = hovered ? zones.find((z) => z.id === hovered) : null;
  const seg = (active: boolean) => ({
    color: active ? t.ink : t.subink,
    backgroundColor: active ? t.chip : "transparent",
    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.35)" : "none",
    transition: "all 140ms ease",
  });
  if (zones.length === 0) return null;
  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.inputBg }} data-testid="control-zones">
          {zones.map(({ id, word, status }) => {
            const shown = status === "attention" && resolved ? "ok" : status;
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
                <span aria-label={shown === "ok" ? "okay" : "needs attention"} className="text-[11px] font-bold" style={{ color: shown === "ok" ? "#34C759" : "#FF9F0A", lineHeight: 1 }}>
                  {shown === "ok" ? "✓" : "✕"}
                </span>
              )}
              {word}
            </button>
            );
          })}
        </div>
        {/* View key — dashed square = Lines, shaded square = Areas. */}
        <div className="inline-flex items-center gap-1" data-testid="control-view-mode">
          {(["lines", "areas"] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              title={m === "lines" ? "Lines — printer’s guides" : "Areas — shade everything outside the zone"}
              aria-label={m === "lines" ? "Show guide lines" : "Show zone areas"}
              className="flex items-center justify-center transition-colors hover:opacity-100"
              style={{ width: 24, height: 24, color: mode === m ? t.ink : t.faint, background: "transparent" }}
              data-testid={`toggle-${m}`}
            >
              {m === "lines" ? (
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
        <div className="absolute left-1 top-full mt-1.5 z-30 rounded-lg px-3 py-1.5 text-[12px] pointer-events-none" style={{ backgroundColor: t.tooltip, border: `1px solid ${t.hairline}`, color: t.subink, boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }} data-testid="tooltip-zone">
          <span className="font-semibold" style={{ color: t.ink }}>{hoveredDef.word}</span>
          <span style={{ color: t.faint }}> — {hoveredDef.detail}</span>
        </div>
      )}
    </div>
  );
}

export function PrintedAreasStudy({ spec, embedded, panelSize, headerAction, theme = STUDY_DARK }: { spec: StudySpec; embedded?: boolean; panelSize?: number; headerAction?: React.ReactNode; theme?: StudyTheme }) {
  const t = theme;
  const panels = spec.panels ?? [];
  const [zone, setZone] = useState<string | null>(spec.defaultZone);
  const [mode, setMode] = useState<ViewMode>("lines");
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<StudyPanel | null>(null);
  const flipOf = (p: StudyPanel) => !!flipped[p.label];
  const toggleFlip = (p: StudyPanel) => setFlipped((f) => ({ ...f, [p.label]: !f[p.label] }));
  const [fixedMap, setFixedMap] = useState<Record<string, boolean>>({});
  const fixOf = (p: StudyPanel) => !!fixedMap[p.label];
  const toggleFix = (p: StudyPanel) => setFixedMap((f) => ({ ...f, [p.label]: !f[p.label] }));
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const flaggedPanels = panels.filter((p) => p.flag);
  const resolved = flaggedPanels.length > 0 && flaggedPanels.every((p) => decisions[p.label] && decisions[p.label].status !== "review");
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
          {panels.map((p) => (
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
              onFlagFix={() => { setFixedMap((f) => ({ ...f, [p.label]: true })); setDecisions((d) => ({ ...d, [p.label]: { status: "fixed" } })); }}
              onFlagAccept={(reason) => setDecisions((d) => ({ ...d, [p.label]: { status: "accepted", reason } }))}
              onFlagReview={(recipient) => setDecisions((d) => ({ ...d, [p.label]: { status: "review", reason: recipient } }))}
              onFlagReset={() => { setFixedMap((f) => ({ ...f, [p.label]: false })); setDecisions((d) => { const n = { ...d }; delete n[p.label]; return n; }); }}
            />
          ))}
        </div>
        {expanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.72)" }} onClick={() => setExpanded(null)} data-testid="overlay-study-expanded">
            <div className="rounded-3xl px-10 pt-8 pb-9 flex flex-col items-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }} onClick={(e) => e.stopPropagation()}>
              <div className="w-full flex items-center justify-between gap-8 mb-5">
                <div className="text-[15px] font-semibold" style={{ color: t.ink }}>{expanded.label}{expanded.sub && <span className="font-normal" style={{ color: t.faint }}> · {expanded.sub}</span>}</div>
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
      <div className="min-h-screen font-sans flex items-start justify-center" style={{ fontFamily: "Inter, system-ui, sans-serif", backgroundColor: t.canvas, padding: "48px 40px 72px" }}>
        {card}
      </div>
    </ThemeCtx.Provider>
  );
}
