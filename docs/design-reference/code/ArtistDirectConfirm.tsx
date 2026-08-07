// ArtistDirectConfirm — the beat AFTER Niina picks "GoodTunes Direct" in the
// channel chooser. There is nothing to connect, so this is a light instant
// confirmation that points her straight at the real next step: adding her
// first project. Counterpart to ArtistShopifyConnect (the Shopify branch).

import { X } from 'lucide-react';
import { ArtistFirstRun } from './ArtistFirstRun';
import goodtunesLogo from '../assets/goodtunes-logo.png';

const BLUE = '#319ED8';

function DirectConfirmModal() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-confirm-title"
      data-testid="direct-confirm-modal"
    >
      {/* Same dim+blur treatment as the other first-run modals (inline styles) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
        <button
          type="button"
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full inline-flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
          data-testid="button-direct-close"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={goodtunesLogo}
          alt="GoodTunes"
          className="w-auto mx-auto"
          style={{ height: 40, marginBottom: 24 }}
        />

        <h2
          id="direct-confirm-title"
          className="text-[22px] tracking-tight"
          style={{ fontWeight: 600 }}
        >
          <span className="text-slate-900">Welcome to </span>
          <span className="text-slate-400 font-medium">GoodTunes® Direct.</span>
        </h2>
        <p className="text-[13px] leading-relaxed text-slate-500" style={{ marginTop: 10 }}>
          You upload your artwork and music files and we do the rest.
        </p>

        <div className="flex flex-col gap-2" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="w-full h-10 rounded-full text-[13.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BLUE }}
            data-testid="button-direct-add-project"
          >
            Add my first project
          </button>
          <button
            type="button"
            className="w-full h-9 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
            data-testid="button-direct-later"
          >
            I'll look around first
          </button>
        </div>

        <p className="text-[11.5px] text-slate-400" style={{ marginTop: 20 }}>
          Changed your mind?{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2 text-slate-500 hover:text-slate-900 transition-colors"
            data-testid="button-direct-go-back"
          >
            Go back and choose again
          </button>
        </p>
      </div>
    </div>
  );
}

export function ArtistDirectConfirm() {
  return (
    <>
      <ArtistFirstRun showWelcome={false} />
      <DirectConfirmModal />
    </>
  );
}

export default ArtistDirectConfirm;
