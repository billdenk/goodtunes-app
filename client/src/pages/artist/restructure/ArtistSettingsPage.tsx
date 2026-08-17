// Artist Portal Restructure — SCENE 7, Settings.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026): SettingsSection /
// SettingsRow hairline grammar, Team rows w/ initials circles + Invite row,
// Connections rows. MOCK_TEAM swapped for GET /api/artist/team; Shopify state
// from GET /api/artist/shopify/overview. Dead-end CTAs are quiet no-ops.

import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, UserPlus, X } from 'lucide-react';
import { useRestructureTheme, cn, shopifyLogo, type Theme } from './shared';

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

function SettingsRow({ first, left, right, t, testid, dimmed }: { first?: boolean; left: ReactNode; right: ReactNode; t: Theme; testid: string; dimmed?: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-6"
      style={{ padding: '14px 18px', borderTop: first ? undefined : `1px solid ${t.hairline}`, opacity: dimmed ? 0.62 : 1 }}
      data-testid={testid}
    >
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex items-center gap-3 flex-shrink-0">{right}</div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ArtistSettingsPage() {
  const t = useRestructureTheme();
  // Super-admin god view passes ?personId= through the URL — thread it.
  const personId = new URLSearchParams(window.location.search).get('personId');
  const teamQ = useQuery<TeamPayload>({ queryKey: [`/api/artist/team${personId ? `?personId=${personId}` : ''}`] });
  const shopifyQ = useQuery<ShopifyOverview>({ queryKey: [`/api/artist/shopify/overview${personId ? `?personId=${personId}` : ''}`], retry: false });

  const members = teamQ.data?.team ?? [];
  const shopifyConnected = Boolean(shopifyQ.data?.configured && (shopifyQ.data?.stores?.length ?? 0) > 0);
  const payoutReady = teamQ.data?.payout?.status === 'enabled';

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 860, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Settings. </span>
        <span style={{ color: t.subink }}>Team and connections.</span>
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
              className={cn('w-full flex items-center gap-3 text-left transition-colors', t.hoverCard)}
              style={{ padding: '14px 18px', borderTop: members.length === 0 ? undefined : `1px solid ${t.hairline}` }}
              data-testid="team-invite-row"
            >
              <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, border: `1.5px dashed ${t.dashed}` }}>
                <UserPlus className="w-4 h-4" style={{ color: t.subink }} />
              </span>
              <span className="text-[13.5px] font-medium" style={{ color: t.subink }}>Invite someone</span>
            </button>
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Connections" blurb="Outside services tied to your account." t={t} testid="settings-connections">
        <SettingsRow
          first
          testid="connection-shopify"
          t={t}
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
                <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: t.subink }} data-testid="button-manage-shopify">
                  Manage <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: t.faint }}>
                <X className="w-3.5 h-3.5" /> Not connected
              </span>
            )
          }
        />
        <SettingsRow
          testid="connection-payout"
          t={t}
          dimmed={!payoutReady}
          left={
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Payout account</div>
              <div className="text-[11.5px]" style={{ color: t.faint }}>Where your earnings land</div>
            </div>
          }
          right={
            payoutReady ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: t.ready }}>
                <Check className="w-3.5 h-3.5" strokeWidth={3} /> Ready
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: t.faint }}>
                  <X className="w-3.5 h-3.5" /> Not set up
                </span>
                <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: t.subink }} data-testid="button-setup-payout">
                  Set up <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )
          }
        />
      </SettingsSection>
    </div>
  );
}
