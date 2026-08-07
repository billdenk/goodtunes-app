// ArtistChannelChoice — Andrew's suggestion for the artist's FIRST step:
// right after (or instead of) the welcome prompt, ask HOW they'll sell with
// two big side-by-side choice cards (pattern borrowed from the "Make on
// demand / Make now" example Bill shared):
//
//   • GoodTunes Direct        — GoodTunes logo, "sell through our store"
//   • GoodTunes for Shopify   — GoodTunes logo "for" Shopify logo
//
// The chooser overlays the same day-one empty dashboard (rendered by
// ArtistFirstRun with the welcome modal suppressed) so the artist's home
// base stays visible behind the decision. Footer reassures: "You can change
// this later." No existing file is modified.

import { X } from 'lucide-react';
import { ArtistFirstRun } from './ArtistFirstRun';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import shopifyLogo from '../assets/shopify-logo.png';

const BLUE = '#319ED8';

type ChoiceCard = {
  id: string;
  title: string;
  blurb: string;
  logos: 'goodtunes' | 'goodtunes-for-shopify';
  highlighted?: boolean;
};

const CHOICES: ChoiceCard[] = [
  {
    id: 'direct',
    title: 'GoodTunes® Direct',
    blurb: 'Sell through your GoodTunes store — we handle the storefront, checkout, and payouts for you.',
    logos: 'goodtunes',
    highlighted: true,
  },
  {
    id: 'shopify',
    title: 'GoodTunes® for Shopify',
    blurb: 'Already selling on Shopify? Connect your store and every order flows into your home base.',
    logos: 'goodtunes-for-shopify',
  },
];

function CardLogos({ kind }: { kind: ChoiceCard['logos'] }) {
  if (kind === 'goodtunes') {
    return (
      <div className="h-16 flex items-center justify-center">
        <img src={goodtunesLogo} alt="GoodTunes" className="h-10 w-auto" />
      </div>
    );
  }
  return (
    <div className="h-16 flex items-center justify-center">
      <img src={shopifyLogo} alt="Shopify" className="h-8 w-auto" />
    </div>
  );
}

function ChannelChoiceModal() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-choice-title"
      data-testid="channel-choice-modal"
    >
      {/* Same dim+blur treatment as the welcome modal (inline styles on purpose) */}
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
          data-testid="button-choice-close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2
          id="channel-choice-title"
          className="text-[20px] font-bold tracking-tight text-slate-900 text-center"
        >
          How will you sell, Niina?
        </h2>

        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`choice-${c.id}`}
              className="rounded-xl border-2 bg-white p-6 text-center transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              style={
                c.highlighted
                  ? { borderColor: BLUE, backgroundColor: 'rgba(49, 158, 216, 0.05)' }
                  : { borderColor: '#E2E8F0' }
              }
            >
              <CardLogos kind={c.logos} />
              <div className="text-[15.5px] font-bold text-slate-900" style={{ marginTop: 14 }}>
                {c.title}
              </div>
              <p className="text-[12.5px] leading-relaxed text-slate-500" style={{ marginTop: 10 }}>
                {c.blurb}
              </p>
            </button>
          ))}
        </div>

        <p className="text-[12px] text-slate-400 text-center" style={{ marginTop: 24 }}>
          You can change this later.
        </p>
      </div>
    </div>
  );
}

export function ArtistChannelChoice() {
  return (
    <>
      <ArtistFirstRun showWelcome={false} />
      <ChannelChoiceModal />
    </>
  );
}

export default ArtistChannelChoice;
