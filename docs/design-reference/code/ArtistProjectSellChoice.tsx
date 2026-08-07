// ArtistProjectSellChoice — the FIRST decision inside "Add my first project".
// Bill merged the old three-option chooser (Direct / Shopify store / GoodTunes
// Shopify+) into TWO clean choices: "GoodTunes Direct" and "GoodTunes for
// Shopify". The chooser overlays the same day-one empty dashboard (rendered by
// ArtistFirstRun with the welcome modal suppressed) so Niina's home base stays
// visible behind the decision — exactly like ArtistDirectConfirm does.
//
// The modal leads with its question (no big welcome logo — that treatment is
// reserved for welcome-style modals), has an X to close, and reassures that
// the choice can change later. No existing file is modified.

import { useState } from 'react';
import { X } from 'lucide-react';
import { ArtistFirstRun } from './ArtistFirstRun';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import shopifyLogo from '../assets/shopify-logo.png';

type SellOption = {
  id: string;
  title: string;
  blurb: string;
  logo: string;
  logoAlt: string;
  logoHeight: number;
};

// Apple-canon hybrid (Bill): stacked full-width rows for reading order,
// with real brand marks (not generic icons) at the left of each row —
// the way Apple uses Apple Pay / carrier logos in choice tiles.
const OPTIONS: SellOption[] = [
  {
    id: 'direct',
    title: 'GoodTunes® Direct',
    blurb: 'We press it, sell it, and fulfill it. You get a quote plus a clear path to press.',
    logo: goodtunesLogo,
    logoAlt: 'GoodTunes',
    logoHeight: 34,
  },
  {
    id: 'shopify',
    title: 'GoodTunes® for Shopify',
    blurb: 'You sell on your own Shopify store. We press, run GoodDeed®, and can fulfill for you too.',
    logo: shopifyLogo,
    logoAlt: 'Shopify',
    logoHeight: 28,
  },
];

function SellChoiceModal({ onClose, onChoose }: { onClose: () => void; onChoose: (id: string) => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sell-choice-title"
      data-testid="sell-choice-modal"
    >
      {/* Same dim+blur treatment as the other first-run modals (inline styles) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl p-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
          data-testid="button-sell-close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2
          id="sell-choice-title"
          className="text-[22px] tracking-tight"
          style={{ fontWeight: 600 }}
        >
          <span className="text-slate-900">How is this album being sold? </span>
          <span className="text-slate-400 font-medium">Pick your channel.</span>
        </h2>
        <p className="text-[13.5px] leading-relaxed text-slate-500" style={{ marginTop: 8, maxWidth: 520 }}>
          Pick once. You can switch later from the Sell tab if the deal changes —
          nothing here is permanent until the run is at press.
        </p>

        <div className="flex flex-col" style={{ marginTop: 24, gap: 12 }}>
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChoose(o.id)}
              data-testid={`sell-option-${o.id}`}
              className="group w-full rounded-2xl border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              style={{ padding: '20px 24px' }}
            >
              <div className="flex items-center gap-5">
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 88 }}>
                  <img src={o.logo} alt={o.logoAlt} style={{ height: o.logoHeight, width: 'auto' }} />
                </span>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold text-slate-900 tracking-tight">{o.title}</div>
                  <p className="text-[13px] leading-relaxed text-slate-500" style={{ marginTop: 4, maxWidth: 460 }}>
                    {o.blurb}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-[12px] text-slate-400" style={{ marginTop: 20 }}>
          You can change this later from the Sell tab.
        </p>
      </div>
    </div>
  );
}

export function ArtistProjectSellChoice() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <ArtistFirstRun showWelcome={false} />
      {open && (
        <SellChoiceModal
          onClose={() => setOpen(false)}
          onChoose={(id) => {
            if (id === 'direct') {
              // Direct drops the artist straight into Projects — their
              // project's home — to name the project and pick a format.
              window.location.hash = '#/ArtistProjects';
            } else {
              setOpen(false);
            }
          }}
        />
      )}
    </>
  );
}

export default ArtistProjectSellChoice;
