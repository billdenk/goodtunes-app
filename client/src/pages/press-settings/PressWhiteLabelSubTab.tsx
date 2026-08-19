// Settings › White Label for a press — built verbatim to Ruby's Aug 19 2026
// handoff (handoff/white-label/PressWhiteLabelSettings.tsx). Config sections
// LEFT, one sticky LIVE PREVIEW pane RIGHT that re-skins keystroke-live.
// ONE accent only (ratified): chrome stays ours; their accent applies only
// where the system already uses accent — confirms, links, status icons.
// Always-GoodTunes list: GoodDeed® certificates, the fan-funded pressing
// story, the fan player, "Powered by GoodTunes®" footer.
// Canon: word + icon statuses (Bill is colorblind), quiet pills, "Save
// changes" EARNS its blue only after something changes, real ®, theme-aware.
// NOTE: config is front-end-local for now (no persistence endpoint yet) —
// same staging posture as the estimate page's Share/Ask/Start sheets.
import { useMemo, useState, type ReactNode, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, AlertCircle, Globe, Upload, Mail, Award } from "lucide-react";

const BLUE = "#319ED8";
const INK = "var(--apple-ink)";
const SUBINK = "var(--apple-subink)";
const HAIRLINE = "var(--apple-hairline)";
const CARD = "var(--apple-card, #ffffff)";
const CANVAS = "var(--apple-canvas, #f5f5f7)";
const PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)";

type PressMeLite = {
  name?: string;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  logoUrl?: string | null;
  lightLogoUrl?: string | null;
  squareLogoUrl?: string | null;
  lightSquareLogoUrl?: string | null;
};

// Accent presets — one is deliberately too light so the contrast rule shows.
const ACCENT_PRESETS = [
  { id: "mrp-red", name: "MRP Red", hex: "#B3282D" },
  { id: "ink-blue", name: "Ink Blue", hex: "#1E5AA8" },
  { id: "forest", name: "Forest", hex: "#1F6E43" },
  { id: "plum", name: "Plum", hex: "#6D3FA0" },
  { id: "copper", name: "Copper", hex: "#B4652A" },
  { id: "gold", name: "Gold", hex: "#F2C94C" },
];

const DEFAULT_ACCENT = "#319ED8";

function hexLuminance(hex: string): number {
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "press";
}

function domainFromWebsite(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return host ? `estimates.${host}` : "";
  } catch {
    return "";
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#a1a1a6" }}>
      {children}
    </div>
  );
}

function WordIcon({ icon: Icon, children }: { icon: ComponentType<{ className?: string; style?: React.CSSProperties }>; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: SUBINK }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a1a1a6" }} />
      {children}
    </span>
  );
}

export default function PressWhiteLabelSubTab({ pressId }: { pressId: string }) {
  const { data: me } = useQuery<PressMeLite>({ queryKey: [`/api/press/${pressId}/me`] });
  const pressName = me?.name ?? "Your press";
  const firstWord = pressName.split(/\s+/)[0] || "Your team";
  const subdomain = `${slugify(pressName)}.goodtunes.music`;
  const customDefault = domainFromWebsite(me?.websiteUrl);

  const [domainTier, setDomainTier] = useState<"sub" | "custom">("sub");
  const [customDomain, setCustomDomain] = useState(customDefault);
  const [customTouched, setCustomTouched] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [previewTab, setPreviewTab] = useState<"estimate" | "email">("estimate");
  const [saved, setSaved] = useState(false);

  // Re-seed the domain suggestion when /me lands, unless the press typed.
  const customValue = customTouched ? customDomain : customDefault;

  const dirty = domainTier !== "sub" || (customTouched && customDomain !== customDefault) || accent.toUpperCase() !== DEFAULT_ACCENT;

  const accentValid = /^#[0-9a-fA-F]{6}$/.test(accent);
  const accentLive = accentValid ? accent : DEFAULT_ACCENT;
  const accentTooLight = useMemo(() => hexLuminance(accentLive) > 0.55, [accentLive]);

  const activeDomain = domainTier === "sub" ? subdomain : (customValue.trim() || subdomain);

  // Logo art — dark-background mark preferred for the dark estimate preview;
  // light-background mark for the white email card. Fall back across the kit.
  const darkBgLogo = me?.squareLogoUrl ?? me?.logoUrl ?? null;
  const lightBgLogo = me?.lightSquareLogoUrl ?? me?.lightLogoUrl ?? darkBgLogo;

  const repEmail = me?.contactEmail ?? null;

  return (
    <div data-testid="press-whitelabel-tab" style={{ maxWidth: 1120, paddingBottom: 48 }}>
      {/* ── Heading + earned-blue Save ── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="tracking-tight" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.08 }}>
            <span style={{ color: INK }}>White Label. </span>
            <span style={{ color: "#a1a1a6", fontWeight: 600 }}>Your brand, our system.</span>
          </h1>
          <p className="text-[15px]" style={{ marginTop: 8, maxWidth: 560, color: SUBINK }}>
            What your artists see carries your name. The estimate flow, the emails,
            the portal — skinned once, applied everywhere.
          </p>
        </div>
        <button
          type="button"
          disabled={!dirty && !saved}
          onClick={() => { if (dirty) setSaved(true); }}
          className="rounded-full flex-shrink-0"
          style={{
            marginTop: 6, padding: "11px 24px", fontSize: 14, fontWeight: 600,
            cursor: dirty ? "pointer" : "default",
            background: dirty ? BLUE : "transparent",
            border: dirty ? "1px solid transparent" : `1px solid ${HAIRLINE}`,
            color: dirty ? "#ffffff" : SUBINK,
          }}
          data-testid="button-save-changes"
        >
          {saved && !dirty ? "Saved" : "Save changes"}
        </button>
      </div>

      {/* ── Config LEFT · live preview RIGHT ── */}
      <div className="grid gap-12 items-start" style={{ marginTop: 40, gridTemplateColumns: "minmax(0, 1fr) 400px" }}>
        <div className="min-w-0" style={{ display: "grid", gap: 44 }}>
          {/* ═══ 1 · DOMAIN ═══ */}
          <section>
            <SectionLabel>Domain</SectionLabel>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={() => setDomainTier("sub")}
                aria-pressed={domainTier === "sub"}
                className="rounded-2xl text-left w-full"
                style={{ padding: "16px 18px", cursor: "pointer", background: CARD, border: domainTier === "sub" ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                data-testid="domain-tier-sub"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="w-4 h-4 flex-shrink-0" style={{ color: "#a1a1a6" }} />
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold" style={{ color: INK }}>GoodTunes subdomain</div>
                      <div className="text-[12.5px]" style={{ color: SUBINK, marginTop: 1 }}>{subdomain}</div>
                    </div>
                  </div>
                  <WordIcon icon={Check}>Ready now</WordIcon>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDomainTier("custom")}
                aria-pressed={domainTier === "custom"}
                className="rounded-2xl text-left w-full"
                style={{ padding: "16px 18px", cursor: "pointer", background: CARD, border: domainTier === "custom" ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                data-testid="domain-tier-custom"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="w-4 h-4 flex-shrink-0" style={{ color: "#a1a1a6" }} />
                    <div className="text-[14px] font-semibold" style={{ color: INK }}>Your own domain</div>
                  </div>
                  <WordIcon icon={AlertCircle}>Needs DNS verification</WordIcon>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 12 }}>
                  <input
                    value={customValue}
                    onChange={(e) => { setCustomTouched(true); setCustomDomain(e.target.value); setDomainTier("custom"); }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="estimates.yourpress.com"
                    className="flex-1 min-w-[220px] focus:outline-none"
                    style={{ height: 36, borderRadius: 10, padding: "0 12px", fontSize: 13, background: CANVAS, border: `1px solid ${HAIRLINE}`, color: INK }}
                    data-testid="input-custom-domain"
                  />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-full inline-flex items-center flex-shrink-0"
                    style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 500, border: "1px solid #6e6e73", color: INK, cursor: "pointer" }}
                    data-testid="button-verify-domain"
                  >
                    Verify domain
                  </span>
                </div>
              </button>
            </div>
            <p className="text-[12px]" style={{ color: "#a1a1a6", marginTop: 8 }}>
              Estimate links, your portal, and email links all use this address.
            </p>
          </section>

          {/* ═══ 2 · BRAND COLOR ═══ */}
          <section>
            <SectionLabel>Brand color</SectionLabel>
            <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, maxWidth: 480, lineHeight: 1.6 }}>
              One accent. The chrome stays ours — your accent applies only where the
              system already uses accent: confirms, links, status icons.
            </p>
            <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 14 }}>
              {ACCENT_PRESETS.map((p) => {
                const active = accentLive.toUpperCase() === p.hex.toUpperCase();
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAccent(p.hex)}
                    aria-pressed={active}
                    title={p.name}
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: 34, height: 34, padding: 0, cursor: "pointer", background: p.hex,
                      border: active ? `2px solid ${INK}` : `1px solid ${HAIRLINE}`,
                      boxShadow: active ? PILL_SHADOW : undefined,
                    }}
                    data-testid={`accent-swatch-${p.id}`}
                  />
                );
              })}
              <div className="flex items-center gap-1.5" style={{ marginLeft: 6 }}>
                <span
                  aria-hidden
                  className="rounded-full flex-shrink-0"
                  style={{ width: 18, height: 18, background: accentLive, border: `1px solid ${HAIRLINE}` }}
                />
                <input
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="focus:outline-none"
                  style={{ width: 96, height: 34, borderRadius: 10, padding: "0 10px", fontSize: 13, fontVariantNumeric: "tabular-nums", background: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}
                  data-testid="input-accent-hex"
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }} data-testid="accent-contrast-check">
              {accentTooLight ? (
                <WordIcon icon={AlertCircle}>Too light on dark — pick a deeper shade</WordIcon>
              ) : (
                <WordIcon icon={Check}>Readable on light and dark — passes</WordIcon>
              )}
            </div>
          </section>

          {/* ═══ 3 · LOGO KIT ═══ */}
          <section>
            <SectionLabel>Logo kit</SectionLabel>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 480 }}>
              <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, background: "#ffffff", padding: 18, textAlign: "center" }} data-testid="logo-tile-light">
                {lightBgLogo ? (
                  <img src={lightBgLogo} alt="Logo for light backgrounds" style={{ width: 56, height: 56, margin: "0 auto", objectFit: "contain" }} />
                ) : (
                  <div className="rounded-xl mx-auto flex items-center justify-center" style={{ width: 56, height: 56, border: "1px dashed #d2d2d7", color: "#a1a1a6", fontSize: 11 }}>—</div>
                )}
                <div className="text-[12px] font-semibold" style={{ color: "#1d1d1f", marginTop: 10 }}>Light backgrounds</div>
                <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "#6e6e73", marginTop: 4 }}>
                  <Upload className="w-3 h-3" /> Replace on Details
                </div>
              </div>
              <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, background: "#161617", padding: 18, textAlign: "center" }} data-testid="logo-tile-dark">
                {darkBgLogo ? (
                  <img src={darkBgLogo} alt="Logo for dark backgrounds" style={{ width: 56, height: 56, margin: "0 auto", objectFit: "contain" }} />
                ) : (
                  <div className="rounded-xl mx-auto flex items-center justify-center" style={{ width: 56, height: 56, border: "1px dashed rgba(255,255,255,0.25)", color: "#98989d", fontSize: 11 }}>—</div>
                )}
                <div className="text-[12px] font-semibold" style={{ color: "#f5f5f7", marginTop: 10 }}>Dark backgrounds</div>
                <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "#98989d", marginTop: 4 }}>
                  <Upload className="w-3 h-3" /> Replace on Details
                </div>
              </div>
            </div>
            <p className="text-[12px]" style={{ color: "#a1a1a6", marginTop: 8 }}>
              Both required — estimates and emails run in both themes.
            </p>
          </section>

          {/* ═══ 4 · REP IDENTITY ═══ */}
          <section>
            <SectionLabel>Rep identity</SectionLabel>
            <div className="rounded-2xl flex items-center gap-4" style={{ marginTop: 12, padding: "16px 18px", background: CARD, border: `1px solid ${HAIRLINE}`, maxWidth: 480 }} data-testid="rep-identity-card">
              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52, borderRadius: 14, overflow: "hidden", border: `1px solid ${HAIRLINE}`, background: CANVAS, color: SUBINK, fontSize: 18, fontWeight: 700 }}>
                {firstWord.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: INK }}>{pressName}</div>
                <div className="text-[12px]" style={{ color: SUBINK, marginTop: 1 }}>Client services</div>
              </div>
            </div>
            <div style={{ marginTop: 10, maxWidth: 480 }}>
              <WordIcon icon={Mail}>
                {repEmail
                  ? <>Replies stay in your estimate thread — your team is notified at {repEmail}</>
                  : <>Replies stay in your estimate thread — add a contact email on Details</>}
              </WordIcon>
            </div>
          </section>

          {/* ═══ 5 · ALWAYS GOODTUNES ═══ */}
          <section>
            <SectionLabel>Always GoodTunes</SectionLabel>
            <div className="rounded-2xl" style={{ marginTop: 12, padding: "18px 20px", border: `1px solid ${HAIRLINE}`, maxWidth: 480 }} data-testid="always-goodtunes-card">
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {[
                  "GoodDeed® certificates",
                  "The fan-funded pressing story",
                  "The fan player",
                  'The "Powered by GoodTunes®" footer',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[13px]" style={{ color: INK }}>
                    <Award className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a1a1a6" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 14, lineHeight: 1.6 }}>
                You brand your relationship with the artist. GoodTunes® stays the
                fans&rsquo; side of the record.
              </p>
            </div>
          </section>
        </div>

        {/* ── STICKY LIVE PREVIEW — the star of the page ── */}
        <div className="sticky hidden lg:block" style={{ top: 100 }}>
          <div className="inline-flex items-center p-0.5 rounded-full" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="Preview">
            {(["estimate", "email"] as const).map((tabId) => {
              const active = previewTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPreviewTab(tabId)}
                  className="px-4 h-8 rounded-full text-[13px] leading-none capitalize"
                  style={{
                    fontWeight: active ? 600 : 500,
                    color: active ? INK : SUBINK,
                    backgroundColor: active ? CARD : "transparent",
                    boxShadow: active ? PILL_SHADOW : undefined,
                    cursor: "pointer",
                  }}
                  data-testid={`preview-tab-${tabId}`}
                >
                  {tabId}
                </button>
              );
            })}
          </div>

          {previewTab === "estimate" ? (
            <div className="rounded-2xl" style={{ marginTop: 14, background: "#111112", color: "#f5f5f7", border: `1px solid ${HAIRLINE}`, padding: 24 }} data-testid="preview-estimate">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                {darkBgLogo
                  ? <img src={darkBgLogo} alt="" aria-hidden style={{ width: 34, height: 34, objectFit: "contain" }} />
                  : <span style={{ fontSize: 13, fontWeight: 700 }}>{pressName}</span>}
                <div style={{ fontSize: 10.5, color: "#a1a1a6" }}>Estimate 071526-02</div>
              </div>
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#a1a1a6" }}>Prepared for</div>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, marginTop: 3 }}>Niina Soleil</div>
                <div style={{ fontSize: 11, color: "#a1a1a6", marginTop: 2 }}>Californialand</div>
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#a1a1a6" }}>Run</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>1,000 units · $5.37 /unit</span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: accentLive }}>Estimate total</span>
                <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>$8,375.00</span>
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                style={{ marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 999, border: "none", background: accentLive, color: accentTooLight ? "#1d1d1f" : "#ffffff", fontSize: 12.5, fontWeight: 600, pointerEvents: "none" }}
              >
                Start this project
              </button>
              <div style={{ marginTop: 12, fontSize: 10.5, color: "#a1a1a6", textAlign: "center", wordBreak: "break-all" }} data-testid="preview-estimate-link">
                {activeDomain}/e/071526-02
              </div>
            </div>
          ) : (
            <div className="rounded-2xl" style={{ marginTop: 14, background: "#ffffff", border: `1px solid ${HAIRLINE}`, padding: "28px 24px", textAlign: "center" }} data-testid="preview-email">
              <div className="text-[10.5px]" style={{ color: "#a1a1a6" }} data-testid="preview-email-from">
                {firstWord} at {pressName} · {domainTier === "sub" ? "via goodtunes.music" : activeDomain}
              </div>
              {lightBgLogo
                ? <img src={lightBgLogo} alt="" aria-hidden style={{ width: 40, height: 40, margin: "18px auto 0", objectFit: "contain" }} />
                : <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", marginTop: 18 }}>{pressName}</div>}
              <p className="text-[13.5px]" style={{ color: "#1d1d1f", margin: "14px auto 0", maxWidth: 260, lineHeight: 1.55 }}>
                {firstWord} at {pressName} sent you an estimate for <strong>Californialand</strong>.
              </p>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                style={{ marginTop: 16, padding: "10px 24px", borderRadius: 999, border: "none", background: accentLive, color: accentTooLight ? "#1d1d1f" : "#ffffff", fontSize: 12.5, fontWeight: 600, pointerEvents: "none" }}
              >
                View estimate
              </button>
              <div className="text-[10.5px]" style={{ color: "#a1a1a6", marginTop: 16 }}>
                Private link · no account needed
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#a1a1a6", marginTop: 14, paddingTop: 12, borderTop: "1px solid #e6e6ea" }}>
                Powered by GoodTunes®
              </div>
            </div>
          )}

          <p className="text-[11.5px]" style={{ color: "#a1a1a6", marginTop: 12, lineHeight: 1.6 }}>
            Live preview — accent, logo and domain update as you type.
          </p>
        </div>
      </div>
    </div>
  );
}
