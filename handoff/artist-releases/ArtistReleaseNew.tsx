// ArtistReleaseNew — the SAME Releases list page as ArtistReleasesIndex, with
// the "New Release" flow OPEN by default. The flow asks for ONE thing — a name
// (single field). A single Create action. No format/date/artwork questions.
//
// Modal close = small gray circle with a dark ×, rendered via createPortal to
// document.body. Self-contained: reuses the shell, themes, seed data, and the
// release-row/badge craft exported from ArtistReleasesIndex.tsx.
//
// Apple canon: light default (artist-facing), one filled blue pill (the modal's
// Create), quiet everything else, no emojis, real ®.

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import {
  ArtistShell,
  Breadcrumbs,
  PageHeading,
  ReleaseRow,
  ThemeToggle,
  THEMES,
  MOCK_RELEASES,
  MOCK_ARTIST_NAME,
  type Theme,
} from './ArtistReleasesIndex';

// ─── New-Release modal — name-only, one Create action, portal to body ──────
function NewReleaseModal({ t, onClose }: { t: Theme; onClose: () => void }) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-release-title"
      data-testid="modal-new-release"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
        data-testid="modal-backdrop"
      />
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{
          backgroundColor: t.card,
          border: `1px solid ${t.hairline}`,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        }}
      >
        {/* Close — small gray circle with a dark × (canon) */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: t.chipBg, color: t.ink }}
          data-testid="button-new-release-close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="new-release-title" className="text-[22px] tracking-tight" style={{ fontWeight: 600 }}>
          <span style={{ color: t.ink }}>Name your release. </span>
          <span className="font-medium" style={{ color: t.subink }}>
            Change it anytime.
          </span>
        </h2>
        <p className="text-[13.5px] leading-relaxed" style={{ color: t.subink, marginTop: 8 }}>
          Just a name to start. Add the digital album and any pressings once it exists.
        </p>

        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) onClose();
          }}
          placeholder="CALIFORNIALAND"
          className={`w-full h-11 rounded-xl px-3.5 text-[15px] ${t.placeholderClass} focus:outline-none`}
          style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.canvas, marginTop: 22 }}
          data-testid="input-release-name"
        />

        <div className="flex justify-end" style={{ marginTop: 24 }}>
          {/* The screen's one filled blue pill lives here. */}
          <button
            type="button"
            disabled={!canCreate}
            onClick={onClose}
            className="inline-flex items-center rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: t.blue }}
            data-testid="button-create-release-confirm"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Page — the list with the flow open by default ─────────────────────────
export function ArtistReleaseNew() {
  const [mode, setMode] = useState<'light' | 'dark'>('light'); // DEFAULT: light
  const t = THEMES[mode];
  const [modalOpen, setModalOpen] = useState(true); // OPEN by default

  return (
    <>
      <ArtistShell t={t}>
        <div className="flex flex-col gap-7">
          <div>
            <Breadcrumbs current="Releases" t={t} />
            <div className="flex items-end justify-between gap-4" style={{ marginTop: 12 }}>
              <PageHeading lead="Releases." rest="Your whole catalog, at a glance." t={t} testId="heading-releases" />
              {/* Quiet trigger — the modal already carries the screen's one filled pill. */}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full text-[14px] font-medium transition-colors flex-shrink-0"
                style={{ color: t.blue, padding: '9px 14px' }}
                data-testid="button-new-release"
              >
                <Plus className="w-4 h-4" />
                New Release
              </button>
            </div>
            <p className="text-[14px]" style={{ color: t.subink, marginTop: 10, maxWidth: 620, lineHeight: 1.5 }}>
              A release holds the digital album and every physical pressing beside it. The badge is read
              straight from those lanes — nothing to set by hand.
            </p>
          </div>

          <section className="flex flex-col gap-3" data-testid="list-releases">
            {MOCK_RELEASES.map((r) => (
              <ReleaseRow key={r.id} release={r} t={t} />
            ))}
          </section>

          <p className="text-[12px]" style={{ color: t.faint }}>
            {MOCK_RELEASES.length} releases · {MOCK_ARTIST_NAME}
          </p>
        </div>
      </ArtistShell>

      <ThemeToggle mode={mode} onToggle={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} />

      {modalOpen && <NewReleaseModal t={t} onClose={() => setModalOpen(false)} />}
    </>
  );
}

export default ArtistReleaseNew;
