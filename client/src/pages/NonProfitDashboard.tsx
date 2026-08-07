import { useEffect, useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Heart, Music as MusicIcon, Mail, Clock, UserPlus, Users, Trash2, Send, Copy, Check, ChevronDown, CheckCircle2, Circle, Sparkles, HeartHandshake, X } from "lucide-react";
import { ReferralLinkWidget } from "@/components/admin/ReferralLinkWidget";
import { AcquisitionTab } from "@/components/operator/AcquisitionTab";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import {
  PartnerDashboard, RANGE_PRESETS, formatValue,
  type PartnerRangePreset, type DashboardPayload, type ActivityItem,
} from "@/components/partner/PartnerDashboard";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
import { NpoAlbumLedger } from "@/components/NpoAlbumLedger";
import { BuyerReport } from "@/components/partner/BuyerReport";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  KpiCard, KpiCardSkeleton, kpiInfoKeyFromTestId, type KpiCardModel,
} from "@/components/admin/KpiCard";

// Task #78 — Non-profit partner shell. Task #545 extends it with the
// ambassador / staff / artist invite tree: NPO admins can mint
// ambassador & staff sub-role users plus invite artists directly, and
// sub-role users (`npo_ambassador`/`npo_staff`) see an "Invite an
// artist" CTA. The Tree tab (admin-only) visualises who invited whom.
type CallerCaps = {
  ok: boolean;
  isAdmin: boolean;
  subRole: "npo_ambassador" | "npo_staff" | null;
  canInviteAmbassadors: boolean;
  canInviteStaff: boolean;
  canInviteArtists: boolean;
  canViewTree: boolean;
};
type Me = {
  id: string; name: string; logoUrl: string | null; websiteUrl: string | null;
  caller: CallerCaps | null;
};
type Dashboard = {
  pendingCents: number;
  pendingCount: number;
  paidCents: number;
  artists: {
    id: string;
    name: string;
    photoUrl: string | null;
    status: "active" | "pending_invite";
    canInviteAmbassadors: boolean;
    albums: { id: string; title: string; coverUrl: string | null; paidUnits: number }[];
  }[];
  pendingInvites: { id: string; email: string; role: string; createdAt: string; expiresAt: string }[];
};
type TreeArtist = {
  id: string;
  personId: string | null;
  name: string;
  email: string;
  photoUrl: string | null;
  status: "accepted" | "pending";
  createdAt: string;
  expiresAt: string;
};
type TreeTeamNode =
  | {
      nodeKind: "user";
      id: string;
      name: string;
      email: string;
      subRole: "admin" | "ambassador" | "staff";
      joinedAt: string | null;
      artists: TreeArtist[];
    }
  | {
      nodeKind: "pending";
      id: string;
      inviteId: string;
      name: string;
      email: string;
      subRole: "ambassador" | "staff";
      createdAt: string;
      expiresAt: string;
      artists: TreeArtist[];
    };
type Tree = {
  npo: { id: string; name: string; logoUrl: string | null };
  team: TreeTeamNode[];
  orphanArtists: TreeArtist[];
};

const fmt = (c: number) => formatUsdCents(c);

type NpoTabId = "dashboard" | "artists" | "acquisition" | "buyers" | "invites" | "ledger" | "tree";

// ─── Apple-canon first-run dashboard (docs/design-reference/code/NpoFirstRun*.tsx) ──
// Visual layer only: the data underneath is the real partner-dashboard payload
// plus the legacy NPO roster endpoint. Tokens ride the --apple-* theme vars so
// gt-admin-dark flips them with no per-screen overrides.

const ND_BLUE = "#319ED8";
const ND_INK = "var(--apple-ink)";
const ND_SUBINK = "var(--apple-subink)";
const ND_FAINT = "var(--apple-faint)";
const ND_HAIRLINE = "var(--apple-hairline)";
const ND_TRACK = "var(--apple-track)";
const ND_PILL = "var(--apple-pill)";
const ND_TILE = "var(--apple-tile)";
const ND_READY = "var(--apple-ready)";
const ND_PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)";
const ND_DASH = "—";

function ndFmtRel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${Math.max(s, 1)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

function NdSectionHeading({ lead, rest, size = 20 }: { lead: string; rest?: string; size?: number }) {
  return (
    <h3 style={{ fontSize: size, letterSpacing: "-0.01em" }} className="min-w-0">
      <span className="font-semibold" style={{ color: ND_INK }}>{lead}</span>
      {rest ? <span className="font-medium" style={{ color: ND_SUBINK }}> {rest}</span> : null}
    </h3>
  );
}

function NdRangeSwitcher({ value, onChange }: { value: PartnerRangePreset; onChange: (v: PartnerRangePreset) => void }) {
  return (
    <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: ND_TRACK, gap: 2 }} data-testid="dashboard-range-switcher">
      {RANGE_PRESETS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            data-testid={`button-range-${o.id}`}
            className="px-3.5 h-8 text-[13px] rounded-full transition-all"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? ND_INK : ND_SUBINK,
              backgroundColor: active ? ND_PILL : undefined,
              boxShadow: active ? ND_PILL_SHADOW : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// KPI strip — real payload values; zero/empty values render as a quiet
// em-dash with "your first X lands here" microcopy, never red zeros.
function NdKpiStrip({ payload, loading, soloArtist }: { payload?: DashboardPayload; loading: boolean; soloArtist: string | null }) {
  const hints: Record<string, string> = {
    orders: "Your first order lands here",
    newFans: soloArtist ? `Grows as ${soloArtist} finds fans` : "Grows as your artists find fans",
    donated: soloArtist ? `${soloArtist}'s first sale starts this counter` : "Your first donation lands here",
    pending: "Donations accrue here before payout",
    paid: "Disbursements to your foundation",
  };
  const kpis = payload?.kpis ?? [];
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }} data-testid="kpi-strip">
      {loading || kpis.length === 0
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-5 h-[124px] animate-pulse" style={{ border: `1px solid ${ND_HAIRLINE}` }} />
          ))
        : kpis.map((k) => {
            const empty = k.value === null || k.value === undefined || k.value === 0;
            return (
              <div
                key={k.id}
                data-testid={`kpi-${k.id}`}
                className="rounded-2xl bg-white p-5 flex flex-col"
                style={{ border: `1px solid ${ND_HAIRLINE}` }}
              >
                <div className="text-[13px] font-medium truncate" style={{ color: ND_SUBINK }}>{k.label}</div>
                <div
                  className="mt-3 tabular-nums"
                  style={{ fontSize: 32, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.03em", color: empty ? ND_FAINT : ND_INK }}
                >
                  {empty ? ND_DASH : formatValue(k.value, k.format)}
                </div>
                <div className="mt-3 text-[12px] leading-snug" style={{ color: ND_FAINT }}>
                  {hints[k.id] ?? ""}
                </div>
              </div>
            );
          })}
    </div>
  );
}

// Getting-started checklist — done items sink to the bottom; the first
// active step carries the single blue CTA.
type NdStep = { id: string; title: string; detail: string; done: boolean; cta?: string; go?: NpoTabId };

function NdGettingStarted({ steps, onNavigate }: { steps: NdStep[]; onNavigate: (t: NpoTabId) => void }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="rounded-2xl bg-white p-6 h-full flex flex-col" style={{ border: `1px solid ${ND_HAIRLINE}` }} data-testid="getting-started">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <NdSectionHeading lead="Getting started." rest="A few quick steps." />
          <p className="text-[13.5px] mt-0.5" style={{ color: ND_SUBINK }}>Complete these to start raising donations.</p>
        </div>
        <span className="text-[12px] font-semibold tabular-nums rounded-full px-3 py-1" style={{ backgroundColor: ND_TRACK, color: ND_SUBINK }}>
          {doneCount} of {steps.length}
        </span>
      </div>
      <ul className="flex-1">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className="flex items-start gap-3 py-4"
            style={{ borderTop: i > 0 ? `1px solid ${ND_HAIRLINE}` : undefined }}
            data-testid={`step-${s.id}`}
          >
            {s.done ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ND_READY }} />
            ) : (
              <Circle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ND_FAINT }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: s.done ? ND_SUBINK : ND_INK }}>{s.title}</div>
              <p className="text-[12.5px] mt-0.5" style={{ color: ND_SUBINK }}>{s.detail}</p>
            </div>
            {s.cta && s.go && (
              <button
                type="button"
                onClick={() => onNavigate(s.go!)}
                className="flex-shrink-0 inline-flex items-center text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: ND_BLUE }}
                data-testid={`step-cta-${s.id}`}
              >
                {s.cta}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Activity — real payload events first (with their drill-down links), then
// the standing "joined GoodTunes" welcome row.
function NdActivityIcon({ kind }: { kind: string }) {
  const Icon =
    /artist|roster|signup|joined/i.test(kind) ? UserPlus :
    /credit|donat/i.test(kind) ? HeartHandshake :
    /invite/i.test(kind) ? Mail :
    Clock;
  return (
    <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ND_TILE }}>
      <Icon className="w-4 h-4" style={{ color: ND_SUBINK }} />
    </span>
  );
}

function NdActivityFeed({ items, loading, orgName }: { items: ActivityItem[]; loading: boolean; orgName: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 flex flex-col h-full" style={{ border: `1px solid ${ND_HAIRLINE}` }} data-testid="dashboard-activity-feed">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <NdSectionHeading lead="As it happens." rest="Recent activity." />
      </div>
      <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto">
        {loading && items.length === 0 && (
          <li className="py-2"><div className="h-9 rounded-xl animate-pulse" style={{ backgroundColor: ND_TILE }} /></li>
        )}
        {items.map((it, i) => {
          const body = (
            <div className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors">
              <NdActivityIcon kind={it.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate" style={{ color: ND_INK }}>{it.title}</div>
                {it.detail && <div className="text-[12px] truncate" style={{ color: ND_SUBINK }}>{it.detail}</div>}
              </div>
              <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: ND_FAINT }}>
                {ndFmtRel(new Date(it.ts))}
              </div>
            </div>
          );
          return (
            <li key={i} data-testid={`activity-${it.kind}-${i}`}>
              {it.href ? <Link href={it.href} className="block">{body}</Link> : body}
            </li>
          );
        })}
        <li data-testid="activity-welcome">
          <div className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl">
            <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ND_TILE }}>
              <Sparkles className="w-4 h-4" style={{ color: ND_SUBINK }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px]" style={{ color: ND_INK }}>{orgName} joined GoodTunes · Welcome!</div>
              <div className="text-[12px]" style={{ color: ND_SUBINK }}>Your foundation is set up</div>
            </div>
          </div>
        </li>
      </ul>
      <p className="text-[12px] mt-2 pt-3 leading-snug" style={{ color: ND_FAINT, borderTop: `1px solid ${ND_HAIRLINE}` }}>
        Business events will land here as things happen.
      </p>
    </div>
  );
}

// Your artists — real roster rows (accepted + pending invites); empty state
// when nobody's aboard yet.
function NdArtistsCard({ artists, soloArtist }: { artists: Dashboard["artists"]; soloArtist: string | null }) {
  const empty = artists.length === 0;
  return (
    <div className="rounded-2xl bg-white p-6 flex flex-col h-full" style={{ border: `1px solid ${ND_HAIRLINE}` }} data-testid="your-artists">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="min-w-0">
          <NdSectionHeading lead="Your artists." rest="Your roster." size={17} />
          <p className="text-[12.5px]" style={{ color: ND_SUBINK }}>Artists referred by your foundation</p>
        </div>
        {!empty && (
          <span className="text-[12px] font-semibold tabular-nums rounded-full px-3 py-1 flex-shrink-0" style={{ backgroundColor: ND_TRACK, color: ND_SUBINK }}>
            {artists.length}
          </span>
        )}
      </div>
      {empty ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8">
          <span className="w-14 h-14 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: ND_TILE }}>
            <Users className="w-6 h-6" style={{ color: ND_SUBINK }} />
          </span>
          <p className="mt-4 text-[15px] font-semibold" style={{ color: ND_INK }}>Artists you refer will show here</p>
          <p className="mt-1.5 text-[13px] max-w-xs leading-relaxed" style={{ color: ND_SUBINK }}>
            Invite your first artist to start earning donations from every paid unit.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex-1 min-h-0">
            {artists.map((a) => {
              const albums = a.albums.length;
              const status =
                a.status === "pending_invite" ? "Invite pending" :
                albums === 0 ? "Setting up their store" :
                `${albums} project${albums === 1 ? "" : "s"} live`;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-xl" data-testid={`artist-row-${a.id}`}>
                  <span className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 inline-flex items-center justify-center" style={{ border: `1px solid ${ND_HAIRLINE}`, backgroundColor: ND_TILE }}>
                    {a.photoUrl ? (
                      <img src={a.photoUrl} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[14px] font-semibold" style={{ color: ND_SUBINK }}>{a.name.slice(0, 1)}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-semibold truncate" style={{ color: ND_INK }}>{a.name}</span>
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: ND_SUBINK }}>{status}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[16px] font-semibold tabular-nums leading-none" style={{ color: ND_FAINT }}>{ND_DASH}</div>
                    <div className="text-[11px] mt-1" style={{ color: ND_FAINT }}>in donations</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] mt-1 pt-3 leading-snug" style={{ color: ND_FAINT, borderTop: `1px solid ${ND_HAIRLINE}` }}>
            Donations start posting once {soloArtist ?? "your artists"} make{soloArtist ? "s" : ""} the first sale.
          </p>
        </>
      )}
    </div>
  );
}

function NdEmptyDonations({ soloArtist }: { soloArtist: string | null }) {
  return (
    <div className="rounded-2xl bg-white p-6 flex flex-col h-full" style={{ border: `1px solid ${ND_HAIRLINE}` }} data-testid="donations-ledger">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="min-w-0">
          <NdSectionHeading lead="Donations." rest="Every dollar raised." size={17} />
          <p className="text-[12.5px]" style={{ color: ND_SUBINK }}>By project, line by line</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8">
        <span className="w-14 h-14 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: ND_TILE }}>
          <HeartHandshake className="w-6 h-6" style={{ color: ND_SUBINK }} />
        </span>
        <p className="mt-4 text-[15px] font-semibold" style={{ color: ND_INK }}>Your donation ledger is empty</p>
        <p className="mt-1.5 text-[13px] max-w-xs leading-relaxed" style={{ color: ND_SUBINK }}>
          As {soloArtist ?? "your artists"} sell{soloArtist ? "s" : ""}, each donation will post here — line by line.
        </p>
      </div>
    </div>
  );
}

// Welcome modal — light Apple-Music dim-and-blur; backdrop inline styles.
function NdWelcomeModal({ firstName, onClose, onInvite }: { firstName: string | null; onClose: () => void; onInvite: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="npo-welcome-title" data-testid="welcome-modal">
      <button
        type="button"
        aria-label="Dismiss welcome"
        onClick={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        data-testid="welcome-backdrop"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center" style={{ border: `1px solid ${ND_HAIRLINE}`, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: ND_TILE, color: ND_FAINT }}
          data-testid="button-welcome-close"
        >
          <X className="w-4 h-4" />
        </button>
        <img src={gtLogo} alt="GoodTunes" className="w-auto mx-auto" style={{ height: 40, marginBottom: 24 }} />
        <h2 id="npo-welcome-title" className="text-[24px] font-semibold" style={{ color: ND_INK, letterSpacing: "-0.02em" }}>
          Welcome{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: ND_SUBINK }}>
          This is your foundation's home base. Every dollar raised by the artists you refer (or those who we send directly to you) shows up right here, all in one place.
        </p>
        <div className="flex flex-col gap-2" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="w-full h-10 rounded-lg text-white text-[14px] font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: ND_BLUE }}
            onClick={onInvite}
            data-testid="button-welcome-primary"
          >
            Invite my first artist
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ color: ND_SUBINK }}
            data-testid="button-welcome-secondary"
          >
            I'll look around first
          </button>
        </div>
      </div>
    </div>
  );
}

// Dashboard tab — first-run canon layout while the foundation has no
// donation history; established NPOs keep the shared PartnerDashboard.
function NdDashboardTab({ me, onNavigate }: { me: Me | null; onNavigate: (t: NpoTabId) => void }) {
  const [preset, setPreset] = useState<PartnerRangePreset>("30d");
  const legacy = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  const payload = useQuery<DashboardPayload>({ queryKey: [`/api/partner/npo/dashboard?range=${preset}`] });
  const roleInfo = useQuery<{ displayName?: string | null }>({ queryKey: ["/api/me/role"] });
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("gt-npo-welcome") === "1"; } catch { return true; }
  });

  const orgName = me?.name ?? "Your foundation";
  const firstName = (roleInfo.data?.displayName ?? "").trim().split(/\s+/)[0] || null;

  const paidUnits = (legacy.data?.artists ?? []).reduce(
    (n, a) => n + a.albums.reduce((m, al) => m + al.paidUnits, 0), 0,
  );
  const firstRun = !!legacy.data
    && legacy.data.pendingCents === 0
    && legacy.data.paidCents === 0
    && paidUnits === 0;

  if (legacy.isLoading) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white h-[124px] animate-pulse" style={{ border: `1px solid ${ND_HAIRLINE}` }} />
        ))}
      </div>
    );
  }

  // Established foundation (or roster read failed) → the shared dashboard.
  if (!firstRun) {
    return (
      <PartnerDashboard
        scope="npo"
        sectionTitle="Dashboard"
        title={orgName}
        subtitle="Donation activity from referred artists"
      />
    );
  }

  const artists = legacy.data?.artists ?? [];
  const activeArtists = artists.filter((a) => a.status === "active");
  const hasArtist = activeArtists.length > 0;
  const soloArtist = activeArtists.length === 1 ? (activeArtists[0].name.trim().split(/\s+/)[0] || null) : null;

  const steps: NdStep[] = [
    ...(!hasArtist ? [{
      id: "invite-artist",
      title: "Invite your first artist",
      detail: "Bring an artist aboard — every paid unit they sell earns your foundation a donation.",
      done: false,
      cta: "Invite an artist",
      go: "invites" as NpoTabId,
    }] : []),
    {
      id: "referral-link",
      title: "Share your referral link",
      detail: hasArtist
        ? "Send one link and let more artists join your cause without individual invites."
        : "Send one link and let artists join your cause without individual invites.",
      done: false,
      ...(hasArtist ? { cta: "Share link", go: "acquisition" as NpoTabId } : {}),
    },
    {
      id: "team",
      title: "Invite your team",
      detail: "Add staff and ambassadors so everyone can help grow your roster.",
      done: false,
    },
    ...(hasArtist ? [{
      id: "first-artist",
      title: "Your first artist is aboard",
      detail: `${activeArtists[0].name} is on your roster.`,
      done: true,
    }] : []),
    {
      id: "live",
      title: "Your foundation is live on GoodTunes",
      detail: `${orgName} is set up and ready to receive donations.`,
      done: true,
    },
  ];

  const dismissWelcome = () => {
    try { localStorage.setItem("gt-npo-welcome", "1"); } catch {}
    setWelcomeDismissed(true);
  };

  return (
    <>
      <div className="flex flex-col gap-5" data-testid="npo-firstrun-dashboard">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1
              className="text-[30px] font-semibold"
              style={{ color: ND_INK, letterSpacing: "-0.02em", lineHeight: 1.12 }}
              data-testid="heading-npo-firstrun"
            >
              Welcome{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-[14px] mt-1" style={{ color: ND_SUBINK }}>
              {hasArtist && soloArtist
                ? `Your home base is ready — ${activeArtists[0].name} is aboard, and donations from the artists you refer will land here.`
                : "Your home base is ready — donations from the artists you refer will land here."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <NdRangeSwitcher value={preset} onChange={setPreset} />
          </div>
        </div>

        <NdKpiStrip payload={payload.data} loading={payload.isLoading} soloArtist={soloArtist} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-2 min-h-0">
            <NdGettingStarted steps={steps} onNavigate={onNavigate} />
          </div>
          <div className="min-h-0 max-h-[420px]">
            <NdActivityFeed items={payload.data?.activity ?? []} loading={payload.isLoading} orgName={orgName} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <NdArtistsCard artists={artists} soloArtist={soloArtist} />
          <NdEmptyDonations soloArtist={soloArtist} />
        </div>
      </div>

      {!hasArtist && !welcomeDismissed && (
        <NdWelcomeModal
          firstName={firstName}
          onClose={dismissWelcome}
          onInvite={() => { dismissWelcome(); onNavigate("invites"); }}
        />
      )}
    </>
  );
}


export function NonProfitDashboard() {
  const me = useQuery<Me>({ queryKey: ["/api/non-profit/me"] });
  const caps = me.data?.caller;
  const npoId = me.data?.id;
  // Tabs (incl. icons + labels) come straight from the registry — the
  // single source of truth. `tree` is gated on caps.canViewTree; the
  // registry keeps the runtime `icon` on each row for the rail.
  const tabs = useMemo<ReadonlyArray<{ id: NpoTabId; label: string }>>(
    () =>
      modulesForRole("non_profit").filter(
        (t) => t.id !== "tree" || caps?.canViewTree,
      ) as ReadonlyArray<{ id: NpoTabId; label: string }>,
    [caps?.canViewTree],
  );
  const [tab, setTab] = useState<NpoTabId>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "dashboard" || t === "artists" || t === "acquisition" || t === "buyers" || t === "invites" || t === "ledger" || t === "tree") return t;
    return "dashboard";
  });
  // Task #2486 — Dashboard-tab KPI tiles deep-link via `?tab=…` (wouter
  // pushState); mirror later `?tab=` changes into the once-seeded tab
  // state. onTabChange's replaceState lands here as an idempotent no-op.
  const search = useSearch();
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (t === "dashboard" || t === "artists" || t === "acquisition" || t === "buyers" || t === "invites" || t === "ledger" || t === "tree") {
      setTab(t);
    }
  }, [search]);

  if (me.error) {
    const msg = (me.error as any)?.message || "We couldn't load your non-profit scope.";
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="non-profit-gate">
          <h1 className="text-2xl font-bold mb-2">Non-profit dashboard</h1>
          <p className="text-slate-500 text-sm">{msg}</p>
        </div>
      </main>
    );
  }

  const subRoleLabel =
    caps?.subRole === "npo_ambassador" ? "Ambassador" :
    caps?.subRole === "npo_staff" ? "Staff" : null;

  // Super-admin-style section heading: every tab's content leads with the
  // section name as H1 (same AdminPageHeader treatment the label/artist
  // portals use). Dashboard is exempt — PartnerDashboard renders its own
  // "Dashboard" header band.
  const currentTabLabel = tabs.find((t) => t.id === tab)?.label;

  return (
    <OperatorShell
      testId="npo-shell"
      roleLabel={subRoleLabel ? `Non-profit dashboard · ${subRoleLabel}` : "Non-profit dashboard"}
      name={me.data?.name ?? "Loading…"}
      logoUrl={me.data?.logoUrl ?? null}
      fallbackIcon={Heart}
      hideHeaderIdentity
      pageTitle={tab === "dashboard" ? undefined : currentTabLabel}
      maxWidth="5xl"
      // No subtitle: org identity (name, website) lives in the rail only.
      // Passing the website link here would render it under every section
      // H1 now that pageTitle is set (it was inert while hideHeaderIdentity
      // suppressed the identity band).
      tabs={tabs}
      activeTab={tab}
      onTabChange={(newTab) => {
        setTab(newTab as NpoTabId);
        const sp = new URLSearchParams(window.location.search);
        sp.set("tab", newTab);
        history.replaceState(null, "", `${window.location.pathname}?${sp}`);
      }}
      layout="leftnav"
    >
      {tab === "dashboard" && (
        <NdDashboardTab
          me={me.data ?? null}
          onNavigate={(t) => {
            setTab(t);
            const sp = new URLSearchParams(window.location.search);
            sp.set("tab", t);
            history.replaceState(null, "", `${window.location.pathname}?${sp}`);
          }}
        />
      )}
      {tab === "artists" && <ArtistsTab />}
      {tab === "acquisition" && <AcquisitionTab kind="non_profit" scopeId={npoId ?? null} />}
      {tab === "buyers" && npoId && (
        <BuyerReport
          buyersUrl={`/api/non-profit/${npoId}/buyers`}
          mapUrl={`/api/non-profit/${npoId}/buyer-map`}
          emptyHint="No buyers have credited your foundation yet."
        />
      )}
      {tab === "invites" && <InvitesTab npoId={npoId} caps={caps ?? null} />}
      {tab === "ledger" && npoId && <NpoAlbumLedger npoId={npoId} />}
      {tab === "tree" && npoId && caps?.canViewTree && <TreeTab npoId={npoId} />}
    </OperatorShell>
  );
}

function ArtistsTab() {
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="npo-kpis">
        {dash.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <KpiCardSkeleton key={i} testId={`kpi-npo-skeleton-${i}`} />
          ))
        ) : (
          <>
            <Kpi label="Accrued donations" value={fmt(dash.data?.pendingCents ?? 0)} sub={`${dash.data?.pendingCount ?? 0} unit${(dash.data?.pendingCount ?? 0) === 1 ? "" : "s"}`} testId="kpi-npo-pending" />
            <Kpi label="Donations disbursed" value={fmt(dash.data?.paidCents ?? 0)} testId="kpi-npo-paid" />
            <Kpi label="Referred artists" value={String(dash.data?.artists.length ?? 0)} testId="kpi-npo-artists" />
          </>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Your artists</h2>
        {dash.isLoading ? (
          <p className="py-8 text-center text-slate-400 text-sm">Loading…</p>
        ) : (dash.data?.artists.length ?? 0) === 0 ? (
          <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-artists">
            <Heart className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-slate-600">
              You haven't referred any artists yet. Use the Invites tab to send your first artist invite —
              you'll earn $1 on every paid unit they ship.
            </p>
          </DashboardPanel>
        ) : (
          <ul className="space-y-3" data-testid="list-npo-artists">
            {dash.data!.artists.map((a) => (
              <li key={a.id} data-testid={`row-npo-artist-${a.id}`}>
              <DashboardPanel>
                <div className="group/artist flex items-center gap-3 mb-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.albums.length} album{a.albums.length === 1 ? "" : "s"} listed</p>
                  </div>
                  {a.status === "active" && (
                    <AmbassadorChip personId={a.id} canInviteAmbassadors={a.canInviteAmbassadors} />
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold ${
                      a.status === "active"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    }`}
                    data-testid={`status-npo-artist-${a.id}`}
                  >
                    {a.status === "active" ? "Active" : "Pending invite"}
                  </span>
                  <Link href={`/artist/${a.id}`} className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors">View →</Link>
                </div>
                {a.albums.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {a.albums.map((al) => (
                      <li key={al.id} className="flex items-center gap-3 py-2" data-testid={`row-npo-album-${al.id}`}>
                        {al.coverUrl ? (
                          <img src={al.coverUrl} alt="" className="w-9 h-9 rounded object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center"><MusicIcon className="w-4 h-4 text-slate-400" /></div>
                        )}
                        <p className="flex-1 min-w-0 text-sm truncate">{al.title}</p>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {al.paidUnits} paid · <span className="text-emerald-600">{fmt(al.paidUnits * 100)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardPanel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function InvitesTab({ npoId, caps }: { npoId: string | undefined; caps: CallerCaps | null }) {
  const { toast } = useToast();
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  const items = dash.data?.pendingInvites ?? [];
  const [openKind, setOpenKind] = useState<null | "ambassador" | "staff" | "artist">(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!npoId) throw new Error("No NPO scope");
      await apiRequest("DELETE", `/api/non-profit/${npoId}/invites/${inviteId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit", npoId, "tree"] });
      toast({ title: "Invite revoked" });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });
  const resend = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!npoId) throw new Error("No NPO scope");
      const r = await apiRequest("POST", `/api/non-profit/${npoId}/invites/${inviteId}/resend`, {});
      return r.json() as Promise<{ acceptUrl: string; emailDelivered: boolean }>;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      setLastUrl(r.acceptUrl);
      toast({
        title: r.emailDelivered ? "Invite re-sent" : "Link refreshed",
        description: r.emailDelivered ? "Fresh link is in their inbox." : "Email didn't go through — copy the link below.",
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't resend", description: e.message, variant: "destructive" }),
  });

  if (!caps?.ok) {
    return <p className="py-8 text-center text-slate-400 text-sm">Loading…</p>;
  }

  const ctas: { id: "ambassador" | "staff" | "artist"; label: string; enabled: boolean; testId: string }[] = [
    { id: "ambassador", label: "Invite ambassador", enabled: !!caps.canInviteAmbassadors, testId: "button-invite-ambassador" },
    { id: "staff", label: "Invite staff", enabled: !!caps.canInviteStaff, testId: "button-invite-staff" },
    { id: "artist", label: "Invite artist", enabled: !!caps.canInviteArtists, testId: "button-invite-artist" },
  ].filter((c) => c.enabled);

  return (
    <section>
      {/* Reusable referral link — NPO admins and ambassadors with the
          invite_subusers verb can see and copy this link to recruit
          artists without sending individual email invites. */}
      {caps.ok && npoId && (
        <div className="mb-5">
          <ReferralLinkWidget
            kind="non_profit"
            scopeId={npoId}
            canEdit={caps.isAdmin}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ctas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setOpenKind(c.id); setLastUrl(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-blue)] hover:opacity-90 px-3 py-2 text-sm font-semibold text-white transition-colors"
            data-testid={c.testId}
          >
            <UserPlus className="w-4 h-4" /> {c.label}
          </button>
        ))}
        {ctas.length === 0 && (
          <p className="text-xs text-slate-500">Ask your NPO admin to grant invite permissions.</p>
        )}
      </div>

      {lastUrl && (
        <DashboardPanel className="mb-4 flex flex-wrap items-center gap-2 px-4 py-3 text-xs" padding="none" data-testid="invite-link-banner">
          <span className="text-slate-500">Accept link:</span>
          <code className="flex-1 min-w-0 truncate font-mono text-slate-700">{lastUrl}</code>
          <button
            type="button"
            onClick={async () => { await navigator.clipboard.writeText(lastUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-1 font-semibold"
            data-testid="button-copy-invite-link"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </DashboardPanel>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Outstanding invites</h2>
      {dash.isLoading ? (
        <p className="py-8 text-center text-slate-400 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-invites">
          <Mail className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600">No outstanding ambassador / staff invites.</p>
        </DashboardPanel>
      ) : (
        <DashboardPanel as="ul" padding="none" className="divide-y divide-slate-100" data-testid="list-npo-invites">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-npo-invite-${i.id}`}>
              <Mail className="w-4 h-4 text-slate-400" />
              <span className="flex-1 min-w-0 truncate">
                {i.email}{" "}
                <span className="ml-2 text-xs uppercase tracking-wider text-slate-500">{labelForRole(i.role)}</span>
              </span>
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> expires {new Date(i.expiresAt).toLocaleDateString()}
              </span>
              {caps.isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => resend.mutate(i.id)}
                    disabled={resend.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    data-testid={`button-resend-invite-${i.id}`}
                  >
                    <Send className="w-3.5 h-3.5" /> Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Revoke invite for ${i.email}?`)) revoke.mutate(i.id); }}
                    disabled={revoke.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 ring-1 ring-rose-200 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    data-testid={`button-revoke-invite-${i.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </DashboardPanel>
      )}

      {openKind && npoId && (
        <InviteDialog
          npoId={npoId}
          kind={openKind}
          onClose={() => setOpenKind(null)}
          onSent={(url) => { setLastUrl(url); setOpenKind(null); }}
        />
      )}

      {/* Task #665 — Contacts parity with /admin/non-profits/:id. Same
          Add Admin / Ambassador dialog; server gates POSTs by
          invite_subusers on the caller, super-admins always pass.
          UI also hides "+ Add ▾" for staff/ambassador sub-roles via
          the can-invite probe so they don't see a button that 403s. */}
      {npoId && <NpoContactsPanel npoId={npoId} />}
    </section>
  );
}

function NpoContactsPanel({ npoId }: { npoId: string }) {
  const probe = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/partner-contacts/can-invite", { entityKind: "non_profit", entityId: npoId }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/partner-contacts/can-invite?entityKind=non_profit&entityId=${encodeURIComponent(npoId)}`, { credentials: "include" });
      if (!r.ok) return { ok: false };
      return r.json();
    },
  });
  return (
    <section className="mt-6 rounded-2xl bg-white p-1">
      <div className="bg-white rounded-2xl">
        <OrganizationPeople
          apiPath={`/api/non-profits/${npoId}/people`}
          testIdPrefix="npo-shell"
          entityKind="non_profit"
          entityId={npoId}
          entityName="this non-profit"
          title="Contacts"
          voice="partner"
          blurb="People who represent you. Add as many as you need."
          canInviteSubusers={probe.data?.ok === true}
        />
      </div>
    </section>
  );
}

function labelForRole(role: string): string {
  if (role === "non_profit") return "Ambassador / staff";
  if (role === "artist") return "Artist";
  return role;
}

function InviteDialog({
  npoId, kind, onClose, onSent,
}: {
  npoId: string;
  kind: "ambassador" | "staff" | "artist";
  onClose: () => void;
  onSent: (acceptUrl: string) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/non-profit/${npoId}/invites`, {
        email: email.trim(),
        kind,
        name: name.trim() || null,
        welcomeNote: note.trim() || null,
      });
      return r.json() as Promise<{ acceptUrl: string; emailDelivered: boolean }>;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit", npoId, "tree"] });
      toast({
        title: r.emailDelivered ? "Invite sent" : "Invite created — email didn't deliver",
        description: r.emailDelivered ? "We emailed them the accept link." : "Copy the link and send it manually.",
      });
      onSent(r.acceptUrl);
    },
    onError: (e: Error) => toast({ title: "Couldn't send invite", description: e.message, variant: "destructive" }),
  });

  const title =
    kind === "ambassador" ? "Invite an ambassador"
      : kind === "staff" ? "Invite a staff member"
      : "Invite an artist";
  const blurb =
    kind === "ambassador"
      ? "Ambassadors can invite artists into your NPO's scope. They land on this dashboard and earn $1/unit credits stay with the NPO."
      : kind === "staff"
      ? "Staff can invite artists into your NPO's scope but don't take credits themselves."
      : "Send the artist an invite link. Once they accept, they show up in 'Your artists' and start earning your NPO $1 per paid unit.";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-npo-invite"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 text-slate-900"
      >
        <h3 className="text-lg font-bold mb-1">{title}</h3>
        <p className="text-xs text-slate-500 mb-4">{blurb}</p>
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-semibold">Email</label>
        <input
          type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="w-full px-3 py-2 mb-3 rounded-lg bg-slate-100 ring-1 ring-slate-200 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
          data-testid="input-invite-email"
        />
        {kind === "artist" && (
          <>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-semibold">Artist name</label>
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stage or band name (optional)"
              className="w-full px-3 py-2 mb-3 rounded-lg bg-slate-100 ring-1 ring-slate-200 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
              data-testid="input-invite-name"
            />
          </>
        )}
        {(kind === "ambassador" || kind === "staff") && (
          <>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-semibold">Name (optional)</label>
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
              className="w-full px-3 py-2 mb-3 rounded-lg bg-slate-100 ring-1 ring-slate-200 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
              data-testid="input-invite-name"
            />
          </>
        )}
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-semibold">Welcome note (optional)</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="A short note that ships in the invite email."
          className="w-full px-3 py-2 mb-4 rounded-lg bg-slate-100 ring-1 ring-slate-200 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
          data-testid="textarea-invite-note"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900" data-testid="button-cancel-invite">
            Cancel
          </button>
          <button
            type="submit"
            disabled={m.isPending || !email.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-blue)] hover:opacity-90 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white"
            data-testid="button-submit-invite"
          >
            <Send className="w-4 h-4" /> {m.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TreeTab({ npoId }: { npoId: string }) {
  const tree = useQuery<Tree>({ queryKey: ["/api/non-profit", npoId, "tree"] });
  if (tree.isLoading) {
    return <p className="py-8 text-center text-slate-400 text-sm">Loading tree…</p>;
  }
  const data = tree.data;
  if (!data) return null;
  return (
    <section data-testid="npo-tree">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Who invited whom</h2>
      <DashboardPanel className="p-5">
        <div className="flex items-center gap-3 mb-4">
          {data.npo.logoUrl ? (
            <img src={data.npo.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
              <Heart className="w-5 h-5 text-rose-500" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Non-profit</p>
            <p className="font-semibold truncate">{data.npo.name}</p>
          </div>
        </div>
        {data.team.length === 0 ? (
          <p className="text-sm text-slate-500">No teammates yet. Invite an ambassador or staff to grow the tree.</p>
        ) : (
          <ul className="space-y-3 border-l border-slate-200 pl-4">
            {data.team.map((n) => (
              <TreeTeamNodeRow key={n.id} node={n} />
            ))}
          </ul>
        )}
        {data.orphanArtists.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-200">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Other referred artists</p>
            <ul className="space-y-1">
              {data.orphanArtists.map((a) => (
                <TreeArtistRow key={a.id} artist={a} />
              ))}
            </ul>
          </div>
        )}
      </DashboardPanel>
    </section>
  );
}

function TreeTeamNodeRow({ node }: { node: TreeTeamNode }) {
  const [open, setOpen] = useState(true);
  const badge =
    node.subRole === "admin" ? { bg: "bg-slate-100 ring-1 ring-slate-200", text: "text-slate-700", label: "Admin" }
      : node.subRole === "ambassador" ? { bg: "bg-emerald-50 ring-1 ring-emerald-200", text: "text-emerald-700", label: "Ambassador" }
      : { bg: "bg-blue-50 ring-1 ring-blue-200", text: "text-blue-700", label: "Staff" };
  return (
    <li data-testid={`tree-node-${node.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left hover:text-slate-900 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        <Users className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold truncate">{node.name}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
        {node.nodeKind === "pending" && (
          <span className="text-xs uppercase tracking-wider text-amber-700">Pending</span>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {node.artists.length} artist{node.artists.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && node.artists.length > 0 && (
        <ul className="mt-2 ml-6 space-y-1 border-l border-slate-200 pl-3">
          {node.artists.map((a) => (
            <TreeArtistRow key={a.id} artist={a} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeArtistRow({ artist }: { artist: TreeArtist }) {
  return (
    <li className="flex items-center gap-2 text-xs" data-testid={`tree-artist-${artist.id}`}>
      {artist.photoUrl ? (
        <img src={artist.photoUrl} alt="" className="w-6 h-6 rounded-md object-cover bg-slate-100" />
      ) : (
        <div className="w-6 h-6 rounded-md bg-slate-100" />
      )}
      <span className="truncate">{artist.name}</span>
      <span
        className={`px-1.5 py-0.5 rounded text-xs uppercase tracking-wider font-semibold ${
          artist.status === "accepted"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
        }`}
      >
        {artist.status === "accepted" ? "Active" : "Pending"}
      </span>
      {artist.status === "accepted" && artist.personId && (
        <Link href={`/artist/${artist.personId}`} className="ml-auto text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2">
          View →
        </Link>
      )}
    </li>
  );
}

// Task #355 — At-a-glance ambassador chip on the NPO artist row.
function AmbassadorChip({ personId, canInviteAmbassadors }: { personId: string; canInviteAmbassadors: boolean }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/admin/people/${personId}/can-invite-ambassadors`, { enabled: next });
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      toast({ title: next ? "Promoted to ambassador" : "Ambassador verb removed" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });
  const on = canInviteAmbassadors;
  return (
    <button
      type="button"
      onClick={() => m.mutate(!on)}
      disabled={m.isPending}
      aria-pressed={on}
      title={on ? "Ambassador — can invite other artists. Click to revoke." : "Make ambassador — allow this artist to invite other artists."}
      className={[
        "inline-flex w-[20px] h-[20px] items-center justify-center rounded-[5px]",
        "font-mono text-xs font-bold leading-none transition-opacity",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] focus-visible:opacity-100",
        on
          ? "bg-[color:var(--brand-blue)] text-white"
          : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 opacity-0 group-hover/artist:opacity-100",
        m.isPending && "opacity-60 cursor-wait",
      ].filter(Boolean).join(" ")}
      data-testid={`chip-npo-ambassador-${personId}`}
      data-state={on ? "on" : "off"}
      aria-label={on ? "Ambassador (click to revoke)" : "Make ambassador"}
    >
      A
    </button>
  );
}

// Thin adapter onto the shared house KPI primitive (KpiCard). These are all
// point-in-time figures with no prior-period comparison, so `hideDelta`
// keeps the "vs prior" row off and the card reads as a clean headline.
function Kpi({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  const model: KpiCardModel = {
    id: kpiInfoKeyFromTestId(testId),
    label,
    value: null,
    valueText: value,
    format: "number",
    note: sub,
    hideDelta: true,
  };
  return <KpiCard model={model} testId={testId} />;
}
