// Artist Portal Restructure — SCENE 7, Settings.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026): SettingsSection /
// SettingsRow hairline grammar, Team rows w/ initials circles + Invite row,
// Connections rows. MOCK_TEAM swapped for GET /api/artist/team; Shopify state
// from GET /api/artist/shopify/overview.

import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, UserPlus, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useRestructureTheme, cn, shopifyLogo, BLUE, type Theme } from './shared';

// ─── Team invite dialog (Bill's brief, Aug 24 2026) ──────────────────
// Verbatim copy from the brief; role picker maps Admin → inviteRole
// "team" (regular teammate) and View → "team_view" (view-only tier;
// server whitelists it and stamps it as the membership sub_role).
function TeamInviteDialog({ t, onClose }: { t: Theme; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<'admin' | 'view'>('admin');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ acceptUrl: string | null; emailDelivered: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/artist/invites', {
        name: name.trim(),
        email: email.trim(),
        inviteRole: level === 'admin' ? 'team' : 'team_view',
      });
      return (await r.json()) as { acceptUrl: string | null; emailDelivered?: boolean };
    },
    onSuccess: (body) => {
      setSent({ acceptUrl: body.acceptUrl ?? null, emailDelivered: !!body.emailDelivered });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/artist/team') });
    },
    onError: (e: any) => setError(e?.message?.replace(/^\d+:\s*/, '') || 'Something went wrong — try again.'),
  });

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const inputStyle = { width: '100%', height: 38, padding: '0 12px', fontSize: 13.5, borderRadius: 10, border: `1px solid ${t.hairline}`, background: t.card, color: t.ink, outline: 'none' } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} data-testid="team-invite-dialog">
      <div className="rounded-2xl w-full" style={{ maxWidth: 440, background: t.card, border: `1px solid ${t.hairline}`, padding: 24, margin: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[17px] font-semibold" style={{ color: t.ink }}>Invite someone</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex items-center justify-center rounded-full" style={{ width: 28, height: 28, background: t.soft }} data-testid="team-invite-close">
            <X className="w-4 h-4" style={{ color: t.subink }} />
          </button>
        </div>
        <p className="text-[13px]" style={{ marginTop: 6, color: t.subink }}>
          Invite your manager, bandmates, or anyone who helps run your releases. They&rsquo;ll get their own sign-in, and you stay in control.
        </p>
        {sent ? (
          <div style={{ marginTop: 16 }}>
            {sent.emailDelivered ? (
              <p className="text-[13px] font-medium inline-flex items-center gap-1.5" style={{ color: t.ready }} data-testid="team-invite-emailed">
                <Check className="w-4 h-4" strokeWidth={3} /> Invite emailed to {email.trim()}
              </p>
            ) : sent.acceptUrl ? (
              <>
                <p className="text-[13px]" style={{ color: t.subink }} data-testid="team-invite-copylink-note">The email didn&rsquo;t go out — share this link instead:</p>
                <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                  <input readOnly value={sent.acceptUrl} style={{ ...inputStyle, fontSize: 12 }} data-testid="team-invite-link" onFocus={(e) => e.currentTarget.select()} />
                  <button
                    type="button"
                    className="rounded-full font-semibold text-[12.5px] flex-shrink-0"
                    style={{ padding: '8px 14px', background: BLUE, color: '#fff' }}
                    onClick={() => { navigator.clipboard?.writeText(sent.acceptUrl!); setCopied(true); }}
                    data-testid="team-invite-copy"
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: t.subink }} data-testid="team-invite-held">Sent for review — an operator will approve it before the invite goes out.</p>
            )}
            <button type="button" className="text-[13px] font-medium" style={{ marginTop: 16, color: t.subink }} onClick={onClose} data-testid="team-invite-done">Done</button>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setError(null); send.mutate(); }}
            style={{ marginTop: 16 }}
          >
            <label className="block text-[12px] font-semibold" style={{ color: t.subink }}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" style={{ ...inputStyle, marginTop: 5 }} data-testid="team-invite-name" />
            </label>
            <label className="block text-[12px] font-semibold" style={{ marginTop: 12, color: t.subink }}>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" style={{ ...inputStyle, marginTop: 5 }} data-testid="team-invite-email" />
            </label>
            <fieldset style={{ marginTop: 12 }}>
              <legend className="text-[12px] font-semibold" style={{ color: t.subink }}>Role</legend>
              <div className="grid grid-cols-2 gap-2" style={{ marginTop: 5 }}>
                {([['admin', 'Admin', 'Can edit releases and settings'], ['view', 'View', 'Can look, not change']] as const).map(([id, label, sub]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLevel(id)}
                    className="rounded-xl text-left"
                    style={{ padding: '10px 12px', border: `1.5px solid ${level === id ? BLUE : t.hairline}`, background: level === id ? `${BLUE}0F` : t.card }}
                    data-testid={`team-invite-role-${id}`}
                    aria-pressed={level === id}
                  >
                    <span className="block text-[13px] font-semibold" style={{ color: t.ink }}>{label}</span>
                    <span className="block text-[11.5px]" style={{ marginTop: 2, color: t.faint }}>{sub}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {error && <p className="text-[12.5px]" style={{ marginTop: 10, color: '#B42318' }} data-testid="team-invite-error">{error}</p>}
            <button
              type="submit"
              disabled={!emailOk || send.isPending}
              className="w-full rounded-full font-semibold text-[13.5px]"
              style={{ marginTop: 16, height: 40, background: BLUE, color: '#fff', opacity: !emailOk || send.isPending ? 0.5 : 1 }}
              data-testid="team-invite-send"
            >
              {send.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

type TeamMember = { id: string; name: string; email: string | null; role: string };
type TeamPayload = { team: TeamMember[]; payout: { status: 'enabled' | 'pending' | 'not_set_up' } };
type ShopifyOverview = { configured?: boolean; stores?: Array<{ shopDomain?: string }> };

function SettingsSection({ title, blurb, children, t, testid }: { title: string; blurb: string; children: ReactNode; t: Theme; testid: string }) {
  return (
    <section style={{ marginTop: 28 }} data-testid={testid}>
      <h2 className="text-[16px] font-semibold" style={{ color: t.ink }}>{title}</h2>
      <p className="text-[12.5px]" style={{ marginTop: 3, color: t.subink }}>{blurb}</p>
      <div className="rounded-2xl overflow-hidden" style={{ marginTop: 12, border: `1px solid ${t.hairline}`, background: t.card }}>
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ first, left, right, t, testid, dimmed, onActivate }: { first?: boolean; left: ReactNode; right: ReactNode; t: Theme; testid: string; dimmed?: boolean; onActivate?: () => void }) {
  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex items-center gap-3 flex-shrink-0">{right}</div>
    </>
  );
  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={cn('w-full flex items-center justify-between gap-6 text-left transition-colors', t.hoverCard)}
        style={{ padding: '14px 18px', borderTop: first ? undefined : `1px solid ${t.hairline}`, opacity: dimmed ? 0.62 : 1 }}
        data-testid={testid}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className="flex items-center justify-between gap-6"
      style={{ padding: '14px 18px', borderTop: first ? undefined : `1px solid ${t.hairline}`, opacity: dimmed ? 0.62 : 1 }}
      data-testid={testid}
    >
      {content}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ArtistSettingsPage({ personId: personIdProp }: { personId?: string | null } = {}) {
  const t = useRestructureTheme();
  // Super-admin god view passes ?personId= through the URL — thread it.
  // The admin mirror (AdminPerson) passes an explicit prop instead.
  const personId = personIdProp ?? new URLSearchParams(window.location.search).get('personId');
  const teamQ = useQuery<TeamPayload>({ queryKey: [`/api/artist/team${personId ? `?personId=${personId}` : ''}`] });
  const shopifyQ = useQuery<ShopifyOverview>({ queryKey: [`/api/artist/shopify/overview${personId ? `?personId=${personId}` : ''}`], retry: false });

  const members = teamQ.data?.team ?? [];
  const [inviteOpen, setInviteOpen] = useState(false);
  const shopifyConnected = Boolean(shopifyQ.data?.configured && (shopifyQ.data?.stores?.length ?? 0) > 0);
  const payoutReady = teamQ.data?.payout?.status === 'enabled';
  const openShopify = () => {
    const sp = new URLSearchParams(window.location.search);
    sp.set('tab', 'shopify');
    window.history.pushState(null, '', `${window.location.pathname}?${sp.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 860, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Settings. </span>
        <span style={{ color: t.subink }}>Team and connections</span>
      </h1>

      <SettingsSection title="Team" blurb="Who can work on your releases with you." t={t} testid="settings-team">
        {teamQ.isLoading ? (
          <div className="text-[13px]" style={{ padding: '18px', color: t.subink }}>Loading team…</div>
        ) : (
          <>
            {members.map((m, i) => (
              <SettingsRow
                key={m.id}
                first={i === 0}
                testid={`team-member-${i}`}
                t={t}
                left={
                  <>
                    <span className="rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold" style={{ width: 32, height: 32, background: t.soft, color: t.subink }}>
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>{m.name}</div>
                      {m.email && <div className="text-[11.5px] truncate" style={{ color: t.faint }}>{m.email}</div>}
                    </div>
                  </>
                }
                right={<span className="text-[12.5px] font-medium" style={{ color: t.subink }}>{m.role}</span>}
              />
            ))}
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className={cn('w-full flex items-center gap-3 text-left transition-colors', t.hoverCard)}
              style={{ padding: '14px 18px', borderTop: members.length === 0 ? undefined : `1px solid ${t.hairline}` }}
              data-testid="team-invite-row"
            >
              <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, border: `1.5px dashed ${t.dashed}` }}>
                <UserPlus className="w-4 h-4" style={{ color: t.subink }} />
              </span>
              <span className="text-[13.5px] font-medium" style={{ color: t.subink }}>Invite someone</span>
            </button>
            {inviteOpen && <TeamInviteDialog t={t} onClose={() => setInviteOpen(false)} />}
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Connections" blurb="Outside services tied to your account." t={t} testid="settings-connections">
        <SettingsRow
          first
          testid="connection-shopify"
          t={t}
          onActivate={openShopify}
          left={
            <>
              <img src={shopifyLogo} alt="Shopify" style={{ height: 20, width: 'auto', filter: t.logoFilter }} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Shopify</div>
                <div className="text-[11.5px]" style={{ color: t.faint }}>
                  {shopifyConnected ? (shopifyQ.data?.stores?.[0]?.shopDomain ?? 'Connected store') : 'Sell on your own store'}
                </div>
              </div>
            </>
          }
          right={
            shopifyConnected ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: t.ready }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> Connected
                </span>
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: t.subink }} data-testid="button-manage-shopify">
                  Manage <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: t.faint }}>
                  <X className="w-3.5 h-3.5" /> Not connected
                </span>
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: t.subink }}>
                  Connect <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </>
            )
          }
        />
        <SettingsRow
          testid="connection-payout"
          t={t}
          dimmed={!payoutReady}
          left={
            <>
              <span
                aria-label="Stripe"
                className="inline-flex items-center text-[15px] font-bold tracking-tight"
                style={{ color: t.ink, width: 54 }}
              >
                Stripe
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Payout account</div>
                <div className="text-[11.5px]" style={{ color: t.faint }}>Powered by Stripe</div>
              </div>
            </>
          }
          right={
            payoutReady ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: t.ready }}>
                <Check className="w-3.5 h-3.5" strokeWidth={3} /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: t.faint }} data-testid="payout-coming-soon">
                <X className="w-3.5 h-3.5" /> Coming soon
              </span>
            )
          }
        />
      </SettingsSection>
    </div>
  );
}
