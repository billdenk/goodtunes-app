// ArtistShopifyConnect — the step AFTER Niina picks "GoodTunes for Shopify"
// in the channel chooser: a small dialog over the same day-one dashboard
// asking for her Shopify store address. Once connected, the "Shopify" rail
// item and sales-channel row appear (see ArtistDashboard for that state).
// No existing file is modified.

import { ArrowLeft, Lock } from 'lucide-react';
import { ArtistFirstRun } from './ArtistFirstRun';
import shopifyLogo from '../assets/shopify-logo.png';

const BLUE = '#319ED8';

function ShopifyConnectModal() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopify-connect-title"
      data-testid="shopify-connect-modal"
    >
      {/* Same dim+blur treatment as the other first-run modals (inline styles) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
        {/* Back to the chooser */}
        <button
          type="button"
          className="absolute left-4 top-4 h-8 px-2 rounded-md inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          data-testid="button-shopify-back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex items-center justify-center" style={{ marginTop: 8 }}>
          <img src={shopifyLogo} alt="Shopify" className="h-8 w-auto" />
        </div>

        <h2
          id="shopify-connect-title"
          className="text-[20px] font-bold tracking-tight text-slate-900"
          style={{ marginTop: 24 }}
        >
          Connect your Shopify store
        </h2>
        <p className="text-[13px] leading-relaxed text-slate-500" style={{ marginTop: 10 }}>
          Enter your store address and we'll link it to your home base — every
          order lands here automatically.
        </p>

        {/* Store address input */}
        <div className="text-left" style={{ marginTop: 24 }}>
          <label
            htmlFor="shopify-store-url"
            className="block text-[12px] font-semibold text-slate-700"
          >
            Store address
          </label>
          <div
            className="flex items-center rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-slate-300 overflow-hidden"
            style={{ marginTop: 6 }}
          >
            <input
              id="shopify-store-url"
              className="flex-1 min-w-0 h-10 px-3 bg-transparent text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
              placeholder="niinasoleil"
              defaultValue=""
              data-testid="input-shopify-store"
            />
            <span className="h-10 flex items-center px-3 text-[13px] text-slate-400 bg-slate-100 border-l border-slate-200 flex-shrink-0">
              .myshopify.com
            </span>
          </div>
          <p className="text-[11.5px] text-slate-400" style={{ marginTop: 8 }}>
            Find it in Shopify under Settings → Domains.
          </p>
        </div>

        <div className="flex flex-col gap-2" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="w-full h-10 rounded-full text-[13.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BLUE }}
            data-testid="button-shopify-connect"
          >
            Connect store
          </button>
          <button
            type="button"
            className="w-full h-9 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
            data-testid="button-shopify-later"
          >
            I'll do this later
          </button>
        </div>

        <p className="inline-flex items-center justify-center gap-1.5 text-[11.5px] text-slate-400" style={{ marginTop: 20 }}>
          <Lock className="w-3 h-3" />
          We only read orders — we never change your store.
        </p>
      </div>
    </div>
  );
}

export function ArtistShopifyConnect() {
  return (
    <>
      <ArtistFirstRun showWelcome={false} />
      <ShopifyConnectModal />
    </>
  );
}

export default ArtistShopifyConnect;
