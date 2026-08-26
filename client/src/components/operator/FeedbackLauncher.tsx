// Task #2224 — Partner feedback launcher.
// Redesigned per Ruby's handoff (handoff/help-feedback/, Aug 2026) — the
// dialog markup below is copied character-for-character from
// HelpFeedbackDialog.tsx; only the MOCK_* data and the drawn PageThumb /
// BigPage interiors were swapped for real data (handoff law: delete-first,
// wire data only).
//
// One self-contained button + dialog embedded in OperatorShell (both the
// "tabs" header and the "leftnav" topbar) so EVERY invited-partner portal
// — press, NPO, artist, label, vendor, manager, printer, fulfillment,
// publisher — gets the same "Report a bug / request a feature" affordance
// with no per-portal wiring. The dialog has two views: New report (form
// with a VISIBLE auto-screenshot card + drag-to-highlight preview sheet)
// and My requests (the submitter's own history with status). Submitter
// identity is derived server-side; the client never sends a role/scope it
// could spoof.

import * as React from "react";
import { useRef, useState, type CSSProperties } from "react";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog as UiDialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { postAdminImage } from "@/lib/adminUpload";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type FeedbackKind = "bug" | "feature";

type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  pageUrl: string | null;
  screenshotUrl: string | null;
  highlights: Mark[] | null;
  status: string;
  publicReply: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  in_progress: "In progress",
  shipped: "Shipped",
  closed: "Closed",
};

// Apple-canon status: small colored dot + quiet label (no colored pills).
// Still used by the operator triage page (AdminFeedback).
const STATUS_DOT: Record<string, string> = {
  new: "var(--apple-blue)",
  reviewing: "var(--apple-warning)",
  in_progress: "var(--apple-blue)",
  shipped: "var(--apple-ready)",
  closed: "var(--apple-faint)",
};

export function FeedbackStatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--apple-subink)]"
      data-testid={`pill-feedback-status-${status}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: STATUS_DOT[status] ?? STATUS_DOT.closed }}
        aria-hidden
      />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatFeedbackDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

// ─── Handoff design constants (verbatim from HelpFeedbackDialog.tsx) ───

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

// ─── Small canon pieces (verbatim) ─────────────────────────────────────

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

/** Tiny live thumbnail of the page behind — the real capture is SEEN.
 * Geometry verbatim from the handoff's PageThumb; interior swapped 1:1
 * for the captured screenshot per the README's real-data swaps. */
function PageThumb({ t, src }: { t: Theme; src: string }) {
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
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
    </div>
  );
}

/** A highlight the customer drew on the screenshot preview — % coords. */
type Mark = { x: number; y: number; w: number; h: number };

/** The captured page, big — the markup surface inside the preview sheet.
 * Geometry verbatim from the handoff's BigPage; interior swapped 1:1 for
 * the captured screenshot. `fill` keeps the %-coords true image coords. */
function BigPage({ t, src }: { t: Theme; src: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: t.canvas, pointerEvents: 'none' }}>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
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

/** My-requests status — word + icon, never color alone (handoff grammar). */
function RequestStatus({ status, t }: { status: string; t: Theme }) {
  if (status === "new" || status === "shipped") {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.readyInk, whiteSpace: 'nowrap' }}>
        <CheckGlyph color={t.readyInk} /> {status === "new" ? "Received" : "Shipped"}
      </span>
    );
  }
  if (status === "closed") {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.subink, whiteSpace: 'nowrap' }}>
        <CheckGlyph color={t.subink} /> Closed
      </span>
    );
  }
  // reviewing | in_progress
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.subink, whiteSpace: 'nowrap' }}>
      <ClockGlyph color={t.subink} /> In review
    </span>
  );
}

// ─── The launcher + dialog ─────────────────────────────────────────────

/** Best-effort page capture — a failed capture must never block a report. */
async function capturePage(filterDialog: boolean): Promise<string | null> {
  try {
    const { toPng } = await import("html-to-image");
    return await toPng(document.body, {
      cacheBust: true,
      pixelRatio: 1,
      filter: (node) => {
        if (!filterDialog) return true;
        // Skip the open feedback dialog + its scrim/portal chrome.
        if (!(node instanceof HTMLElement)) return true;
        if (node.getAttribute("data-feedback-dialog") === "true") return false;
        if (node.getAttribute("role") === "dialog") return false;
        if (node.dataset?.state && node.classList.contains("fixed") && node.classList.contains("inset-0")) return false;
        return true;
      },
    });
  } catch {
    return null;
  }
}

export function FeedbackLauncher({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shotDataUrl, setShotDataUrl] = useState<string | null>(null);

  const [view, setView] = useState<'New report' | 'My requests'>('New report');
  const [kind, setKind] = useState<'Bug' | 'Feature request'>('Bug');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [shot, setShot] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Partner portals are theme-aware light admin surfaces; the charcoal
  // admin dark ladder rides the gt-admin-dark body class.
  const isDark = typeof document !== "undefined" && document.body.classList.contains("gt-admin-dark");
  const t: Theme = isDark ? THEMES.dark : THEMES.light;

  const canSend = title.trim().length > 0;
  const hasShot = shot && !!shotDataUrl;

  const mine = useQuery<MyFeedback[]>({
    queryKey: ["/api/partner/feedback/mine"],
    enabled: open,
  });

  function resetAll() {
    setView('New report');
    setKind('Bug');
    setTitle('');
    setDetails('');
    setShot(true);
    setPreviewOpen(false);
    setMarks([]);
    setDraftMark(null);
    setShotDataUrl(null);
  }

  async function openDialog() {
    if (capturing) return;
    // Capture BEFORE the dialog (and its scrim) covers the page, so the
    // visible attachment card shows the page the partner is looking at.
    setCapturing(true);
    const dataUrl = await capturePage(false);
    setCapturing(false);
    resetAll();
    setShotDataUrl(dataUrl);
    setShot(!!dataUrl);
    setOpen(true);
  }

  async function includeScreenshot() {
    if (shotDataUrl) {
      setShot(true);
      return;
    }
    // Initial capture failed — retry, filtering out the open dialog.
    const dataUrl = await capturePage(true);
    if (dataUrl) {
      setShotDataUrl(dataUrl);
      setShot(true);
    } else {
      toast({ title: "Couldn't capture the page", description: "Your note can still be sent on its own.", variant: "destructive" });
    }
  }

  async function handleSend() {
    if (!canSend || submitting) return;
    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;
      if (hasShot && shotDataUrl) {
        try {
          const file = await dataUrlToFile(shotDataUrl, "feedback-screenshot.png");
          screenshotUrl = (await postAdminImage(file, { noun: "screenshot" })).url;
        } catch {
          screenshotUrl = null; // best-effort — never block the report
        }
      }
      const res = await apiRequest("POST", "/api/partner/feedback", {
        kind: kind === 'Bug' ? 'bug' : 'feature',
        title: title.trim(),
        body: details.trim(),
        pageUrl: window.location.href,
        screenshotUrl,
        highlights: screenshotUrl && marks.length > 0 ? marks : null,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as { message?: string });
        throw new Error(err?.message || "Could not send your report");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/partner/feedback/mine"] });
      setOpen(false);
      resetAll();
      toast({
        title: kind === 'Bug' ? "Bug reported" : "Request sent",
        description: "Thanks — the GoodTunes team can see it now.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't send your report", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

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
    <>
      <Button
        type="button"
        size="sm"
        className={cn(
          // Apple-canon header utility action: ghost pill — subink text +
          // icon, transparent, light-gray hover, NEVER filled blue (the
          // filled slot belongs to the screen's one primary CTA).
          "gap-1.5 rounded-full bg-transparent text-[var(--apple-subink)] hover:bg-[color:var(--apple-tile)] hover:text-[var(--apple-ink)] border-0 shadow-none",
          className
        )}
        onClick={openDialog}
        data-testid="button-open-feedback"
      >
        {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      <UiDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetAll(); }}>
        <DialogContent
          className="max-w-none w-auto p-0 border-0 bg-transparent shadow-none [&>button]:hidden"
          data-feedback-dialog="true"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Help &amp; feedback</DialogTitle>
          <DialogDescription className="sr-only">Report a bug or request a feature.</DialogDescription>

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
                onClick={() => { setOpen(false); resetAll(); }}
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
                    maxLength={200}
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
                    maxLength={5000}
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
                    border: hasShot ? `1px solid ${t.hairline}` : `1px dashed ${t.hairline}`,
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {hasShot ? (
                    <>
                      <button
                        type="button"
                        data-testid="button-open-preview"
                        onClick={() => setPreviewOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: t.ink }}
                      >
                        <PageThumb t={t} src={shotDataUrl!} />
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
                        onClick={includeScreenshot}
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
                    onClick={() => { setOpen(false); resetAll(); }}
                    style={{ background: 'none', border: 'none', color: t.subink, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="button-send"
                    disabled={!canSend || submitting}
                    onClick={handleSend}
                    style={{
                      padding: '9px 22px',
                      borderRadius: 999,
                      fontSize: 13.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: canSend && !submitting ? 'pointer' : 'default',
                      border: canSend ? '1px solid transparent' : `1px solid ${t.subink}`,
                      background: canSend ? BLUE : 'transparent',
                      color: canSend ? '#ffffff' : t.subink,
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {submitting ? 'Sending…' : 'Send to GoodTunes®'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* My requests */}
                <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
                  {mine.isLoading ? (
                    <div style={{ border: `1px solid ${t.hairline}`, borderRadius: 14, padding: '12px 14px' }}>
                      <span style={{ fontSize: 12.5, color: t.subink }}>Loading your requests…</span>
                    </div>
                  ) : !mine.data || mine.data.length === 0 ? (
                    // Empty state — card grammar, quiet line (Ruby-sanctioned).
                    <div style={{ border: `1px solid ${t.hairline}`, borderRadius: 14, padding: '12px 14px' }} data-testid="text-feedback-empty">
                      <span style={{ fontSize: 12.5, color: t.subink }}>You haven't sent anything yet.</span>
                    </div>
                  ) : (
                    mine.data.map((r) => (
                      <div
                        key={r.id}
                        data-testid={`row-request-${r.id}`}
                        style={{ border: `1px solid ${t.hairline}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: t.subink, marginTop: 2 }}>
                            {r.kind === 'bug' ? 'Bug' : 'Feature request'} · Sent {formatFeedbackDate(r.createdAt) ?? '—'}
                          </div>
                        </div>
                        {/* Status — word + icon, never color alone */}
                        <RequestStatus status={r.status} t={t} />
                        {r.publicReply && (
                          <div style={{ flexBasis: '100%', fontSize: 12, color: t.subink, marginTop: 4 }} data-testid={`text-feedback-reply-${r.id}`}>
                            <span style={{ fontWeight: 600, color: t.ink }}>GoodTunes: </span>
                            {r.publicReply}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <p style={{ fontSize: 12, color: t.faint, marginTop: 14, marginBottom: 0 }}>
                  Every request lands with the GoodTunes® team — we reply in the app when there's news.
                </p>
              </>
            )}

            {/* Screenshot preview & markup sheet */}
            {previewOpen && shotDataUrl && (
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
                    <BigPage t={t} src={shotDataUrl} />
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
        </DialogContent>
      </UiDialog>
    </>
  );
}
