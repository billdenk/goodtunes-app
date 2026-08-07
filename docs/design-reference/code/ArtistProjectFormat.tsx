// ArtistProjectFormat — the SECOND step of "Add my first project", right after
// the sell-channel choice. Niina picks the physical format her album will take.
// Same overlay pattern as ArtistProjectSellChoice: the day-one empty dashboard
// (ArtistFirstRun with the welcome modal suppressed) stays visible behind it.
//
// The modal leads with its question, has a back arrow to the previous step and
// an X to close, and reassures the choice can change later. Five formats:
// Single LP, Double LP, 7" Vinyl, Cassette, CD (CD pre-selected in the ref).
// No existing file is modified.

import { X, ArrowLeft } from 'lucide-react';

const BLUE = '#319ED8';

import { ArtistFirstRun } from './ArtistFirstRun';

type Format = {
  id: string;
  title: string;
  blurb: string;
  selected?: boolean;
};

// Top row: the three vinyl sizes. Below: CD and Cassette. Single vs Double LP
// is no longer chosen here — that moves to the configurator.
const FORMATS: Format[] = [
  { id: '7-vinyl', title: '7" Vinyl', blurb: '7" single — fastest turn.' },
  { id: '10-vinyl', title: '10" Vinyl', blurb: '10" — EP-length record.' },
  { id: '12-vinyl', title: '12" Vinyl', blurb: 'Standard LP — full album.', selected: true },
  { id: 'cd', title: 'CD', blurb: 'Compact disc — low-cost run.' },
  { id: 'cassette', title: 'Cassette', blurb: 'Tape — short-run friendly.' },
];

function FormatCard({ f }: { f: Format }) {
  return (
    <button
      type="button"
      data-testid={`format-${f.id}`}
      className={
        f.selected
          ? 'group rounded-xl border-2 bg-white p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'
          : 'group rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'
      }
      style={f.selected ? { borderColor: BLUE } : undefined}
    >
      <div
        className="text-[15px] font-bold"
        style={{ color: f.selected ? BLUE : '#0F172A' }}
      >
        {f.title}
      </div>
      <p className="text-[12.5px] leading-relaxed text-slate-500" style={{ marginTop: 4 }}>
        {f.blurb}
      </p>
    </button>
  );
}

function FormatModal() {
  const [top, bottom] = [FORMATS.slice(0, 3), FORMATS.slice(3)];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="format-title"
      data-testid="format-modal"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl p-8">
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
          data-testid="button-format-close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors flex-shrink-0"
            data-testid="button-format-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2
            id="format-title"
            className="text-[22px] tracking-tight"
            style={{ fontWeight: 600 }}
          >
            <span className="text-slate-900">Pick the physical format. </span>
            <span className="text-slate-400 font-medium">Choose the pressing.</span>
          </h2>
        </div>
        <p className="text-[13.5px] leading-relaxed text-slate-500" style={{ marginTop: 8, marginLeft: 44, maxWidth: 520 }}>
          Scopes the Sell-tab quote flow to this format's color catalog and
          preview art. You can change it later.
        </p>

        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {top.map((f) => (
            <FormatCard key={f.id} f={f} />
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {bottom.map((f) => (
            <FormatCard key={f.id} f={f} />
          ))}
        </div>

        <p className="text-[12px] text-slate-400" style={{ marginTop: 20 }}>
          You can change this later.
        </p>
      </div>
    </div>
  );
}

export function ArtistProjectFormat() {
  return (
    <>
      <ArtistFirstRun showWelcome={false} />
      <FormatModal />
    </>
  );
}

export default ArtistProjectFormat;
