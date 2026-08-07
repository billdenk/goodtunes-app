// ArtistProjects — the "Projects" flow for the GoodTunes ARTIST portal
// (Niina Soleil), Apple-style. A single stateful click-through that starts
// from a calm empty state, names a project, lands on the project home, picks
// a physical format, and then hands off to the first-run configurator.
//
// It deliberately reuses the EXACT shell of ArtistDashboard — full-width top
// bar (Niina's photo + name, Feedback pill, notifications, user menu), the
// artist rail (with "Projects" active), and the "POWERED BY" GoodTunes footer
// — so the whole portal reads as one product. The configurator's breadcrumb
// (uppercase 11px) and two-tone StepHeading patterns are mirrored here.
//
// Apple canon: near-white canvas, white rounded-2xl cards with a hairline
// border, ink/gray two-tone headings, one blue accent (#319ED8), pill buttons,
// apple.com choice tiles (selected = 2px blue border). Circles are people,
// rounded-rects are projects. No dollar numbers anywhere in this flow.
//
// All app plumbing is stubbed (react-query → static, wouter Link → plain <a>).

import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Search,
  LayoutDashboard,
  User,
  Disc3,
  Activity,
  Users,
  Megaphone,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Store,
  BarChart3,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  X,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';

// ─── Brand tokens ────────────────────────────────────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f'; // near-black headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet card border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_SHADOW =
  '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'; // raised active pill

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Artist persona shell (identical to ArtistDashboard) ─────────────

type ArtistNavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
  active?: boolean;
};

// Mirrors the live artist portal's rail. "Projects" is active here.
const ARTIST_NAV: ArtistNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User },
  { label: 'Projects', icon: Disc3, active: true },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, count, active }: ArtistNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors',
        active ? 'hover:bg-white' : 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? BLUE : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11px] tabular-nums" style={{ color: '#a1a1a6' }}>{count}</span>
      )}
    </a>
  );
}

const ARTIST_NAME = 'Niina Soleil';
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
          className="w-8 h-8 rounded-full overflow-hidden focus:outline-none transition-shadow"
          style={{ border: `1px solid ${HAIRLINE}` }}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0" data-testid="menu-user">
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="text-[13.5px] font-semibold text-slate-900">{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] text-slate-500 truncate">{USER_EMAIL}</div>
        </div>
        <div className="py-1">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid={`menu-item-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1 border-t border-slate-200">
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
            data-testid="menu-item-sign-out"
          >
            <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ArtistShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 bg-white pl-3 pr-6"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt={ARTIST_NAME}
            className="h-9 w-9 rounded-full object-cover flex-shrink-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {ARTIST_NAME}
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
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
              <input
                className="w-full h-9 pl-8 pr-2 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {ARTIST_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: '#a1a1a6' }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-8 pt-6 pb-12">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Two-tone heading (dashboard 30px scale) ─────────────────────────

export function PageHeading({ lead, rest, testId }: { lead: string; rest: string; testId?: string }) {
  return (
    <h1
      className="font-semibold"
      style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}
      data-testid={testId}
    >
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: SUBINK }}>{rest}</span>
    </h1>
  );
}

// ─── Project glyph — a rounded-rectangle motif (project, NOT a person) ─

function ProjectGlyph() {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: '#f0f4f8' }}
      aria-hidden
    >
      <span
        className="inline-flex items-center justify-center"
        style={{ width: 34, height: 26, borderRadius: 7, border: `2px solid ${BLUE}` }}
      >
        <span style={{ width: 12, height: 2, borderRadius: 2, backgroundColor: BLUE }} />
      </span>
    </span>
  );
}

// ─── Format tiles (apple.com choice tiles) ───────────────────────────

type Format = { id: string; title: string; blurb: string };

const FORMATS: Format[] = [
  { id: '7-vinyl', title: '7" Vinyl', blurb: '7" single — fastest turn.' },
  { id: '10-vinyl', title: '10" Vinyl', blurb: '10" — EP-length record.' },
  { id: '12-vinyl', title: '12" Vinyl', blurb: 'Standard LP — full album.' },
  { id: 'cd', title: 'CD', blurb: 'Compact disc — low-cost run.' },
  { id: 'cassette', title: 'Cassette', blurb: 'Tape — short-run friendly.' },
];

const DEFAULT_FORMAT = '12-vinyl'; // Standard LP preselected

function FormatCard({
  f,
  selected,
  onSelect,
}: {
  f: Format;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`format-${f.id}`}
      className={
        selected
          ? 'group rounded-xl border-2 bg-white p-4 text-left transition-colors focus:outline-none'
          : 'group rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 focus:outline-none'
      }
      style={selected ? { borderColor: BLUE } : undefined}
    >
      <div className="text-[15px] font-bold" style={{ color: selected ? BLUE : INK }}>
        {f.title}
      </div>
      <p className="text-[12.5px] leading-relaxed" style={{ color: SUBINK, marginTop: 4 }}>
        {f.blurb}
      </p>
    </button>
  );
}

// ─── Name-your-project modal ─────────────────────────────────────────

function NameProjectModal({
  onClose,
  onCreate,
  pinned = false,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
  /** Review frames: keep the modal up — no backdrop/× dismissal. */
  pinned?: boolean;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-project-title"
      data-testid="modal-name-project"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={pinned ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        {!pinned && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
            data-testid="button-name-project-close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <h2 id="name-project-title" className="text-[22px] tracking-tight" style={{ fontWeight: 600 }}>
          <span style={{ color: INK }}>Name your project. </span>
          <span className="font-medium" style={{ color: SUBINK }}>Change it anytime.</span>
        </h2>

        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) onCreate(trimmed);
          }}
          placeholder="My amazing project"
          className="w-full h-11 rounded-xl bg-white px-3.5 text-[15px] placeholder:text-slate-300 focus:outline-none transition-shadow"
          style={{ border: `1px solid ${HAIRLINE}`, color: INK, marginTop: 24 }}
          data-testid="input-project-name"
        />
        <p className="text-[13px]" style={{ color: SUBINK, marginTop: 10 }}>
          Tip: your new album&rsquo;s name makes a great project name.
        </p>

        <div className="flex justify-end" style={{ marginTop: 24 }}>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => canCreate && onCreate(trimmed)}
            className="inline-flex items-center rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            data-testid="button-create-project-confirm"
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pick-the-format modal ───────────────────────────────────────────

function FormatModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(DEFAULT_FORMAT);
  const [top, bottom] = [FORMATS.slice(0, 3), FORMATS.slice(3)];

  const onContinue = () => {
    // Hand off to the first-time configurator — same preview app, hash routing.
    window.location.hash = '#/ArtistProjectPackageConfiguratorFirstRun';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="format-title"
      data-testid="modal-format"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl p-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
          data-testid="button-format-close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="format-title" className="text-[22px] tracking-tight" style={{ fontWeight: 600 }}>
          <span style={{ color: INK }}>Pick the physical format. </span>
          <span className="font-medium" style={{ color: SUBINK }}>Choose the pressing.</span>
        </h2>
        <p className="text-[13.5px] leading-relaxed" style={{ color: SUBINK, marginTop: 8, maxWidth: 540 }}>
          Scopes the quote flow to this format's color catalog and preview art.
          You can change it later.
        </p>

        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {top.map((f) => (
            <FormatCard key={f.id} f={f} selected={selected === f.id} onSelect={() => setSelected(f.id)} />
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {bottom.map((f) => (
            <FormatCard key={f.id} f={f} selected={selected === f.id} onSelect={() => setSelected(f.id)} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-4" style={{ marginTop: 24 }}>
          <p className="text-[12px]" style={{ color: '#a1a1a6' }}>
            You can change this later.
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-1.5 rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            data-testid="button-format-continue"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quiet empty-state card scaffold ─────────────────────────────────

function EmptyCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section
      className="rounded-2xl bg-white flex flex-col items-center text-center"
      style={{ border: `1px solid ${HAIRLINE}`, padding: '56px 32px' }}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

// ─── Page — internal state machine ───────────────────────────────────

type Screen = 'projects-empty' | 'project-home';

export function ArtistProjects({ startWithNameModal = false }: { startWithNameModal?: boolean } = {}) {
  const [screen, setScreen] = useState<Screen>('projects-empty');
  const [projectName, setProjectName] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(startWithNameModal);
  const [formatModalOpen, setFormatModalOpen] = useState(false);

  return (
    <ArtistShell>
      {screen === 'projects-empty' && (
        <div className="flex flex-col gap-6">
          <PageHeading
            lead="Projects."
            rest="Where your physical music is born."
            testId="heading-projects"
          />

          <EmptyCard testId="empty-projects">
            <ProjectGlyph />
            <h3 className="font-semibold" style={{ color: INK, fontSize: 20, marginTop: 20, letterSpacing: '-0.01em' }}>
              This is your project&rsquo;s home.
            </h3>
            <p className="text-[14.5px] leading-relaxed" style={{ color: SUBINK, marginTop: 8, maxWidth: 420 }}>
              A project holds one album and every pressing you configure for it.
              Price as many as you like — press the ones you love.
            </p>
            <button
              type="button"
              onClick={() => setNameModalOpen(true)}
              className="inline-flex items-center rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BLUE, marginTop: 24 }}
              data-testid="button-create-project"
            >
              Create your first project
            </button>
          </EmptyCard>
        </div>
      )}

      {screen === 'project-home' && (
        <div className="flex flex-col gap-6">
          {/* Breadcrumb — configurator style (uppercase 11px) */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                Projects
              </a>
              <span className="text-slate-300">›</span>
              <span className="text-slate-700">{projectName || 'Untitled project'}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <PageHeading
                lead={`${projectName}.`}
                rest="Your project home."
                testId="heading-project-home"
              />
            </div>
          </div>

          {/* Albums section — empty */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
              Albums
            </h2>
            <EmptyCard testId="empty-albums">
              <ProjectGlyph />
              <h3 className="font-semibold" style={{ color: INK, fontSize: 20, marginTop: 20, letterSpacing: '-0.01em' }}>
                Nothing pressed yet.
              </h3>
              <p className="text-[14.5px] leading-relaxed" style={{ color: SUBINK, marginTop: 8, maxWidth: 380 }}>
                This is where your records will live.
              </p>
              <button
                type="button"
                onClick={() => setFormatModalOpen(true)}
                className="inline-flex items-center rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE, marginTop: 24 }}
                data-testid="button-new-album"
              >
                Create your first physical album
              </button>
            </EmptyCard>
          </section>
        </div>
      )}

      {nameModalOpen && (
        <NameProjectModal
          pinned={startWithNameModal}
          onClose={() => setNameModalOpen(false)}
          onCreate={(name) => {
            setProjectName(name);
            setNameModalOpen(false);
            setScreen('project-home');
            // First-run continuity: go straight to the format picker —
            // never drop people out of the flow to click again.
            setFormatModalOpen(true);
          }}
        />
      )}

      {formatModalOpen && <FormatModal onClose={() => setFormatModalOpen(false)} />}
    </ArtistShell>
  );
}

export default ArtistProjects;
