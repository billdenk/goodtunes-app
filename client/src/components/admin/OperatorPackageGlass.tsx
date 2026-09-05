// OperatorPackageGlass — Ruby's ratified rule (Aug 15, re-affirmed Aug 26):
// the super-admin Package tab on a release renders the artist's EXACT
// "Design your Package. See what it earns." page — the same
// PressAlbumPackageBuilder component the artist sees — under glass, with
// admin-only chrome above it (press assignment, share-with-artist, change
// mode; release status lives in the AdminAlbum shell). Never a separate
// admin implementation: one design change always covers both sides.
//
// SellPanel remains the surface for press/label partner roles and for
// Shopify-mode albums (the slim panel + payout/addon chrome the builder
// doesn't carry).
import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PrinterAndPressPanel } from "@/components/admin/SellPanel";
import { ShareQuoteWithArtist } from "@/components/admin/ShareQuoteWithArtist";
import { PressAlbumPackageBuilder } from "@/pages/PressAlbumPackageBuilder";
import { AlbumWorkspacePanel } from "@/components/admin/AlbumWorkspacePanel";

type InvitedPress = ComponentProps<typeof PrinterAndPressPanel>["invited"];

export function OperatorPackageGlass({
  albumId,
  albumTitle,
  artistName,
  artworkUrl,
  trackCount,
  primaryArtistId,
  onChangeMode,
  changeModeDisabled = false,
  changeModeDisabledReason,
}: {
  albumId: string;
  albumTitle: string;
  artistName: string;
  artworkUrl: string | null;
  trackCount: number;
  primaryArtistId: string | null;
  onChangeMode?: () => void;
  changeModeDisabled?: boolean;
  changeModeDisabledReason?: string;
}) {
  // Same query keys the builder uses, so the caches stay shared and the
  // chrome never disagrees with the page under glass.
  const { data: invited } = useQuery<InvitedPress>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/invited-press`);
      return r.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const { data: sell } = useQuery<{ skus: { format: string }[] }>({
    queryKey: ["/api/admin/albums", albumId, "skus"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/skus`);
      return r.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  // Estimates persist as album_skus — one per configured format.
  const savedEstimateCount = new Set((sell?.skus ?? []).map((s) => s.format)).size;

  return (
    <AlbumWorkspacePanel
      className="gt-canon-package-surface"
      testId="operator-package-glass"
    >
      {/* ── Admin-only chrome — everything below it is the artist's page ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-[var(--apple-canvas)] p-3 sm:p-4">
        {/* Press assignment is display + directory info here; the actual
            assignment rides the album-level invited-press flow. */}
        <PrinterAndPressPanel
          invited={invited ?? null}
          selectedId="invited"
          onSelectId={() => {}}
          isSuperAdmin
        />
        {onChangeMode && (
          <button
            type="button"
            onClick={onChangeMode}
            disabled={changeModeDisabled}
            title={changeModeDisabled ? changeModeDisabledReason : undefined}
            data-testid="button-change-sell-mode"
            className="gt-quiet-pill shrink-0 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change mode
          </button>
        )}
      </div>
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-[var(--apple-hairline)] bg-[var(--apple-card)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--apple-ink)]">
            Share these estimates with the artist
          </div>
          <div className="text-xs text-[var(--apple-subink)]">
            {primaryArtistId
              ? savedEstimateCount > 0
                ? `Send ${artistName || "the artist"} a link — they sign in and land here with your saved estimates waiting.`
                : "Save at least one format to share it."
              : "Link this album to a primary artist to share estimates."}
          </div>
        </div>
        <ShareQuoteWithArtist
          albumId={albumId}
          albumTitle={albumTitle}
          primaryArtistId={primaryArtistId}
          artistName={artistName}
          savedQuoteCount={savedEstimateCount}
          unsavedDraftCount={0}
        />
      </div>
      {/* ── The artist's exact page, under glass ── */}
      <PressAlbumPackageBuilder
        albumId={albumId}
        albumTitle={albumTitle}
        artistName={artistName}
        artworkUrl={artworkUrl}
        trackCount={trackCount}
      />
    </AlbumWorkspacePanel>
  );
}
