import { useRef, useState, type CSSProperties } from 'react';

/**
 * HelpFeedbackDialog — apple-canon redesign of the live app's Help & feedback
 * sheet (Bill, Aug 26 2026). Fixes from his notes:
 *   1. Full apple-canon dress: two-tone heading, rounded-full segmented pills,
 *      gray-circle X, confirm that EARNS its blue, quiet Cancel text button.
 *   2. "My requests" is no longer an underlined link crowding the X — it's a
 *      canon segmented control (New report / My requests) on its own row.
 *   3. The auto-screenshot is SHOWN, not whispered: a visible attachment card
 *      with a live thumbnail of the page, "Attached automatically", and a
 *      quiet Remove — transparency the Apple way (show, don't tell).
 *   4. (Bill, feedback #356) The card opens a full PREVIEW on click, and the
 *      customer can drag to HIGHLIGHT areas — numbered blue pins travel with
 *      the report so they can point at exactly what they mean.
 *
 * Light + dark THEMES per canon; the floating View toggle is mock-only chrome.
 */

const BLUE = '#319ED8';

const THEMES = {
  light: {
    canvas: '#f5f5f7',
    card: '#ffffff',
    inset: '#ffffff',
    track: '#f0f0f2',
    chip: '#e8e8ed',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    thumbShadow: '0 1px 3px rgba(0,0,0,0.08)',
    dialogShadow: '0 24px 64px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(0,0,0,0.06)',
    scrim: 'rgba(0,0,0,0.34)',
    readyInk: '#1c8a5b',
    hoverWash: '#f0f0f2',
  },
  dark: {
    canvas: '#161617',
    card: '#1e1e20',
    inset: '#26262a',
    track: '#26262a',
    chip: '#3a3a3e',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    thumbShadow: '0 1px 3px rgba(0,0,0,0.4)',
    dialogShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.06)',
    scrim: 'rgba(0,0,0,0.5)',
    readyInk: '#34c07f',
    hoverWash: 'rgba(255,255,255,0.05)',
  },
} as const;

type Theme = (typeof THEMES)[keyof typeof THEMES];

// ─── MOCK data ─────────────────────────────────────────────────────────
const MOCK_REQUESTS = [
  { id: 'r1', kind: 'Bug', title: 'Payout chart clips on smaller windows', date: 'Aug 22', status: 'in-review' as const },
  { id: 'r2', kind: 'Feature request', title: 'Export buyers list as CSV', date: 'Aug 14', status: 'received' as const },
];

// ─── Small canon pieces ────────────────────────────────────────────────

function Segmented<T extends string>({
  options, value, onChange, t, size = 'md', testPrefix,
}: {
  options: readonly T[]; value: T; onChange: (v: T) => void; t: Theme;
  size?: 'md' | 'sm'; testPrefix: string;
}) {
  const pad = size === 'md' ? '7px 16px' : '5px 13px';
  const fs = size === 'md' ? 13 : 12.5;
  return (
    <div style={{ display: 'inline-flex', background: t.track, borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            data-testid={`${testPrefix}-${o.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            onClick={() => onChange(o)}
            style={{
              padding: pad,
              borderRadius: 999,
              border: 'none',
              cursor: active ? 'default' : 'pointer',
              fontSize: fs,
              fontWeight: 600,
              fontFamily: 'inherit',
              color: active ? t.ink : t.subink,
              background: active ? (t === THEMES.dark ? '#3a3a3e' : '#ffffff') : 'transparent',
              boxShadow: active ? t.thumbShadow : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Tiny live "thumbnail" of the page behind — drawn, so the capture is SEEN. */
function PageThumb({ t }: { t: Theme }) {
  const bar = (w: string, h: number, bg: string, extra?: CSSProperties) => (
    <div style={{ width: w, height: h, borderRadius: 2, background: bg, ...extra }} />
  );
  return (
    <div
      aria-hidden
      style={{
        width: 78,
        height: 52,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${t.hairline}`,
        background: t.canvas,
        flexShrink: 0,
        position: 'relative',
        boxShadow: t.thumbShadow,
      }}
    >
      {/* mini top bar */}
      <div style={{ height: 9, background: t === THEMES.dark ? '#000000' : '#1d1d1f', display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
        <div style={{ width: 5, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.8)' }} />
        {bar('16px', 2, 'rgba(255,255,255,0.55)')}
      </div>
      {/* mini cards */}
      <div style={{ display: 'flex', gap: 3, padding: 4 }}>
        <div style={{ flex: 1, height: 16, borderRadius: 3, background: t.card, border: `1px solid ${t.hairline}` }} />
        <div style={{ flex: 1, height: 16, borderRadius: 3, background: t.card, border: `1px solid ${t.hairline}` }} />
      </div>
      <div style={{ padding: '0 4px', display: 'grid', gap: 2 }}>
        {bar('70%', 3, t.chip)}
        {bar('52%', 3, t.chip)}
      </div>
    </div>
  );
}

/** A highlight the customer drew on the screenshot preview — % coords. */
type Mark = { x: number; y: number; w: number; h: number };

/** The same drawn page, big — the markup surface inside the preview sheet. */
function BigPage({ t }: { t: Theme }) {
  const bar = (w: string, h: number, bg: string) => (
    <div style={{ width: w, height: h, borderRadius: 3, background: bg }} />
  );
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: t.canvas, pointerEvents: 'none' }}>
      <div style={{ height: 44, background: t === THEMES.dark ? '#000000' : '#1d1d1f', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(255,255,255,0.8)' }} />
        {bar('90px', 8, 'rgba(255,255,255,0.55)')}
        <div style={{ flex: 1 }} />
        {bar('54px', 8, 'rgba(255,255,255,0.35)')}
      </div>
      <div style={{ display: 'flex', gap: 14, padding: 18 }}>
        <div style={{ flex: 1, height: 84, borderRadius: 12, background: t.card, border: `1px solid ${t.hairline}` }} />
        <div style={{ flex: 1, height: 84, borderRadius: 12, background: t.card, border: `1px solid ${t.hairline}` }} />
        <div style={{ flex: 1, height: 84, borderRadius: 12, background: t.card, border: `1px solid ${t.hairline}` }} />
      </div>
      <div style={{ padding: '0 18px', display: 'grid', gap: 8 }}>
        {bar('58%', 10, t.chip)}
        {bar('44%', 10, t.chip)}
        {bar('66%', 10, t.chip)}
      </div>
      <div style={{ margin: 18, height: 110, borderRadius: 12, background: t.card, border: `1px solid ${t.hairline}` }} />
    </div>
  );
}

function CameraGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CheckGlyph({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockGlyph({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// ─── The dialog ────────────────────────────────────────────────────────

function Dialog({ t }: { t: Theme }) {
  const [view, setView] = useState<'New report' | 'My requests'>('New report');
  const [kind, setKind] = useState<'Bug' | 'Feature request'>('Bug');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [shot, setShot] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const canSend = title.trim().length > 0;

  const pct = (e: React.MouseEvent) => {
    const r = pageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const onPageDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = pct(e);
    setDraftMark({ ...dragStart.current, w: 0, h: 0 });
  };
  const onPageMove = (e: React.MouseEvent) => {
    if (!dragStart.current) return;
    const p = pct(e);
    const s = dragStart.current;
    setDraftMark({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onPageUp = () => {
    if (draftMark && draftMark.w > 1.5 && draftMark.h > 1.5) setMarks((m) => [...m, draftMark]);
    dragStart.current = null;
    setDraftMark(null);
  };

  const label: CSSProperties = { fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: 7 };
  const field: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: t.inset,
    border: `1px solid ${t.hairline}`,
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 13.5,
    fontFamily: 'inherit',
    color: t.ink,
    outline: 'none',
    resize: 'none',
  };

  return (
    <div
      data-testid="help-feedback-dialog"
      style={{
        width: 560,
        maxWidth: 'calc(100vw - 48px)',
        background: t.card,
        borderRadius: 20,
        border: `1px solid ${t.hairline}`,
        boxShadow: t.dialogShadow,
        padding: 28,
        fontFamily: "Inter, -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
        color: t.ink,
      }}
    >
      {/* Header — two-tone heading, X alone in the corner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            Help &amp; feedback. <span style={{ color: t.subink, fontWeight: 500 }}>We read every note.</span>
          </h2>
        </div>
        <button
          type="button"
          data-testid="button-close"
          aria-label="Close"
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            border: 'none',
            background: t.chip,
            color: t.ink,
            fontSize: 14,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* View switcher — its own row, nowhere near the X */}
      <div style={{ marginTop: 16 }}>
        <Segmented options={['New report', 'My requests'] as const} value={view} onChange={(v) => setView(v)} t={t} testPrefix="segment-view" />
      </div>

      {view === 'New report' ? (
        <>
          {/* Kind */}
          <div style={{ marginTop: 22 }}>
            <div style={label}>What kind of note?</div>
            <Segmented options={['Bug', 'Feature request'] as const} value={kind} onChange={(v) => setKind(v)} t={t} size="sm" testPrefix="segment-kind" />
          </div>

          {/* Title */}
          <div style={{ marginTop: 18 }}>
            <div style={label}>Title</div>
            <input
              data-testid="input-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'Bug' ? 'What went wrong?' : 'What would you like to see?'}
              style={field}
            />
          </div>

          {/* Details */}
          <div style={{ marginTop: 16 }}>
            <div style={label}>Details</div>
            <textarea
              data-testid="input-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={kind === 'Bug' ? 'Steps to reproduce, what you expected, anything that helps.' : 'What would it help you do?'}
              rows={4}
              style={field}
            />
          </div>

          {/* Screenshot — shown, not whispered */}
          <div
            data-testid="card-screenshot"
            style={{
              marginTop: 16,
              border: shot ? `1px solid ${t.hairline}` : `1px dashed ${t.hairline}`,
              borderRadius: 14,
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {shot ? (
              <>
                <button
                  type="button"
                  data-testid="button-open-preview"
                  onClick={() => setPreviewOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: t.ink }}
                >
                  <PageThumb t={t} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <CameraGlyph color={t.subink} />
                      Screenshot of this page
                      {marks.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: BLUE, background: t === THEMES.dark ? 'rgba(49,158,216,0.14)' : '#f0f7fc', borderRadius: 999, padding: '2px 8px' }}>
                          <CheckGlyph color={BLUE} /> {marks.length} highlight{marks.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: t.subink, marginTop: 2 }}>
                      Attached automatically when you send. <span style={{ color: BLUE, fontWeight: 600 }}>Preview &amp; highlight</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  data-testid="button-remove-screenshot"
                  onClick={() => { setShot(false); setMarks([]); }}
                  style={{ background: 'none', border: 'none', color: t.subink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontSize: 12.5, color: t.subink }}>
                  <CameraGlyph color={t.faint} />
                  No screenshot — your note is sent on its own.
                </div>
                <button
                  type="button"
                  data-testid="button-include-screenshot"
                  onClick={() => setShot(true)}
                  style={{ background: 'none', border: 'none', color: BLUE, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  Include screenshot
                </button>
              </>
            )}
          </div>

          {/* Footer — Cancel quiet text, confirm earns its blue */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 22 }}>
            <button
              type="button"
              data-testid="button-cancel"
              style={{ background: 'none', border: 'none', color: t.subink, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="button-send"
              disabled={!canSend}
              style={{
                padding: '9px 22px',
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: canSend ? 'pointer' : 'default',
                border: canSend ? '1px solid transparent' : `1px solid ${t.subink}`,
                background: canSend ? BLUE : 'transparent',
                color: canSend ? '#ffffff' : t.subink,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              Send to GoodTunes®
            </button>
          </div>
        </>
      ) : (
        <>
          {/* My requests */}
          <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
            {MOCK_REQUESTS.map((r) => (
              <div
                key={r.id}
                data-testid={`row-request-${r.id}`}
                style={{ border: `1px solid ${t.hairline}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: t.subink, marginTop: 2 }}>{r.kind} · Sent {r.date}</div>
                </div>
                {/* Status — word + icon, never color alone */}
                {r.status === 'received' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.readyInk, whiteSpace: 'nowrap' }}>
                    <CheckGlyph color={t.readyInk} /> Received
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.subink, whiteSpace: 'nowrap' }}>
                    <ClockGlyph color={t.subink} /> In review
                  </span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: t.faint, marginTop: 14, marginBottom: 0 }}>
            Every request lands with the GoodTunes® team — we reply in the app when there's news.
          </p>
        </>
      )}

      {/* Screenshot preview & markup sheet */}
      {previewOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div
            data-testid="sheet-screenshot-preview"
            style={{ width: 720, maxWidth: 'calc(100vw - 48px)', background: t.card, borderRadius: 20, border: `1px solid ${t.hairline}`, boxShadow: t.dialogShadow, padding: 24 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Your screenshot. <span style={{ color: t.subink, fontWeight: 500 }}>Drag to highlight what you mean.</span>
                </h3>
              </div>
              <button
                type="button"
                data-testid="button-close-preview"
                aria-label="Close preview"
                onClick={() => setPreviewOpen(false)}
                style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: t.chip, color: t.ink, fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                ×
              </button>
            </div>

            <div
              ref={pageRef}
              data-testid="area-markup"
              onMouseDown={onPageDown}
              onMouseMove={onPageMove}
              onMouseUp={onPageUp}
              onMouseLeave={onPageUp}
              style={{ position: 'relative', marginTop: 16, aspectRatio: '16 / 10', borderRadius: 14, overflow: 'hidden', border: `1px solid ${t.hairline}`, cursor: 'crosshair', userSelect: 'none' }}
            >
              <BigPage t={t} />
              {[...marks, ...(draftMark ? [draftMark] : [])].map((m, i) => (
                <div
                  key={i}
                  title={i < marks.length ? 'Click to remove this highlight' : undefined}
                  onMouseDown={(e) => {
                    if (i < marks.length) {
                      e.stopPropagation();
                      setMarks((prev) => prev.filter((_, j) => j !== i));
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    width: `${m.w}%`,
                    height: `${m.h}%`,
                    border: `2px solid ${BLUE}`,
                    borderRadius: 8,
                    background: 'rgba(49,158,216,0.10)',
                    cursor: i < marks.length ? 'pointer' : 'crosshair',
                  }}
                >
                  {i < marks.length && (
                    <span style={{ position: 'absolute', top: -11, left: -11, width: 22, height: 22, borderRadius: 999, background: BLUE, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 5px rgba(0,0,0,0.3), 0 0 0 2px #fff' }}>
                      {i + 1}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <span style={{ fontSize: 12, color: t.faint }}>
                {marks.length === 0
                  ? 'No highlights yet — your full screenshot is attached either way.'
                  : `${marks.length} highlight${marks.length > 1 ? 's' : ''} — click one to remove it.`}
              </span>
              <span style={{ flex: 1 }} />
              {marks.length > 0 && (
                <button
                  type="button"
                  data-testid="button-clear-highlights"
                  onClick={() => setMarks([])}
                  style={{ background: 'none', border: 'none', color: t.subink, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                data-testid="button-done-preview"
                onClick={() => setPreviewOpen(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: marks.length > 0 ? '1px solid transparent' : `1px solid ${t.subink}`,
                  background: marks.length > 0 ? BLUE : 'transparent',
                  color: marks.length > 0 ? '#ffffff' : t.subink,
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page shell — ghost canvas behind the sheet + mock-only theme pill ─

function GhostCanvas({ t }: { t: Theme }) {
  const card: CSSProperties = { background: t.card, border: `1px solid ${t.hairline}`, borderRadius: 16, height: 120 };
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, padding: '80px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, alignContent: 'start' }}>
      <div style={{ ...card, gridColumn: '1 / -1', height: 56 }} />
      <div style={card} />
      <div style={card} />
      <div style={card} />
    </div>
  );
}

export default function HelpFeedbackDialog() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  return (
    <div style={{ minHeight: '100vh', background: t.canvas, position: 'relative', fontFamily: "Inter, -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
      <GhostCanvas t={t} />
      {/* Scrim + centered sheet */}
      <div style={{ position: 'absolute', inset: 0, background: t.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Dialog t={t} />
      </div>

      {/* Mock-only chrome: theme flip — never ships */}
      <button
        type="button"
        data-testid="mock-theme-toggle"
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 50,
          padding: '8px 16px',
          borderRadius: 999,
          border: `1px solid ${t.hairline}`,
          background: t.card,
          color: t.ink,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        }}
      >
        View {mode === 'dark' ? 'light' : 'dark'}
      </button>
    </div>
  );
}
