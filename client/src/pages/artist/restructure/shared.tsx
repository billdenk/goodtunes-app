// Artist Portal Restructure — shared tokens + primitives.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026) per the handoff
// contract: presentational code character-for-character; only the mock-only
// chrome (ArtistShell / stepper / banner) is dropped and MOCK_ consts are
// swapped for real data at the page level. Theme mode reads the operator
// Light/Dark/System preference via useAdminDark() (same as
// ArtistTemplateTest).
//
// Canon: statuses are word + icon (Bill is colorblind), never color alone;
// real GoodTunes(R); "estimate" never "quote"; sentence case; ONE filled
// #319ED8 blue pill max per screen; commas in dollar amounts.

import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Check, Lock, X, Link2, FileImage, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminDark } from '@/lib/adminAppearance';
import goodtunesLogo from '@/assets/artist-portal/goodtunes-logo.png';
import shopifyLogo from '@/assets/artist-portal/shopify-logo.png';

export { goodtunesLogo, shopifyLogo };

// ═══════════════════════════════════════════════════════════════════
// TOKENS — copied verbatim from ArtistReleaseArtTab.tsx (light + charcoal dark)
// ═══════════════════════════════════════════════════════════════════
export const BLUE = '#319ED8';
export const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

export const THEMES = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    soft: '#f0f0f2',
    hoverWash: 'hover:bg-slate-200',
    hoverCard: 'hover:bg-slate-100',
    headerBg: 'rgba(255,255,255,0.72)',
    ready: '#1c8a5b',
    warn: '#c98a00',
    fail: '#c93a3a',
    passBg: '#eaf5ef',
    failBg: '#fbeeee',
    warnBg: '#fbf4e8',
    warnBorder: '#f0dfc0',
    warnInk: '#8a6100',
    passBorder: '#cfe8db',
    dropEmpty: '#fcfcfd',
    dropFill: '#fafafa',
    dashed: '#c9c9cf',
    dot: '#d0d0d5',
    logoFilter: 'none',
  },
  dark: {
    canvas: '#161618',
    rail: '#1c1c1f',
    card: '#232327',
    ink: '#f5f5f7',
    subink: '#a1a1a6',
    faint: '#6e6e73',
    hairline: '#2e2e33',
    soft: '#2a2a2f',
    hoverWash: 'hover:bg-white/5',
    hoverCard: 'hover:bg-white/10',
    headerBg: 'rgba(22,22,24,0.72)',
    ready: '#3fbf82',
    warn: '#f59e0b',
    fail: '#e5484d',
    passBg: 'rgba(63,191,130,0.12)',
    failBg: 'rgba(229,72,77,0.12)',
    warnBg: 'rgba(245,158,11,0.10)',
    warnBorder: 'rgba(245,158,11,0.28)',
    warnInk: '#f2b23e',
    passBorder: 'rgba(63,191,130,0.30)',
    dropEmpty: '#1d1d21',
    dropFill: '#202024',
    dashed: '#46464d',
    dot: '#46464d',
    logoFilter: 'invert(1) brightness(2)',
  },
};

export type Theme = (typeof THEMES)['light'];

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Theme hook — mode follows the operator Light/Dark/System preference
// (mock-only Sun/Moon toggle dropped per the handoff README).
export function useRestructureTheme(): Theme {
  const dark = useAdminDark();
  return dark ? THEMES.dark : THEMES.light;
}

// Channel — logo only, no name text. The GoodTunes dark asset becomes white
// on dark surfaces with the canon CSS inversion.
export const WHITE_GLYPH = 'invert(1) brightness(2)';

// ═══════════════════════════════════════════════════════════════════
// Shared small primitives — copied grammar from source mocks
// ═══════════════════════════════════════════════════════════════════

// Canon CTA pill — verbatim weight from PressQuoteBuilder "Send estimate" pill.
export function CanonPill({ label, onClick, icon: Icon }: { label: string; onClick?: () => void; icon?: typeof ArrowRight }) {
  return (
    <Button
      className="rounded-full px-7 gap-2"
      style={{ background: BLUE, color: '#fff', height: 44, fontSize: 14.5 }}
      onClick={onClick}
      data-testid={`cta-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </Button>
  );
}

// Word + icon status chip — copied from VerdictChip grammar (never color alone).
export type StatusWord = 'requested' | 'paid' | 'held' | 'released' | 'confirmed';
export function MilestoneStatus({ word, t }: { word: StatusWord; t: Theme }) {
  const map: Record<StatusWord, { label: string; color: string; bg: string; glyph: 'dot' | 'ring' | 'check' | 'lock' | 'arrow' }> = {
    requested: { label: 'Requested', color: t.subink, bg: t.soft, glyph: 'ring' },
    paid: { label: 'Paid by you', color: BLUE, bg: `${BLUE}14`, glyph: 'dot' },
    held: { label: 'Held', color: t.warnInk, bg: t.warnBg, glyph: 'lock' },
    released: { label: 'Released to press', color: BLUE, bg: `${BLUE}14`, glyph: 'arrow' },
    confirmed: { label: 'Confirmed', color: t.ready, bg: t.passBg, glyph: 'check' },
  };
  const s = map[word];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: s.bg, color: s.color }} data-testid={`milestone-status-${word}`}>
      {s.glyph === 'check' && <Check className="w-3 h-3" strokeWidth={3} />}
      {s.glyph === 'lock' && <Lock className="w-3 h-3" />}
      {s.glyph === 'arrow' && <ArrowRight className="w-3 h-3" strokeWidth={2.5} />}
      {s.glyph === 'dot' && <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: s.color }} />}
      {s.glyph === 'ring' && <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${s.color}` }} />}
      {s.label}
    </span>
  );
}

// ONE solid segmented pill group — copied verbatim from PressEstimatesIndex
// SegGroup (canon, reads by weight/surface not color). Used for the Art/Audio
// pair and the Master/Vinyl sub tab bar.
export function SegChip<T extends string>({ options, value, onChange, ariaLabel, testPrefix, t, size = 'sm', icons }: {
  options: Array<[T, string, string?]>;   // [id, label, optional muted detail]
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  testPrefix: string;
  t: Theme;
  size?: 'sm' | 'lg';
  icons?: Partial<Record<T, LucideIcon>>;  // optional leading icon per segment
}) {
  return (
    <div className="inline-flex items-center rounded-full flex-shrink-0" style={{ background: t.soft, padding: size === 'lg' ? 4 : 3 }} role="radiogroup" aria-label={ariaLabel} data-testid={testPrefix}>
      {options.map(([id, label, detail]) => {
        const on = value === id;
        const Icon: LucideIcon | undefined = icons?.[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className={cn('inline-flex items-center gap-1.5 rounded-full transition-colors', size === 'lg' ? 'h-10 px-5 text-[14px]' : 'h-8 px-3.5 text-[12.5px]')}
            style={{
              fontWeight: on ? 600 : 500,
              color: on ? t.ink : t.subink,
              background: on ? t.card : 'transparent',
              boxShadow: on ? PILL_SHADOW : undefined,
            }}
            data-testid={`${testPrefix}-${id.toLowerCase()}`}
          >
            {/* Understated leading icon — muted when inactive, ink when active */}
            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: on ? t.ink : t.faint }} aria-hidden />}
            {label}
            {/* Optional muted detail text inside the same pill */}
            {detail && <span style={{ fontWeight: 500, color: t.faint }}>{detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Art slot model — copied verbatim from ArtistReleaseArtTab, plus an
// inheritance chip per Part 3 (the critical primitive). ───
export type CheckRow = { label: string; value: string; verdict: 'pass' | 'fail' };
export type Inheritance =
  | { kind: 'inherited-pass'; note: string }       // Using album art — passes spec
  | { kind: 'format-specific'; note: string }       // Format-specific file
  | { kind: 'inherited-fail'; note: string };        // Album art fails spec — drop format art
export type BlockState =
  | { kind: 'pass'; file: string; checks: CheckRow[] }
  | { kind: 'fail'; file: string; checks: CheckRow[] }
  | { kind: 'empty' };
export type ArtBlock = {
  id: string;
  title: string;
  hint: string;
  shape: 'square' | 'circle' | 'tall';
  inheritance: Inheritance;
  state: BlockState;
};

export function VerdictChip({ kind, t }: { kind: 'pass' | 'fail' | 'empty'; t: Theme }) {
  if (kind === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.passBg, color: t.ready }} data-testid="chip-block-pass">
        <Check className="w-3 h-3" strokeWidth={3} /> Passed
      </span>
    );
  }
  if (kind === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.failBg, color: t.fail }} data-testid="chip-block-fail">
        <X className="w-3 h-3" strokeWidth={3} /> Needs fixes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.soft, color: t.subink }} data-testid="chip-block-waiting">
      <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${t.subink}` }} />
      Waiting for art
    </span>
  );
}

// Inheritance chip — the Part 3 primitive rendered as word + icon (never color
// alone). Reads which file is in effect for this slot.
export function InheritanceChip({ inheritance, t }: { inheritance: Inheritance; t: Theme }) {
  if (inheritance.kind === 'inherited-pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-medium" style={{ padding: '3px 9px', background: t.soft, color: t.subink }} data-testid="chip-inherit-pass">
        <Link2 className="w-3 h-3" /> {inheritance.note}
      </span>
    );
  }
  if (inheritance.kind === 'format-specific') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-medium" style={{ padding: '3px 9px', background: `${BLUE}14`, color: BLUE }} data-testid="chip-inherit-override">
        <FileImage className="w-3 h-3" /> {inheritance.note}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: t.failBg, color: t.fail }} data-testid="chip-inherit-fail">
      <X className="w-3 h-3" strokeWidth={3} /> {inheritance.note}
    </span>
  );
}

// The format word that leads every lane heading, so the chip selection and the
// heading read as one thought (Master → "Master art.").
export const FORMAT_WORD: Record<'digital' | 'master' | 'vinyl', string> = {
  master: 'Master',
  digital: 'GoodTunes\u00AE Player',
  vinyl: 'Vinyl',
};

// Channel glyph — logo only, monochrome white on the dark cover art.
export type Channel = 'goodtunes' | 'shopify' | null;
export function ChannelGlyph({ channel }: { channel: Channel }) {
  if (channel === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: '#fff', opacity: 0.55 }} data-testid="channel-none">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> No channel yet
      </span>
    );
  }
  if (channel === 'shopify') {
    return (
      <span className="inline-flex items-center" data-testid="channel-shopify" aria-label="Shopify">
        <img src={shopifyLogo} alt="Shopify" className="h-4 w-auto" style={{ filter: WHITE_GLYPH }} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" data-testid="channel-goodtunes" aria-label="GoodTunes®">
      <img src={goodtunesLogo} alt="GoodTunes®" className="h-4 w-auto" style={{ filter: WHITE_GLYPH }} />
    </span>
  );
}

// Dollar formatting — commas in every dollar amount (canon).
export function fmtDollars(cents: number): string {
  const d = Math.round(cents / 100);
  return `$${d.toLocaleString('en-US')}`;
}
