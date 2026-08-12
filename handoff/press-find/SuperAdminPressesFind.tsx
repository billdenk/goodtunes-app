// SuperAdminPressesFind — the SUPER ADMIN Presses page, unchanged
// from what Otis built (cards grid, All / Vinyl / GoodDeeds filters,
// Add Press), plus "Find a press" as a POPOVER, 1440×1100.
//
// Per Bill (Aug 11 2026, round 2): the Presses page itself is fine —
// don't redesign it. "Find a press" leaves the left rail and becomes an
// advanced-search POPOVER off a quiet toolbar button: spec fields
// (format / quantity / color / location / turnaround) rank the presses
// that can fulfill the run. Shown open here with ranked results.
//
// Shell matches the corrected real-app chrome: full-width top bar
// (GoodTunes logo left · bell + avatar right), rail below starting with
// ⌘K search, NO "Find a press" rail child. HARD RULE — no drift.
//
// Canon: super-admin charcoal, ONE filled blue pill on screen ("Find
// presses" inside the popover — "Add press" stays a quiet outline),
// status = icon/dot + label, never color-only.
//
// ALWAYS BOTH THEMES: dark (super-admin charcoal canon, default) +
// light. The floating theme pill is MOCK-ONLY chrome.

import { useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Disc3,
  FileText,
  Grid2x2,
  HandHeart,
  Handshake,
  LayoutGrid,
  List,
  MapPin,
  Package,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Tags,
  Users,
} from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';

const BLUE = '#319ED8';

export type FindTheme = typeof FIND_DARK;

export const FIND_DARK = {
  dark: true,
  canvas: '#161617',
  card: '#1e1e20',
  cardSoft: '#26262a',
  rail: '#1b1b1d',
  ink: '#f5f5f7',
  subink: '#98989d',
  faint: '#6e6e73',
  hairline: 'rgba(255,255,255,0.10)',
  pillActive: '#3a3a3e',
  pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
  markBg: '#0d0d0e',
  modalBg: '#1e1e20',
  modalBorder: 'rgba(255,255,255,0.12)',
  modalShadow: '0 32px 80px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)',
  backdrop: 'rgba(0,0,0,0.55)',
  logoFilter: 'invert(1) brightness(2)',
  placeholderClass: 'placeholder:text-white/30',
  hoverClass: 'hover:bg-white/5',
};

export const FIND_LIGHT: FindTheme = {
  dark: false,
  canvas: '#f5f5f7',
  card: '#ffffff',
  cardSoft: '#f0f0f2',
  rail: '#fbfbfd',
  ink: '#1d1d1f',
  subink: '#6e6e73',
  faint: '#a1a1a6',
  hairline: 'rgba(0,0,0,0.10)',
  pillActive: '#e8e8ed',
  pillShadow: '0 1px 2px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)',
  markBg: '#f0f0f2',
  modalBg: '#ffffff',
  modalBorder: 'rgba(0,0,0,0.12)',
  modalShadow: '0 32px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)',
  backdrop: 'rgba(0,0,0,0.30)',
  logoFilter: 'none',
  placeholderClass: 'placeholder:text-black/30',
  hoverClass: 'hover:bg-black/5',
};

// ─── Dummy data (handoff rule: all mock values in MOCK_ consts) ──────
const MOCK_TOPBAR = { initials: 'B' };

const MOCK_PRESSES = [
  { name: 'Good Press', sub: '—', wks: '12–16 wks' },
  { name: 'Hellbender Vinyl', sub: '5794 Butler St, Pittsburgh, PA 15201', wks: '16–18 wks' },
  { name: 'Hoover Printing', sub: 'hooverprinting.com', wks: null },
  { name: 'Memphis Record Pressing', sub: '3015 Brother Blvd, Memphis, TN 38133', wks: '12–14 wks' },
  { name: 'Physical Music Products', sub: '121 Duluth Ave, Nashville 37209', wks: null },
  { name: 'Pressing Business, Inc.', sub: 'pressingbusiness.co', wks: null },
  { name: 'Viryl Technologies', sub: '212 Norseman St, Toronto, ON, Canada', wks: '12–16 wks' },
];

const MOCK_SPEC = {
  format: '12″ LP',
  quantity: '500',
  color: 'Translucent blue',
  location: 'Tennessee, USA',
  maxWeeks: '10',
};

const MOCK_RESULTS = [
  { rank: 1, name: 'Memphis Record Pressing', where: 'Memphis, TN', weeks: '12–14 wks', price: '$4.12 / unit', note: 'Presses this color · closest to spec' },
  { rank: 2, name: 'Hellbender Vinyl', where: 'Pittsburgh, PA', weeks: '16–18 wks', price: '$3.94 / unit', note: 'Lowest price · longer turnaround' },
  { rank: 3, name: 'Viryl Technologies', where: 'Toronto, ON', weeks: '12–16 wks', price: '$4.35 / unit', note: 'Presses this color · cross-border shipping' },
];

const RAIL_TOP = [
  { name: 'Dashboard', icon: Grid2x2 },
  { name: 'People', icon: Users, count: '223' },
  { name: 'Catalog', icon: FileText, chev: true },
];

// "Find a press" removed from the rail — it lives on this page now.
const PARTNER_CHILDREN = [
  { name: 'Labels', icon: Tags, count: '8' },
  { name: 'Managers', icon: Users, count: '1' },
  { name: 'NPOs', icon: HandHeart, count: '5' },
  { name: 'Presses', icon: Package, count: '7', active: true },
  { name: 'Makers', icon: Handshake, count: '14' },
  { name: 'Resellers', icon: Tags, count: '11' },
  { name: 'Fulfillment', icon: Send, count: '2' },
  { name: 'Team accounts', icon: Users },
];

const RAIL_BOTTOM = [
  { name: 'Queues', icon: Send, chev: true },
  { name: 'Audience', icon: Users },
  { name: 'Reports', icon: BarChart3 },
  { name: 'GoodDeed®', icon: HandHeart },
  { name: 'Publishing', icon: FileText },
  { name: 'System', icon: Settings, chev: true },
];

function PressMark({ t, size = 40 }: { t: FindTheme; size?: number }) {
  return (
    <span className="rounded-xl flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, backgroundColor: t.markBg, border: `1px solid ${t.hairline}` }}>
      <Disc3 className="w-5 h-5" style={{ color: t.subink }} />
    </span>
  );
}

function SpecField({ t, label, value, optional }: { t: FindTheme; label: string; value?: string; optional?: boolean }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium mb-1.5" style={{ color: t.faint, whiteSpace: 'nowrap' }}>
        {label}
        {optional && <span style={{ color: t.faint, opacity: 0.7, fontWeight: 400 }}> · optional</span>}
      </span>
      <span className="flex items-center h-9 rounded-[10px] px-3" style={{ backgroundColor: t.cardSoft }}>
        <input className="flex-1 bg-transparent text-[13px] focus:outline-none" style={{ color: t.ink, minWidth: 0, width: '100%' }} defaultValue={value} readOnly />
      </span>
    </label>
  );
}

export function SuperAdminPressesFind() {
  const [findOpen, setFindOpen] = useState(true);
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = mode === 'dark' ? FIND_DARK : FIND_LIGHT;

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden" style={{ backgroundColor: t.canvas, color: t.ink }}>
      {/* MOCK-ONLY theme pill — remove in the real app */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        className="fixed bottom-4 right-4 z-50 h-8 px-3.5 rounded-full text-[12px] font-medium"
        style={{ backgroundColor: t.card, color: t.subink, border: `1px solid ${t.hairline}`, boxShadow: t.pillShadow }}
        data-testid="button-theme-toggle"
      >
        {mode === 'dark' ? 'View light' : 'View dark'}
      </button>

      {/* Top bar — full width: logo left, bell + avatar right */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4" style={{ backgroundColor: t.rail, borderBottom: `1px solid ${t.hairline}` }}>
        <img src={goodtunesLogo} alt="GoodTunes" className="h-6 w-auto object-contain" style={{ filter: t.logoFilter }} />
        <span className="flex items-center gap-3">
          <Bell className="w-4 h-4" style={{ color: t.subink }} />
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-semibold" style={{ backgroundColor: t.pillActive, color: t.ink, boxShadow: t.pillShadow }}>
            {MOCK_TOPBAR.initials}
          </span>
        </span>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Left rail */}
        <aside className="w-52 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="h-8 rounded-full flex items-center gap-2 px-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
              <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
              <span className="text-[12px] flex-1" style={{ color: t.faint }}>
                Search admin...
              </span>
              <span className="text-[9.5px] px-1 rounded" style={{ color: t.faint, border: `1px solid ${t.hairline}` }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-3 pb-2 overflow-hidden">
            {RAIL_TOP.map((it) => (
              <div key={it.name} className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.subink }}>
                <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span className="flex-1 truncate">{it.name}</span>
                {it.count ? <span className="text-[11px] tabular-nums" style={{ color: t.faint }}>{it.count}</span> : null}
                {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} /> : null}
              </div>
            ))}
            {/* Partners — expanded */}
            <div className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.ink, fontWeight: 600 }}>
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
              <span className="flex-1 truncate">Partners</span>
            </div>
            {PARTNER_CHILDREN.map((it) => (
              <div
                key={it.name}
                className="h-[28px] rounded-lg flex items-center gap-2.5 pl-6 pr-2.5 text-[12.5px]"
                style={{
                  color: it.active ? t.ink : t.subink,
                  backgroundColor: it.active ? t.pillActive : 'transparent',
                  fontWeight: it.active ? 600 : 400,
                }}
              >
                <it.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: it.active ? t.ink : t.faint }} />
                <span className="flex-1 truncate">{it.name}</span>
                {it.count ? <span className="text-[11px] tabular-nums" style={{ color: t.faint }}>{it.count}</span> : null}
              </div>
            ))}
            {RAIL_BOTTOM.map((it) => (
              <div key={it.name} className="h-[28px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.subink }}>
                <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span className="flex-1 truncate">{it.name}</span>
                {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} /> : null}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main — the Presses page as it exists today */}
        <main className="flex-1 min-w-0 overflow-y-auto px-10 pt-8 pb-16">
          <div style={{ maxWidth: 1080 }} className="mx-auto">
            <h1 className="text-[28px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.02em' }}>
              Presses
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: t.subink }}>
              Vinyl pressing plants and duplication houses. Invite them to bid on print runs.
            </p>

            {/* Toolbar — quick search + Advanced left; filters; Add Press right */}
            <div className="mt-5 flex items-center gap-2.5">
              <div className="relative" style={{ width: 300 }}>
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
                <input
                  className={`w-full h-8 pl-9 pr-3 rounded-full text-[12.5px] ${t.placeholderClass} focus:outline-none`}
                  style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.ink }}
                  placeholder="Search presses…"
                  readOnly
                />
              </div>
              <button
                type="button"
                onClick={() => setFindOpen((o) => !o)}
                className={`h-8 px-3 rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${t.hoverClass}`}
                style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
                data-testid="button-advanced-search"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: t.faint }} />
                Advanced
              </button>
              <div className="inline-flex items-center p-0.5 rounded-full ml-1" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
                {(['All', 'Vinyl', 'GoodDeeds'] as const).map((f) => {
                  const on = f === 'All';
                  return (
                    <span
                      key={f}
                      className="h-7 px-3.5 rounded-full text-[12.5px] font-medium inline-flex items-center"
                      style={{ color: on ? t.ink : t.subink, backgroundColor: on ? t.pillActive : undefined, boxShadow: on ? t.pillShadow : undefined }}
                    >
                      {f}
                    </span>
                  );
                })}
              </div>
              <span className="inline-flex items-center gap-2.5 ml-1">
                <LayoutGrid className="w-4 h-4" style={{ color: t.ink }} />
                <List className="w-4 h-4" style={{ color: t.faint }} />
              </span>

              <span className="flex-1" />

              {/* Advanced search — centered modal over a dimmed page */}
              {findOpen && (
                <div
                  className="fixed inset-0 z-30 flex items-center justify-center"
                  style={{ backgroundColor: t.backdrop, backdropFilter: 'blur(2px)' }}
                  onClick={() => setFindOpen(false)}
                  data-testid="backdrop-find-a-press"
                >
                  <div
                    className="rounded-[20px] p-7"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 620,
                      backgroundColor: t.modalBg,
                      border: `1px solid ${t.modalBorder}`,
                      boxShadow: t.modalShadow,
                    }}
                    data-testid="modal-find-a-press"
                  >
                    <h2 className="text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
                      Find a press. <span style={{ color: t.subink, fontWeight: 400 }}>Spec first, ranked by fit.</span>
                    </h2>

                    <div className="grid gap-x-4 gap-y-4 mt-5" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.7fr) minmax(0,1.2fr)' }}>
                      <SpecField t={t} label="Format" value={MOCK_SPEC.format} />
                      <SpecField t={t} label="Quantity" value={MOCK_SPEC.quantity} />
                      <SpecField t={t} label="Color" optional value={MOCK_SPEC.color} />
                      <SpecField t={t} label="Preferred location" optional value={MOCK_SPEC.location} />
                      <SpecField t={t} label="Max turnaround" optional value={`${MOCK_SPEC.maxWeeks} weeks`} />
                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          className="h-9 px-6 rounded-full text-[13px] font-semibold transition-opacity hover:opacity-90"
                          style={{ backgroundColor: BLUE, color: '#fff' }}
                          data-testid="button-find-presses"
                        >
                          Find presses
                        </button>
                      </div>
                    </div>

                    {/* Ranked results — hairline list, not boxes */}
                    <div className="mt-6 pt-1" style={{ borderTop: `1px solid ${t.hairline}` }}>
                      {MOCK_RESULTS.map((r, i) => (
                        <div
                          key={r.rank}
                          className="flex items-center gap-4 py-3.5"
                          style={{ borderBottom: i < MOCK_RESULTS.length - 1 ? `1px solid ${t.hairline}` : undefined }}
                          data-testid={`row-result-${r.rank}`}
                        >
                          <span className="w-4 text-[12.5px] flex-shrink-0 tabular-nums text-right" style={{ color: t.faint }}>
                            {r.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>
                              {r.name}
                              {r.rank === 1 && (
                                <span className="inline-flex items-center gap-1.5 ml-2.5 text-[11px] font-medium align-middle" style={{ color: BLUE }}>
                                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: BLUE }} />
                                  Best match
                                </span>
                              )}
                            </p>
                            <p className="text-[12px] truncate mt-0.5" style={{ color: t.faint }}>
                              {r.note}
                            </p>
                          </div>
                          <span className="text-[12.5px] flex-shrink-0 tabular-nums" style={{ color: t.subink }}>
                            {r.weeks}
                          </span>
                          <span className="text-[13px] font-semibold flex-shrink-0 tabular-nums text-right" style={{ color: t.ink, width: 84 }}>
                            {r.price}
                          </span>
                          <button type="button" className="text-[12.5px] font-medium flex-shrink-0 transition-opacity hover:opacity-80" style={{ color: BLUE }} data-testid={`button-invite-${r.rank}`}>
                            Invite to bid
                          </button>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11.5px] mt-3.5" style={{ color: t.faint }}>
                      Ranked by fit — price, color, turnaround and location.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                className={`h-8 px-3.5 rounded-full text-[12.5px] font-semibold flex-shrink-0 inline-flex items-center gap-1.5 transition-colors ${t.hoverClass}`}
                style={{ backgroundColor: 'transparent', color: t.ink, border: `1px solid ${t.hairline}` }}
                data-testid="button-add-press"
              >
                <Plus className="w-3.5 h-3.5" style={{ color: t.subink }} /> Add Press
              </button>
            </div>

            {/* Press cards — as built today */}
            <div className="grid gap-4 mt-6" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {MOCK_PRESSES.map((p) => (
                <div key={p.name} className="rounded-2xl p-4 flex items-start gap-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
                  <PressMark t={t} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>
                      {p.name}
                    </p>
                    <p className="text-[11.5px] truncate" style={{ color: t.faint }}>
                      {p.sub}
                    </p>
                    {p.wks ? (
                      <p className="text-[11.5px] mt-1.5 inline-flex items-center gap-1" style={{ color: t.subink }}>
                        <Clock className="w-3 h-3" style={{ color: t.faint }} /> {p.wks}
                      </p>
                    ) : (
                      <p className="text-[11.5px] mt-1.5 inline-flex items-center gap-1" style={{ color: t.faint }}>
                        <MapPin className="w-3 h-3" /> No turnaround listed
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SuperAdminPressesFind;
