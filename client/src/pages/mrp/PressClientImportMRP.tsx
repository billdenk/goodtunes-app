// Task #3394 — Cross-press project import wizard (wired, held OFF).
//
// White-label client-portal page at /projects/import: lists the customer's
// saved project specs (press-neutral — copy NEVER names any other press),
// translates one into THIS press's vocabulary, walks closest-match
// confirmations, and lands the customer in a pre-filled Draft estimate.
//
// Renders with plain components in the MRP light canon until Ruby's design
// handoff lands (docs/handoff-briefs/cross-press-import-ruby.md). Skin
// rules honored: white canvas, square corners, dark ink on the ONE gold
// fill, Poppins, statuses word + icon never color alone, never the q-word.
//
// Walls (Bill): specs only, never a price; source press never named; the
// masters-release request goes to "your previous press" without saying who.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { authHeaders } from '@/lib/queryClient';
import { withDevWlParam as wlParam } from '@/hooks/useAuthKind';
import NotFound from '@/pages/not-found';
import type { TranslationProposal, FieldMatch } from '@shared/crossPressImport';

const CANVAS = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#D9C153';

type PortalProject = {
  id: string;
  title: string | null;
  savedAt: string | null;
  format: string | null;
  sizeId: string | null;
  colorName: string | null;
  colorTierName: string | null;
  jacketName: string | null;
  lastQuantity: number | null;
};

const FIELD_LABELS: Record<FieldMatch['field'], string> = {
  size: 'Record size',
  discs: 'Discs',
  weight: 'Vinyl weight',
  colorTier: 'Finish',
  color: 'Color',
  jacket: 'Jacket',
  sleeve: 'Inner sleeve',
  label: 'Center labels',
  insert: 'Insert',
  sticker: 'Sticker',
  quantity: 'Quantity',
};

// Status grammar — word + icon, never color alone.
function MatchGlyph({ status }: { status: FieldMatch['status'] }) {
  const common = { fill: 'none' as const, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (status === 'exact' || status === 'copied') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5L6.5 12L13 4.5" stroke={INK} {...common} />
      </svg>
    );
  }
  if (status === 'closest') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M8 3v6M8 12.5v.1" stroke={INK} {...common} />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke={SUBINK} {...common} />
    </svg>
  );
}

function statusWord(status: FieldMatch['status']): string {
  if (status === 'exact') return 'Matched';
  if (status === 'copied') return 'Carried over';
  if (status === 'closest') return 'Pick the closest match';
  return 'No equivalent here';
}

export default function PressClientImportMRP() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const font = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  // The import surface only exists while this press's flag is ON — a direct
  // navigation while the feature is held OFF renders the portal's 404 page,
  // exactly as if the route were never registered. No import shell, no
  // redirect: flags-off truly means zero surfaces.
  const { data: eligibility, isLoading: eligibilityLoading } = useQuery<{ enabled: boolean }>({
    queryKey: [wlParam('/api/press-client/import/eligibility')],
    retry: false,
  });
  const importEnabled = eligibility?.enabled === true;

  const { data, isLoading } = useQuery<{ projects: PortalProject[] }>({
    queryKey: [wlParam('/api/press-client/import/projects')],
    retry: false,
    enabled: importEnabled,
  });
  const projects = data?.projects ?? [];

  const [selected, setSelected] = useState<PortalProject | null>(null);
  const [proposal, setProposal] = useState<TranslationProposal | null>(null);
  const [translating, setTranslating] = useState(false);
  // Customer confirmations for closest-match fields, keyed by field name.
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mastersState, setMastersState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const translate = async (p: PortalProject) => {
    setSelected(p);
    setProposal(null);
    setPicks({});
    setError(null);
    setMastersState('idle');
    setTranslating(true);
    try {
      const res = await fetch(wlParam('/api/press-client/import/translate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ projectId: p.id }),
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      setProposal(body.proposal as TranslationProposal);
    } catch {
      setError("We couldn't read that project right now. Try again in a moment.");
    } finally {
      setTranslating(false);
    }
  };

  // Confirming a finish (tier) regenerates the proposal against THAT tier so
  // the color candidates shown are the ones actually available under it —
  // a displayed choice is always a startable choice.
  const retranslateWithTier = async (tierId: string) => {
    if (!selected) return;
    setError(null);
    try {
      const res = await fetch(wlParam('/api/press-client/import/translate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ projectId: selected.id, confirmedTierId: tierId }),
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      setProposal(body.proposal as TranslationProposal);
      // The old color pick may not exist under the new finish — clear it so
      // the customer re-confirms from the refreshed candidates.
      setPicks((prev) => {
        const next = { ...prev };
        delete next.color;
        return next;
      });
    } catch {
      setError("We couldn't refresh the color choices for that finish. Try again in a moment.");
    }
  };

  const closestFields = (proposal?.fields ?? []).filter((f) => f.status === 'closest');
  const allConfirmed = closestFields.every((f) => picks[f.field]);

  const start = async () => {
    if (!selected || !proposal || starting) return;
    setStarting(true);
    setError(null);
    try {
      const confirmations: Record<string, string> = {};
      if (picks.colorTier) confirmations.colorTierId = picks.colorTier;
      if (picks.color) confirmations.colorId = picks.color;
      if (picks.jacket) confirmations.jacketId = picks.jacket;
      const res = await fetch(wlParam('/api/press-client/import/start'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ projectId: selected.id, confirmations }),
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: [wlParam('/api/press-client/portal')] });
      navigate('/projects');
    } catch {
      setError("We couldn't start the project. Nothing was created — try again.");
    } finally {
      setStarting(false);
    }
  };

  const requestMasters = async () => {
    if (!selected || mastersState !== 'idle') return;
    setMastersState('sending');
    try {
      const res = await fetch(wlParam('/api/press-client/masters-release-request'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ projectId: selected.id }),
      });
      if (!res.ok) throw new Error();
      setMastersState('sent');
    } catch {
      setMastersState('idle');
      setError("We couldn't send the masters request right now. You can try again later.");
    }
  };

  // Held OFF means zero surfaces: while eligibility is still resolving,
  // paint nothing at all; once the flag is known OFF, this route IS a 404 —
  // identical to a path that was never registered.
  if (eligibilityLoading) {
    return null;
  }
  if (!importEnabled) {
    return <NotFound />;
  }

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 24px 70px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: SUBINK }}>
          <a href="/projects" onClick={(e) => { e.preventDefault(); navigate('/projects'); }} style={{ color: SUBINK, textDecoration: 'none' }}>
            Releases
          </a>
          <span aria-hidden style={{ color: 'rgba(0,0,0,0.25)' }}>&rsaquo;</span>
          <span style={{ color: INK }}>Start from saved specs</span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: '12px 0 0' }} data-testid="heading-import">
          Your saved project specs. <span style={{ color: SUBINK, fontWeight: 500 }}>Start a project here from them.</span>
        </h1>
        <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0', lineHeight: 1.6 }}>
          These are project specs saved on your account. Only the specs carry over — format,
          color, jacket and quantity. Pricing here is always this press's own, worked out once
          you confirm your choices.
        </p>

        {error && (
          <p data-testid="text-import-error" style={{ fontSize: 12.5, color: INK, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, padding: '10px 14px', margin: '16px 0 0' }}>
            {error}
          </p>
        )}

        {/* ── Step 1: pick a project ── */}
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>1. Choose a project</h2>
          {isLoading && <p style={{ fontSize: 12.5, color: SUBINK, marginTop: 10 }}>Loading your saved specs&hellip;</p>}
          {!isLoading && projects.length === 0 && (
            <p style={{ fontSize: 12.5, color: SUBINK, marginTop: 10 }} data-testid="text-no-projects">
              No saved project specs on your account right now.
            </p>
          )}
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {projects.map((p) => {
              const active = selected?.id === p.id;
              const bits = [p.format, p.colorTierName, p.colorName, p.jacketName, p.lastQuantity ? `${p.lastQuantity.toLocaleString()} units` : null].filter(Boolean);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => translate(p)}
                  data-testid={`button-project-${p.id}`}
                  style={{
                    textAlign: 'left', padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? CARD_RAISED : 'transparent',
                    border: `1px solid ${active ? 'rgba(0,0,0,0.28)' : HAIRLINE}`, borderRadius: 0,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{p.title ?? 'Untitled project'}</div>
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{bits.join(' · ') || 'Saved specs'}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Step 2: confirm the translation ── */}
        {selected && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>2. Check your specs here</h2>
            {translating && <p style={{ fontSize: 12.5, color: SUBINK, marginTop: 10 }}>Checking what's offered here&hellip;</p>}
            {proposal && (
              <div style={{ marginTop: 12, border: `1px solid ${HAIRLINE}` }}>
                {proposal.fields.map((f) => (
                  <div key={f.field} data-testid={`row-match-${f.field}`} style={{ padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130 }}>{FIELD_LABELS[f.field]}</span>
                      <span style={{ fontSize: 12.5, color: SUBINK }}>{String(f.sourceValue ?? '—')}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: SUBINK }}>
                        <MatchGlyph status={f.status} />
                        {statusWord(f.status)}
                      </span>
                    </div>
                    {f.status === 'closest' && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {f.candidates.map((c) => {
                          const picked = picks[f.field] === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (f.field === 'colorTier') {
                                  // Colour candidates depend on the finish: re-translate
                                  // against the confirmed tier so every shown color is
                                  // genuinely available under it.
                                  setPicks((prev) => ({ ...prev, colorTier: c.id }));
                                  void retranslateWithTier(c.id);
                                } else {
                                  setPicks((prev) => ({ ...prev, [f.field]: c.id }));
                                }
                              }}
                              data-testid={`button-pick-${f.field}-${c.id}`}
                              style={{
                                padding: '6px 12px', fontSize: 12.5, fontWeight: picked ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                                background: picked ? CARD_RAISED : 'transparent', color: INK,
                                border: `1px solid ${picked ? 'rgba(0,0,0,0.28)' : HAIRLINE}`, borderRadius: 0,
                              }}
                            >
                              {picked ? '✓ ' : ''}{c.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {f.status === 'none' && f.note && (
                      <p style={{ fontSize: 12, color: SUBINK, margin: '6px 0 0' }}>{f.note} You can choose from what's offered once your draft opens.</p>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: SUBINK, margin: 0, flex: 1 }}>
                    Starting creates a draft here with these specs. Nothing is ordered and no
                    pricing is set until you finish the draft with this press.
                  </p>
                  {/* The page's ONE gold fill. */}
                  <button
                    type="button"
                    disabled={!allConfirmed || starting}
                    onClick={start}
                    data-testid="button-import-confirm"
                    style={{
                      padding: '9px 20px', borderRadius: 0, border: 'none', fontSize: 12.5, fontWeight: 700,
                      background: !allConfirmed || starting ? CARD_RAISED : GOLD, color: INK,
                      cursor: !allConfirmed || starting ? 'default' : 'pointer',
                    }}
                  >
                    {starting ? 'Starting…' : 'Start this project'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Masters release (optional) ── */}
        {selected && proposal && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Need your masters?</h2>
            <p style={{ fontSize: 12.5, color: SUBINK, margin: '6px 0 0', lineHeight: 1.6 }}>
              If your previous press is holding lacquers, stampers or production files for this
              project, you can ask them to release your masters. The request goes from your
              account; we'll show its status here.
            </p>
            <button
              type="button"
              disabled={mastersState !== 'idle'}
              onClick={requestMasters}
              data-testid="button-masters-request"
              style={{
                marginTop: 10, padding: '8px 16px', borderRadius: 0, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                background: 'transparent', color: mastersState === 'sent' ? SUBINK : INK,
                border: `1px solid ${HAIRLINE}`, cursor: mastersState === 'idle' ? 'pointer' : 'default',
              }}
            >
              {mastersState === 'sent' ? '✓ Request sent' : mastersState === 'sending' ? 'Sending…' : 'Request masters release'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
