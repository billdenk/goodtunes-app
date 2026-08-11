// PressSpecsArtDark — the Specs → Art page a press like Memphis Record
// Pressing would fill in: resolution floors (300 PPI, 1200 for bitmap art),
// bleed, safety margin, color rules, placed-image formats, accepted files,
// and template downloads — per format (Vinyl / CD / Cassette components
// differ, so the segmented control switches the component list).
//
// Shell duplicated from PressRailCatalogToggleDark (header, rail, tokens).
// Footer duplicated IDENTICALLY from the canonical press-portal footer
// (PressCatalogHellbenderDark). HARD RULE per Bill — no drift.
//
// Apple canon: exactly one filled blue pill on the page ("Save art specs"),
// quiet text buttons, status = icon + label never color-only.

import {
  Search,
  LayoutDashboard,
  Users,
  Disc3,
  UserPlus,
  Library,
  Settings as Cog,
  Gift,
  Bell,
  ChevronRight,
  Package,
  Layers,
  Award,
  AudioLines,
  Image as ImageIcon,
  Ruler,
  Palette,
  Info,
} from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Dark charcoal tokens (canon) ────────────────────────────────────
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const CANVAS = '#161617';
const RAIL = '#1c1c1e';
const CARD = '#1e1e20';
const CARD_SOFT = '#26262a';
const PILL_ACTIVE = '#3a3a3e'; // raised active pill on the charcoal track (canon)
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)';

const PARTNER_NAME = 'Memphis Record Pressing';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Rail (duplicated from PressRailCatalogToggleDark) ───────────────
type TopItem = { label: string; icon: typeof LayoutDashboard };
const NAV_ABOVE: TopItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
];
const NAV_BELOW: TopItem[] = [
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active }: TopItem & { active?: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && 'hover:bg-white/5')}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? CARD : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
      data-testid={`nav-${label.toLowerCase()}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : FAINT }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

const CATALOG_CHILDREN = [
  { label: 'GoodTunes Packages', icon: Package },
  { label: 'White Label', icon: Layers, soon: true },
  { label: 'GoodDeed Certificates', icon: Award },
  { label: 'Specs', icon: AudioLines, active: true },
];


// ─── Dummy data (handoff rule: all mock values in MOCK_ consts) ──────
const MOCK_ART_SPECS = {
  minResolution: '300',
  bitmapMin: '1200',
  bleedMin: '0.125',
  bleedRec: '0.25',
  safetyMargin: '0.25',
  colorMode: 'CMYK + PMS',
  pantone: 'Official only',
  maxSpots: '2',
  placedImages: 'CMYK or grayscale TIFF, PSD',
  acceptedFormats: 'PDF/X-4, AI, PSD (flattened)',
  fonts: 'Outlined or embedded',
};

// ─── Small form atoms ────────────────────────────────────────────────
function Field({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: SUBINK }}>
        {label}
      </span>
      <span className="flex items-center h-9 rounded-lg px-3" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
        <input className="flex-1 bg-transparent text-[13.5px] focus:outline-none" style={{ color: INK, minWidth: 0, width: '100%' }} defaultValue={value} readOnly />
        {suffix && (
          <span className="text-[12px] flex-shrink-0 pl-2" style={{ color: FAINT }}>
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function ChoiceRow({ label, options, selected }: { label: string; options: string[]; selected: string }) {
  return (
    <div>
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: SUBINK }}>
        {label}
      </span>
      <div className="inline-flex items-center p-0.5 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
        {options.map((o) => {
          const on = o === selected;
          return (
            <button
              key={o}
              type="button"
              className="h-7 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors"
              style={{ color: on ? INK : SUBINK, backgroundColor: on ? PILL_ACTIVE : undefined, boxShadow: on ? PILL_SHADOW : undefined }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpecCard({ icon: Icon, title, sub, children }: { icon: typeof Ruler; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
          <Icon className="w-4 h-4" style={{ color: SUBINK }} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>
            {title}
          </h2>
          <p className="text-[12px]" style={{ color: FAINT }}>
            {sub}
          </p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ─── The mock ────────────────────────────────────────────────────────
export default function PressSpecsArtDark() {

  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      {/* Header */}
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: 'rgba(22,22,23,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-white/15 flex items-center justify-center flex-shrink-0 p-1">
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/5" style={{ color: SUBINK }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold ring-1 ring-white/15" style={{ backgroundColor: CARD_SOFT, color: INK }}>
            BG
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Rail */}
        <aside className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] placeholder:text-white/30 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK, backgroundColor: CARD_SOFT }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: FAINT }}>
                ⌘K
              </span>
            </div>
          </div>

          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {NAV_ABOVE.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
            <button
              type="button"
              aria-expanded
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-white/5"
              style={{ fontWeight: 600, color: INK }}
            >
              <Library className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
              <span className="truncate flex-1 text-left">Catalog</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT, transform: 'rotate(90deg)' }} />
            </button>
            <div className="relative ml-[18px] pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${HAIRLINE}` }}>
              {CATALOG_CHILDREN.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.label}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] transition-colors', !item.active && 'hover:bg-white/5')}
                    style={{
                      fontWeight: item.active ? 600 : 500,
                      color: item.active ? INK : item.soon ? FAINT : SUBINK,
                      backgroundColor: item.active ? CARD : undefined,
                      boxShadow: item.active ? PILL_SHADOW : undefined,
                    }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: item.active ? INK : FAINT, opacity: item.soon ? 0.7 : 1 }} />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.soon && (
                      <span
                        className="ml-auto flex-shrink-0 px-2 h-[18px] rounded-full text-[10px] font-semibold tracking-wide flex items-center"
                        style={{ color: SUBINK, backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}
                      >
                        Soon
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
            {NAV_BELOW.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>

          {/* Canonical footer — duplicated identically, no drift */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: FAINT }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: 'invert(1) brightness(1.8)' }} />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-10 pt-12 pb-16">
            {/* Audio / Art left · Save (idle until changes) right — consistent header on both views */}
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }} role="tablist" aria-label="Spec type">
                <button type="button" role="tab" className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: SUBINK }}>
                  Audio
                </button>
                <button type="button" role="tab" aria-selected className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: INK, backgroundColor: PILL_ACTIVE, boxShadow: PILL_SHADOW }}>
                  Art
                </button>
              </div>
              <button
                type="button"
                disabled
                className="h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0"
                style={{ backgroundColor: 'transparent', color: FAINT, border: `1px solid ${HAIRLINE}`, cursor: 'default' }}
                title="Enabled once you change something"
                data-testid="button-save-art-specs"
              >Save</button>
            </div>

            <h1 className="mt-6 text-[30px] font-semibold" style={{ color: INK, letterSpacing: '-0.02em' }}>
              Specs. <span style={{ color: SUBINK }}>The numbers artists press against.</span>
            </h1>
            <p className="mt-2 text-[13.5px]" style={{ color: SUBINK }}>
              Artists see these at upload. Anything outside your numbers gets flagged before it reaches you.
            </p>

            <div className="mt-8 space-y-4">
              <SpecCard icon={ImageIcon} title="Resolution" sub="Floors, not targets — anything below gets flagged at upload.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
                  <Field label="Minimum resolution" value={MOCK_ART_SPECS.minResolution} suffix="PPI" />
                  <Field label="Bitmap / line art minimum" value={MOCK_ART_SPECS.bitmapMin} suffix="PPI" />
                </div>
              </SpecCard>

              <SpecCard icon={Ruler} title="Geometry" sub="Measured against the template uploaded with each component.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)' }}>
                  <Field label="Bleed (minimum)" value={MOCK_ART_SPECS.bleedMin} suffix="in" />
                  <Field label="Bleed (recommended)" value={MOCK_ART_SPECS.bleedRec} suffix="in" />
                  <Field label="Safety margin" value={MOCK_ART_SPECS.safetyMargin} suffix="in" />
                </div>
                <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: FAINT }}>
                  <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
                  Keep type and logos inside the safety margin — spine folds wander up to 1/16″ on press.
                </p>
              </SpecCard>

              <SpecCard icon={Palette} title="Color" sub="What your print line accepts.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
                  <ChoiceRow label="Color mode" options={['CMYK', 'CMYK + PMS', 'Grayscale']} selected={MOCK_ART_SPECS.colorMode} />
                  <ChoiceRow label="Pantone names required" options={['Official only', 'Any']} selected={MOCK_ART_SPECS.pantone} />
                  <Field label="Max spot colors" value={MOCK_ART_SPECS.maxSpots} suffix="PMS" />
                  <Field label="Placed images" value={MOCK_ART_SPECS.placedImages} />
                  <Field label="Accepted formats" value={MOCK_ART_SPECS.acceptedFormats} />
                  <Field label="Fonts" value={MOCK_ART_SPECS.fonts} />
                </div>
              </SpecCard>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
