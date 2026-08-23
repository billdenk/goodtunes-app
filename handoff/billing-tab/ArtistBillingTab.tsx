// ArtistBillingTab — CALIFORNIALAND release detail, new BILLING tab (Bill's
// brief, Aug 22 2026). One "Billing" tab, two clearly separated ledgers —
// never one mixed table:
//   • "You owe" — press invoices (AP). Always present; every project has a
//     press bill. On a GoodTunes-funded project the press bill's status is
//     "Paid by GoodTunes presale" — word + icon — the moment the $0-out-of-
//     pocket promise shows up in the artist's own books.
//   • "You've earned" — presale/GoodTunes proceeds (AR). The section only
//     EXISTS when GoodTunes is in play; a press-only artist never sees an
//     empty earnings section. Same roof, separate rooms.
// Chip rule: the tab badge carries the AMOUNT DUE (attention signal), never
// earnings — earnings are good news shown big inside, top right.
// Shell copied verbatim from ArtistReleaseSalesTab (canon artist rail).

import { useState, type ReactNode } from 'react';
import {
  UserPlus,
  User,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Gift,
  Megaphone,
  ShoppingBag,
  UserCheck,
  Store,
  BarChart3,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Lock,
  ChevronDown,
  Check,
} from 'lucide-react';
import { ChevronDown as NavChevron } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const FAINT = '#a1a1a6';
const HAIRLINE = '#e6e6ea';
const CANVAS = '#f5f5f7';
const RAIL = '#f5f5f7';
const READY = '#1c8a5b';
const WARN = '#c98a00';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// SHELL (copied verbatim from ArtistReleaseDraftBuilder)
// ═══════════════════════════════════════════════════════════════════
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const NAV_TOP: NavItem[] = [{ label: 'Dashboard', icon: LayoutDashboard }];
const CATALOG_CHILDREN: { label: string; icon: typeof LayoutDashboard; active?: boolean }[] = [
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'People', icon: User },
];
const NAV_REST: NavItem[] = [
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: Gift },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active }: NavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && 'hover:bg-slate-200')}
      style={{ fontWeight: active ? 600 : 500, color: active ? INK : SUBINK, backgroundColor: active ? '#ffffff' : undefined, boxShadow: active ? PILL_SHADOW : undefined }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

function CatalogGroup() {
  return (
    <>
      <button type="button" className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-slate-200" style={{ fontWeight: 500, color: SUBINK }}>
        <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
        <span className="truncate flex-1 text-left">Catalog</span>
      </button>
      <div className="space-y-0.5">
        {CATALOG_CHILDREN.map(({ label, icon: Icon, active }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            data-testid={`nav-${label.toLowerCase()}`}
            className={`flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors ${active ? '' : 'hover:bg-slate-200'}`}
            style={{ fontWeight: active ? 600 : 500, color: active ? INK : SUBINK, backgroundColor: active ? '#ffffff' : undefined, boxShadow: active ? PILL_SHADOW : undefined }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
            <span className="truncate flex-1">{label}</span>
          </a>
        ))}
      </div>
    </>
  );
}

const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
            style={{ color: INK }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt="Niina Soleil"
            className="h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ring-black/10"
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            Niina Soleil
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-8 pr-2 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {NAV_TOP.map((item) => <NavRow key={item.label} {...item} />)}
            <CatalogGroup />
            {NAV_REST.map((item) => <NavRow key={item.label} {...item} />)}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: FAINT }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Two-tone section heading (from the donor) ───────────────────────
function SectionHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.15 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT, fontWeight: 500 }}>{rest}</span>
    </h2>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>
      {children}
    </div>
  );
}

// Ring-dot chips — word + shape, never color alone.
function RingDotChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warn' | 'ready' }) {
  const color = tone === 'warn' ? WARN : tone === 'ready' ? READY : SUBINK;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium"
      style={{ padding: '4px 10px', background: '#f0f0f2', color: INK }}
    >
      <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${color}` }} />
      {label}
    </span>
  );
}

function CheckChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium"
      style={{ padding: '4px 10px', background: '#f0f0f2', color: INK }}
    >
      <Check className="w-3 h-3 flex-shrink-0" style={{ color: READY }} strokeWidth={3} />
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RELEASE HEADER (shared across format tabs)
// ═══════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'overview', label: 'Overview' },
  { id: 'music', label: 'Music' },
  { id: 'vinyl', label: 'Vinyl' },
  { id: 'sales', label: 'Sales' },
  { id: 'billing', label: 'Billing' },
];

function ReleaseHeader({ activeTab }: { activeTab: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>
        <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors" data-testid="crumb-releases">Catalog</a>
        <span style={{ color: '#d0d0d5' }}>›</span>
        <span style={{ color: SUBINK }} data-testid="crumb-current">CALIFORNIALAND</span>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 14 }}>
        <div className="flex items-start gap-5 min-w-0">
          <div
            className="rounded-2xl overflow-hidden flex-shrink-0"
            style={{
              width: 96, height: 96,
              background: 'linear-gradient(150deg, #ff8a5c 0%, #d0468f 55%, #5b3b9e 100%)',
              boxShadow: PILL_SHADOW,
            }}
          >
            <img src={californialandCover} alt="CALIFORNIALAND cover" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: SUBINK }}>LP · NIINA SOLEIL</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-[11px] font-semibold"
                style={{ padding: '3px 9px', background: `${BLUE}14`, color: BLUE }}
                data-testid="chip-preview"
              >
                <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: BLUE }} />
                PREVIEW
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold"
                style={{ padding: '3px 9px', background: '#f0f0f2', color: SUBINK }}
                data-testid="chip-locked"
              >
                <Lock className="w-3 h-3" />
                Locked
              </span>
            </div>
            <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.03, color: INK }}>
              CALIFORNIALAND
            </h1>
            <p className="text-[13.5px]" style={{ marginTop: 8, color: SUBINK }}>
              2026 · 12 tracks
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="status-control"
          className="inline-flex items-center gap-2.5 rounded-full bg-white transition-colors hover:bg-slate-50 flex-shrink-0"
          style={{ padding: '8px 14px', border: `1px solid ${HAIRLINE}` }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>Status</span>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: INK }}>
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, border: `2px solid ${WARN}` }} />
            At press
          </span>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: FAINT }} />
        </button>
      </div>

      <div className="flex items-center gap-1" style={{ marginTop: 22, borderBottom: `1px solid ${HAIRLINE}` }}>
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`tab-${t.id}`}
              className="relative inline-flex items-center gap-2 text-[14px] transition-colors"
              style={{
                padding: '10px 14px',
                fontWeight: active ? 600 : 500,
                color: active ? INK : SUBINK,
              }}
            >
              {!active && <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: '#d0d0d5' }} />}
              {t.label}
              {active && (
                <span aria-hidden className="absolute left-0 right-0" style={{ bottom: -1, height: 2, background: BLUE, borderRadius: 2 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BILLING TAB — two ledgers under one roof
// ═══════════════════════════════════════════════════════════════════
type InvoiceStatus = 'due' | 'paid' | 'presale';

const MOCK_OWED: Array<{ id: string; name: string; note: string; amount: number; status: InvoiceStatus; due?: string }> = [
  { id: 'pressing', name: 'Pressing invoice — Memphis Record Pressing', note: '1,000 units · 12" · 140g · Ruby translucent', amount: 7080, status: 'due', due: 'Due Sep 15, 2026' },
  { id: 'setup', name: 'Setup — lacquers, plating, test pressing', note: 'One-time · invoice 071526-02-S', amount: 1295, status: 'paid' },
];

const MOCK_EARNED: Array<{ id: string; name: string; note: string; amount: number }> = [
  { id: 'presale', name: 'Presale proceeds', note: '412 preorders · GoodTunes Direct', amount: 12360 },
  { id: 'gooddeed', name: 'Signed GoodDeed® premiums', note: '88 signed certificates', amount: 2640 },
];

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Status — word + icon, never color alone (Bill is colorblind).
function InvoiceStatusPill({ status, due }: { status: InvoiceStatus; due?: string }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: '#f0f0f2', color: INK }}>
        <Check className="w-3 h-3 flex-shrink-0" style={{ color: READY }} strokeWidth={3} />
        Paid
      </span>
    );
  }
  if (status === 'presale') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: '#f0f0f2', color: INK }}>
        <Check className="w-3 h-3 flex-shrink-0" style={{ color: READY }} strokeWidth={3} />
        Paid by GoodTunes presale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: '#f0f0f2', color: INK }}>
      <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${WARN}` }} />
      {due ?? 'Due'}
    </span>
  );
}

function InvoiceRow({ name, note, amount, status, due, first, testid }: { name: string; note: string; amount: number; status: InvoiceStatus; due?: string; first?: boolean; testid: string }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap" style={{ padding: '16px 20px', borderTop: first ? 'none' : `1px solid ${HAIRLINE}` }} data-testid={testid}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold" style={{ color: INK }}>{name}</div>
        <div className="text-[12.5px]" style={{ color: SUBINK, marginTop: 3 }}>{note}</div>
        {/* Every row opens its statement — PDF, line items, payment record */}
        <a href="#" onClick={(e) => e.preventDefault()} className="inline-block text-[12.5px] font-semibold" style={{ color: BLUE, marginTop: 8 }} data-testid={`${testid}-view`}>
          View invoice &rarr;
        </a>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <InvoiceStatusPill status={status} due={due} />
        <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{money(amount)}</span>
      </div>
    </div>
  );
}

export function ArtistBillingTab() {
  // View state: which kind of project we're looking at. GoodTunes-funded is
  // the default (it shows both rooms); press-only shows how the earnings room
  // simply doesn't exist.
  const [funded, setFunded] = useState(true);

  const owed = MOCK_OWED.map((o) =>
    funded && o.id === 'pressing' ? { ...o, status: 'presale' as InvoiceStatus, due: undefined } : o,
  );
  const amountDue = owed.filter((o) => o.status === 'due').reduce((a, o) => a + o.amount, 0);
  const earnedTotal = MOCK_EARNED.reduce((a, e) => a + e.amount, 0);

  return (
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 32, paddingBottom: 96 }}>
        <ReleaseHeader activeTab="billing" />

        {/* Mock-only state switch: which project kind we're previewing */}
        <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 24 }}>
          <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>Preview</span>
          {([
            { id: true, label: 'GoodTunes-funded project' },
            { id: false, label: 'Press-only project' },
          ] as const).map((c) => {
            const active = funded === c.id;
            return (
              <button
                key={String(c.id)}
                type="button"
                onClick={() => setFunded(c.id)}
                data-testid={c.id ? 'chip-funded' : 'chip-press-only'}
                className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{ padding: '6px 14px', border: `1px solid ${active ? BLUE : HAIRLINE}`, background: active ? `${BLUE}14` : 'white', color: active ? BLUE : SUBINK }}
              >
                {active && <Check className="w-3 h-3" strokeWidth={3} />}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* ── Two ledgers, side by side (Bill, Aug 22 2026): each column is
            its own room — heading, the big number, then its ledger. "You owe"
            IS the amount-due card now (one name for one thing). The earned
            column only exists when GoodTunes is in play. ── */}
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: funded ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : 'minmax(min(100%, 420px), 640px)', gap: 28, alignItems: 'start' }}>

          {/* ── You owe (AP) — always present ── */}
          <section data-testid="col-owe">
            <SectionHeading lead="You owe." rest="Invoices from your press." />
            <div className="tracking-tight" style={{ fontSize: 34, fontWeight: 700, marginTop: 14, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="amount-due">
              {money(amountDue)}
            </div>
            <p className="text-[12.5px]" style={{ marginTop: 6, color: SUBINK, lineHeight: 1.55 }}>
              {amountDue === 0
                ? 'Nothing due right now — your presale covered the press bill.'
                : 'This is the number the Billing chip carries — what needs you.'}
            </p>
            {/* How they pay (Bill, Aug 22 2026): the ONE filled action on the
                page. Card or bank behind it — Stripe handles the rails; the
                artist just sees "Pay". Only exists when something is due. */}
            {amountDue > 0 && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  data-testid="button-pay-now"
                  className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px"
                  style={{ padding: '10px 20px', background: BLUE, boxShadow: PILL_SHADOW }}
                >
                  Pay {money(amountDue)}
                </button>
                <p className="text-[12px]" style={{ marginTop: 8, color: SUBINK }}>
                  Card or bank transfer — securely handled by Stripe.
                </p>
              </div>
            )}
            <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, marginTop: 18 }}>
              {owed.map((o, i) => (
                <InvoiceRow key={o.id} first={i === 0} name={o.name} note={o.note} amount={o.amount} status={o.status} due={o.due} testid={`invoice-${o.id}`} />
              ))}
            </div>
            {funded && (
              <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK, lineHeight: 1.55 }}>
                Your fans funded the pressing — the bill exists, and it&rsquo;s already handled.
              </p>
            )}
          </section>

          {/* ── You've earned (AR) — this room only exists when GoodTunes is in play ── */}
          {funded && (
            <section data-testid="col-earned">
              <SectionHeading lead="You&rsquo;ve earned." rest="Proceeds from your presale." />
              <div className="tracking-tight" style={{ fontSize: 34, fontWeight: 700, marginTop: 14, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="amount-earned">
                {money(earnedTotal)}
              </div>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: SUBINK, lineHeight: 1.55 }}>
                Presale proceeds and signed GoodDeed® premiums, paid out after launch.
              </p>
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, marginTop: 18 }}>
                {MOCK_EARNED.map((e, i) => (
                  <InvoiceRow key={e.id} first={i === 0} name={e.name} note={e.note} amount={e.amount} status="paid" testid={`earned-${e.id}`} />
                ))}
              </div>
              <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK, lineHeight: 1.55 }}>
                Paid out to your account after launch. Full statement lands here with the payout.
              </p>
            </section>
          )}
        </div>
      </div>
    </PressShell>
  );
}

export default ArtistBillingTab;
