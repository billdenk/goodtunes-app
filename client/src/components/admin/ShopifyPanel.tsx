// ShopifyPanel — per-album Shopify mapping UI (Task #49, step 3).
//
// Lives on the AdminAlbum "Shopify" tab (operator admin AND the embedded
// artist-portal album view). Lets the operator pick or paste a product
// from a connected Shopify store, choose a variant (or "all variants"),
// and toggle whether a printed & signed GoodDeed certificate is bundled
// into the same Shopify order — at a price floor-checked against the
// album's signed_cert min.
//
// Task #2892 — for shopify_plus albums the panel renders as a three-step
// checklist (Connect a store → Map a product → Sale URL); all steps stay
// visible, locked until ready, collapsing to a checkmark line once done.
// Every save confirms inline (Saving… → Saved) instead of via toasts.
//
// Task #2909 — mapping section redesigned: variant-level picker dialog,
// silent list rows with hover-only controls, configure/edit panel, Sale
// URL prefill from onlineStoreUrl.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatUsdCents } from "@shared/money";
import { apiRequest, queryClient, apiErrorBody } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2,
  ChevronDown,
  ExternalLink,
  Upload,
  AlertTriangle,
  RefreshCw,
  Check,
  Circle,
  X as XIcon,
  Copy,
  Image as ImageIcon,
  Loader2,
  Lock,
  Music,
  Scissors,
  Video,
  MoreHorizontal,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShopifyVariantPickerDialog,
  type PickedVariant,
} from "@/components/admin/ShopifyProductBrowser";

// Same shape as AlbumFull.songs in AdminAlbum.tsx — narrowed here to
// just the fields the readiness checklist needs.
export type ShopifyPanelSong = {
  id: string;
  title: string;
  audioUrl: string | null;
  previewStartMs?: number | null;
  previewEndMs?: number | null;
};
export type ShopifyPanelAlbum = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  priceCents?: number | null;
  // Task #2714 — Shopify+ external Sale URL (fan Buy affordances reroute to
  // the artist's own store). Threaded from AdminAlbum's album row.
  externalSaleUrl?: string | null;
  songs: ShopifyPanelSong[];
};

export type ShopifyJumpTab = "tracks" | "bonus" | "sell" | "overview";

type Mapping = {
  id: string;
  storeId: string;
  shopifyProductId: string;
  shopifyVariantId: string | null;
  shopifyProductTitle: string | null;
  // Task #2909 — variant snapshot fields cached at link time.
  shopifyVariantTitle: string | null;
  shopifyVariantPrice: string | null;
  shopifyProductUrl: string | null;
  albumId: string;
  offerSignedCert: boolean;
  offersDigitalUnlock: boolean;
  signedCertPriceCents: number | null;
  storeName: string | null;
  shopDomain: string | null;
  isSignedGooddeedAddon: boolean;
  createdAt: string | null;
};
// Resolved type kept for paste-URL path inside the picker dialog (server shape).
type Resolved = {
  storeId: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  variants: { id: string; title: string; price: string }[];
  albumId: string;
};

const dollars = (c: number | null) => (c == null ? "—" : formatUsdCents(c));
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

type PushStatus = {
  album: {
    priceCents: number | null;
    maxRedemptions: number | null;
    signedCertRetailCents: number | null;
  };
  cert: {
    plannedQuantity: number | null;
    minPriceCents: number | null;
  } | null;
  earnings: {
    plannedQuantity: number;
    wholesaleCents: number;
    retailCents: number;
    perCertCents: number;
    totalCents: number;
    rungLabel: string;
  } | null;
  stores: { id: string; shopDomain: string; storeName: string | null }[];
  push: {
    storeId: string;
    shopDomain: string | null;
    storeName: string | null;
    productId: string;
    editionVariantId: string | null;
    certVariantId: string | null;
    pushedAt: string | null;
    adminUrl: string | null;
  } | null;
};

export function ShopifyPanel({
  albumId,
  album,
  sellMode = null,
  onJumpToTab,
  readyToPush = false,
  pushBlockers = [],
  embedded = false,
}: {
  albumId: string;
  album?: ShopifyPanelAlbum;
  // Passed from AdminAlbum's album.sellMode. (The old shopify_plus-only
  // "also mint" mapping checkbox is retired — digital access is intrinsic.)
  sellMode?: "direct" | "shopify" | "shopify_plus" | null;
  onJumpToTab?: (tab: ShopifyJumpTab) => void;
  // Task #1530 — completeness gating for the push action. `readyToPush`
  // is true only when Overview + Digital read complete (masters on file);
  // `pushBlockers` name what's still outstanding for the quiet helper note.
  readyToPush?: boolean;
  pushBlockers?: string[];
  // Task #2892 — true inside the artist-portal embedded album view, where
  // operator-only pages like /admin/shopify aren't reachable. Every state
  // that would link there says what to do instead (connect/reconnect is
  // operator-side), so no state is a dead end in the portal.
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const {
    data: mappings,
    isLoading,
    isError: mappingsError,
    refetch: refetchMappings,
  } = useQuery<Mapping[]>({
    queryKey: ["/api/admin/albums", albumId, "shopify-mappings"],
  });
  const {
    data: pushStatus,
    isError: pushStatusError,
    refetch: refetchPushStatus,
  } = useQuery<PushStatus>({
    queryKey: ["/api/admin/albums", albumId, "shopify-push"],
  });
  // Task #2432 — store selector. Defaults to the store this album is already
  // associated with (its Shopify push store), or the sole connected store.
  const [pickerStoreId, setPickerStoreId] = useState<string>("");
  const [offerCert, setOfferCert] = useState(false);
  // Digital access + PDF GoodDeed are intrinsic to every mapping now — the
  // per-mapping unlock toggle was removed (there is no digital sale without
  // a GoodDeed). Minting is implied by the mapping existing.
  const isShopifyPlus = sellMode === "shopify_plus";

  // Task #2909 — three-mode panel: "list" shows mapped rows, "configure"
  // shows the new-mapping form after a variant is picked, "edit" shows the
  // edit panel for an existing mapping row.
  const [panelMode, setPanelMode] = useState<"list" | "configure" | "edit">("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configVariant, setConfigVariant] = useState<PickedVariant | null>(null);
  const [editMappingId, setEditMappingId] = useState<string | null>(null);

  // Task #2892 — visible save lifecycle. On success the configure panel
  // closes, the new row lands at the top of the list with a brief "Saved"
  // chip; on failure the form keeps what the user entered with an inline err.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSavedMappingId, setJustSavedMappingId] = useState<string | null>(null);
  useEffect(() => {
    if (!justSavedMappingId) return;
    const t = window.setTimeout(() => setJustSavedMappingId(null), 2500);
    return () => window.clearTimeout(t);
  }, [justSavedMappingId]);
  // Task #2892 — three-step checklist (shopify_plus). Completed steps
  // collapse to a checkmark line; clicking the header re-expands them.
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({});
  const toggleStep = (i: number) => setOpenSteps((s) => ({ ...s, [i]: !s[i] }));

  // Task #2714 — operator-entered "Sale URL" (shopify_plus only). When set,
  // the public Preview & Purchase page reroutes every Buy affordance to this
  // URL in a new tab instead of opening the GoodTunes Buy sheet.
  const [saleUrl, setSaleUrl] = useState<string>(album?.externalSaleUrl ?? "");
  const [saleUrlDirty, setSaleUrlDirty] = useState(false);
  useEffect(() => {
    // Re-seed only while the operator hasn't typed (sibling saves refetch the
    // shared album query — don't wipe in-progress edits).
    if (!saleUrlDirty) setSaleUrl(album?.externalSaleUrl ?? "");
  }, [album?.externalSaleUrl, saleUrlDirty]);

  // Task #2909 — load-time prefill from the first mapping's shopifyProductUrl
  // when externalSaleUrl is unset and the field hasn't been manually edited.
  useEffect(() => {
    if (saleUrlDirty) return;
    if (album?.externalSaleUrl) return; // already saved — don't overwrite
    const firstProductUrl =
      (mappings ?? []).find((m) => m.shopifyProductUrl)?.shopifyProductUrl ?? null;
    if (firstProductUrl) setSaleUrl(firstProductUrl);
    // Only runs when mappings first arrive or change — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings]);
  // Task #2892 — inline save feedback ("Saving…" on the button, a brief
  // "Saved" beside it) instead of a toast; validation and save failures show
  // inline under the input, and only on a bad entry — never as permanent text.
  const [saleUrlError, setSaleUrlError] = useState<string | null>(null);
  const [saleUrlSaved, setSaleUrlSaved] = useState(false);
  useEffect(() => {
    if (!saleUrlSaved) return;
    const t = window.setTimeout(() => setSaleUrlSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [saleUrlSaved]);
  const saveSaleUrl = useMutation({
    mutationFn: async () => {
      const trimmed = saleUrl.trim();
      const next = trimmed === "" ? null : trimmed;
      await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
        externalSaleUrl: next,
      });
      return next;
    },
    onSuccess: (next) => {
      // Write the saved value into the album cache BEFORE clearing the dirty
      // flag — the re-seed effect above fires as soon as dirty flips false,
      // and it must see the new value, not the stale pre-save album (the
      // album prop reads ["/api/albums", albumId], so invalidating only the
      // admin key left the input blank until a full page refresh).
      queryClient.setQueryData<ShopifyPanelAlbum | undefined>(
        ["/api/albums", albumId],
        (prev) => (prev ? { ...prev, externalSaleUrl: next } : prev),
      );
      setSaleUrlDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      setSaleUrlError(null);
      setSaleUrlSaved(true);
      // Keep the step expanded once the save completes it, so the
      // confirmation stays visible instead of collapsing away.
      setOpenSteps((s) => ({ ...s, 3: true }));
    },
    onError: (e: unknown) =>
      setSaleUrlError(
        apiErrorBody<{ message?: string }>(e)?.message ??
          (e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't save the Sale URL"),
      ),
  });
  const onSaveSaleUrl = () => {
    const trimmed = saleUrl.trim();
    if (trimmed && !/^https:\/\//i.test(trimmed)) {
      setSaleUrlError("Must start with https://");
      return;
    }
    setSaleUrlError(null);
    saveSaleUrl.mutate();
  };
  // Task #2724 — deliberate clear via the trash affordance (confirm-gated,
  // since clearing flips live fan Buy behavior back to GoodTunes checkout).
  const [confirmClearSaleUrl, setConfirmClearSaleUrl] = useState(false);
  const clearSaleUrl = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
        externalSaleUrl: null,
      });
    },
    onSuccess: () => {
      // Same write-through-before-undirty pattern as the save path so the
      // re-seed effect sees the cleared value instead of the stale album.
      queryClient.setQueryData<ShopifyPanelAlbum | undefined>(
        ["/api/albums", albumId],
        (prev) => (prev ? { ...prev, externalSaleUrl: null } : prev),
      );
      setSaleUrl("");
      setSaleUrlDirty(false);
      setConfirmClearSaleUrl(false);
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      toast({ title: "Shopify Sale URL removed", description: "Fans check out through GoodTunes again." });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't remove Shopify Sale URL", description: e?.message, variant: "destructive" }),
  });

  // Push-to-Shopify (Task #242) — locally-edited fields. Initialized
  // from /shopify-push so the inputs reflect the persisted album row
  // on first load, then drift independently as the operator edits.
  const [maxRedemptions, setMaxRedemptions] = useState<string>("");
  const [certRetail, setCertRetail] = useState<string>("");
  const [pushStoreId, setPushStoreId] = useState<string>("");
  const [pushConflicts, setPushConflicts] = useState<string[] | null>(null);
  useEffect(() => {
    if (!pushStatus) return;
    setMaxRedemptions(pushStatus.album.maxRedemptions != null ? String(pushStatus.album.maxRedemptions) : "");
    setCertRetail(
      pushStatus.album.signedCertRetailCents != null
        ? (pushStatus.album.signedCertRetailCents / 100).toFixed(2)
        : "",
    );
    setPushStoreId(
      pushStatus.push?.storeId ?? (pushStatus.stores.length === 1 ? pushStatus.stores[0].id : ""),
    );
  }, [pushStatus]);

  // Task #2432 — default the product-picker store the same way: the
  // album's associated push store, or the sole connected store. Only
  // fires once (won't stomp a manual selection on refetch).
  useEffect(() => {
    if (!pushStatus || pickerStoreId) return;
    const defaultStoreId =
      pushStatus.push?.storeId ?? (pushStatus.stores.length === 1 ? pushStatus.stores[0].id : "");
    if (defaultStoreId) setPickerStoreId(defaultStoreId);
  }, [pushStatus, pickerStoreId]);

  // Task #2909 — variant picked from the dialog.
  function handleVariantPicked(v: PickedVariant) {
    setConfigVariant(v);
    setPanelMode("configure");
    setOfferCert(false);
    setSaveError(null);
  }

  const savePushFields = useMutation({
    mutationFn: async () => {
      const body: any = {};
      body.maxRedemptions = maxRedemptions.trim() === "" ? null : Number(maxRedemptions);
      if (pushStatus?.cert) {
        const cents = parseDollars(certRetail);
        body.signedCertRetailCents = cents;
      }
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-push"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const push = useMutation({
    mutationFn: async (opts: { force?: boolean } = {}) => {
      // Persist edits first so the push uses the latest values.
      await savePushFields.mutateAsync();
      const body: any = { force: !!opts.force };
      if (pushStoreId) body.storeId = pushStoreId;
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-push`, body);
      return r.json();
    },
    onSuccess: (r: any) => {
      setPushConflicts(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-push"] });
      toast({ title: r.action === "updated" ? "Updated draft on Shopify" : "Pushed draft to Shopify" });
    },
    onError: async (e: any) => {
      // 409 conflict — surface the field list so the operator can
      // confirm-overwrite. The API client attaches the parsed JSON body
      // (e.g. `{ conflicts: [...] }`) as `err.body`.
      const body = apiErrorBody<{ conflicts?: unknown }>(e);
      if (body && Array.isArray(body.conflicts) && body.conflicts.length > 0) {
        setPushConflicts(body.conflicts as string[]);
        return;
      }
      toast({ title: "Push failed", description: e?.message, variant: "destructive" });
    },
  });

  // Task #2909 — create a new mapping from a picker-selected variant.
  const save = useMutation({
    mutationFn: async () => {
      if (!configVariant) throw new Error("Pick a variant first");
      // No isSignedGooddeedAddon — add-on option retired (Task #2892).
      // No offersDigitalUnlock — server forces true. No cert price — billing
      // is computed post-window.
      const body: any = {
        storeId: configVariant.storeId,
        shopifyProductId: configVariant.productId,
        shopifyVariantId: configVariant.variantId,
        shopifyProductTitle: configVariant.productTitle,
        shopifyVariantTitle: configVariant.variantTitle,
        shopifyVariantPrice: configVariant.price,
        shopifyProductUrl: configVariant.onlineStoreUrl,
        albumId,
        offerSignedCert: offerCert,
      };
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-mappings`, body);
      return r.json() as Promise<Mapping>;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-mappings"] });
      setPanelMode("list");
      setConfigVariant(null);
      setOfferCert(false);
      setSaveError(null);
      setJustSavedMappingId(row.id);
      setOpenSteps((s) => ({ ...s, 2: true }));
      // Auto-prefill Sale URL from onlineStoreUrl if the field isn't set yet.
      if (!album?.externalSaleUrl && row.shopifyProductUrl && !saleUrlDirty) {
        setSaleUrl(row.shopifyProductUrl);
        setSaleUrlDirty(true);
      }
    },
    onError: (e: unknown) =>
      setSaveError(
        apiErrorBody<{ message?: string }>(e)?.message ??
          (e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't save the mapping"),
      ),
  });

  // Edit an existing mapping (cert toggle + cert price).
  const editSave = useMutation({
    mutationFn: async () => {
      if (!editMappingId) throw new Error("No mapping selected");
      const r = await apiRequest(
        "PATCH",
        `/api/admin/albums/${albumId}/shopify-mappings/${editMappingId}`,
        { offerSignedCert: offerCert },
      );
      return r.json() as Promise<Mapping>;
    },
    onSuccess: (row) => {
      queryClient.setQueryData<Mapping[] | undefined>(
        ["/api/admin/albums", albumId, "shopify-mappings"],
        (prev) => prev?.map((x) => (x.id === row.id ? { ...x, ...row } : x)),
      );
      setPanelMode("list");
      setEditMappingId(null);
      setOfferCert(false);
      setSaveError(null);
      setJustSavedMappingId(row.id);
    },
    onError: (e: unknown) =>
      setSaveError(
        apiErrorBody<{ message?: string }>(e)?.message ??
          (e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't save changes"),
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/albums/${albumId}/shopify-mappings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-mappings"] });
      // If we were editing the row we just removed, exit edit mode.
      if (panelMode === "edit") {
        setPanelMode("list");
        setEditMappingId(null);
      }
    },
  });

  const earnings = pushStatus?.earnings ?? null;
  const liveCertCents = parseDollars(certRetail);
  const liveEarnings = earnings && liveCertCents != null
    ? {
        perCertCents: liveCertCents - earnings.wholesaleCents,
        totalCents: (liveCertCents - earnings.wholesaleCents) * earnings.plannedQuantity,
      }
    : null;

  // ── Task #2892 — checklist state + shared JSX sections ──────────────
  const stores = pushStatus?.stores ?? [];
  const hasStore = stores.length > 0;
  const mappingCount = mappings?.length ?? 0;
  const storeSummary =
    stores.map((s) => s.storeName ?? s.shopDomain).slice(0, 2).join(", ") +
    (stores.length > 2 ? ` +${stores.length - 2} more` : "");
  const pickerStore = stores.find((s) => s.id === pickerStoreId) ?? null;
  const manageStoresNode = embedded ? (
    <>Store connections are managed by your GoodTunes team.</>
  ) : (
    <>
      Manage connected stores at{" "}
      <a className="text-[var(--brand-blue)] underline underline-offset-2" href="/admin/shopify">
        /admin/shopify
      </a>
      .
    </>
  );

  // ── Task #2909 — redesigned mapping card ────────────────────────────
  // Derive the set of already-linked variant IDs so the picker can gray
  // them out. Use product-level matching for null-variant mappings.
  const linkedVariantIds = useMemo(
    () => new Set((mappings ?? []).filter((m) => m.shopifyVariantId).map((m) => m.shopifyVariantId!)),
    [mappings],
  );

  // Store handle for the "create product" escape hatch link.
  const newProductUrl = pickerStore?.shopDomain
    ? `https://admin.shopify.com/store/${pickerStore.shopDomain.replace(/\.myshopify\.com$/, "")}/products/new`
    : null;

  // Mapping card — shared between shopify_plus step 2 and the plain shopify layout.
  const mappingSection = (
    <div
      className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden"
      data-testid="section-mapping-card"
    >
      {/* Section header row */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-900">Linked products</h3>
          {mappingCount > 0 && panelMode === "list" && (
            <p className="text-[12.5px] text-slate-500">
              {mappingCount} product{mappingCount !== 1 ? "s" : ""} linked
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Multi-store selector */}
          {stores.length > 1 && panelMode === "list" && (
            <select
              value={pickerStoreId}
              onChange={(e) => setPickerStoreId(e.target.value)}
              className="h-9 border border-[#e2e8f0] rounded-md px-2 text-[13px] bg-white text-slate-700"
              data-testid="select-shopify-picker-store"
            >
              <option value="">Choose a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName ?? s.shopDomain}
                </option>
              ))}
            </select>
          )}
          {panelMode === "list" && (
            <button
              type="button"
              onClick={() => {
                if (!pickerStoreId && stores.length === 1) setPickerStoreId(stores[0].id);
                setPickerOpen(true);
              }}
              disabled={!hasStore}
              className="h-9 px-3.5 rounded-md border border-[#1f7fb8] text-[#1f7fb8] text-[13px] font-medium hover:bg-[#1f7fb8]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-[140ms]"
              data-testid="button-link-with-goodtunes"
            >
              Link with GoodTunes
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && panelMode === "list" && (
        <div className="divide-y divide-[#e2e8f0]" data-testid="shopify-mappings-loading">
          {[0, 1].map((i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-56" />
            </div>
          ))}
        </div>
      )}

      {/* Load error */}
      {!isLoading && mappingsError && panelMode === "list" && (
        <div
          className="px-5 py-4 text-[13px] text-slate-600 flex items-center justify-between gap-3 border-t border-[#e2e8f0]"
          data-testid="shopify-mappings-error"
        >
          <span>Couldn't load the mapped products for this album.</span>
          <button
            type="button"
            onClick={() => refetchMappings()}
            className="h-8 px-3 rounded-md border border-[#e2e8f0] bg-white text-[12.5px] font-medium text-slate-700 hover:bg-[#f8fafc] shrink-0 transition-colors duration-[140ms]"
            data-testid="button-retry-mappings"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !mappingsError && mappingCount === 0 && panelMode === "list" && (
        <div className="px-5 py-5 text-[13px] text-slate-500" data-testid="shopify-mappings-empty">
          No Shopify products linked to this album yet.
          {!hasStore && !embedded && (
            <span>
              {" "}Connect the {isShopifyPlus ? "customer's" : "artist's"} store at{" "}
              <a className="text-[#1f7fb8] underline underline-offset-2" href="/admin/shopify">
                /admin/shopify
              </a>{" "}
              first.
            </span>
          )}
        </div>
      )}

      {/* Mapping list rows */}
      {panelMode === "list" && !isLoading && !mappingsError && mappingCount > 0 && (
        <div className="divide-y divide-[#e2e8f0]">
          {(mappings ?? []).map((m) => (
            <MappingListRow
              key={m.id}
              m={m}
              justSaved={justSavedMappingId === m.id}
              onEdit={() => {
                setEditMappingId(m.id);
                setOfferCert(m.offerSignedCert);
                setSaveError(null);
                setPanelMode("edit");
              }}
              onRemove={() => remove.mutate(m.id)}
              removePending={remove.isPending}
            />
          ))}
        </div>
      )}

      {/* Configure panel (create mode) */}
      {panelMode === "configure" && configVariant && (
        <div className="px-5 py-5 space-y-4 border-t border-[#e2e8f0]" data-testid="panel-configure-mapping">
          {/* Chosen variant row */}
          <div className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-slate-900 font-medium">
                {configVariant.productTitle}
                {configVariant.variantTitle && configVariant.variantTitle !== "Default Title" && (
                  <span className="text-slate-400 font-normal"> — {configVariant.variantTitle}</span>
                )}
              </div>
              <div className="text-[12.5px] text-slate-500 mt-0.5">${configVariant.price}</div>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-[13px] text-[#1f7fb8] hover:underline shrink-0 font-medium"
              data-testid="button-change-variant"
            >
              Change
            </button>
          </div>

          {/* Inclusion chip */}
          <div className="flex items-start gap-2.5 rounded-lg bg-[#f8fafc] px-4 py-3" data-testid="text-shopify-included-access">
            <CheckCircle2 className="w-[15px] h-[15px] text-emerald-600 mt-0.5 shrink-0" strokeWidth={1.75} />
            <p className="text-[13px] text-slate-700 leading-snug">
              Buyers get GoodTunes digital access and a numbered GoodDeed (PDF).
            </p>
          </div>

          {/* Cert checkbox */}
          <div>
            <label className="inline-flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={offerCert}
                onChange={(e) => setOfferCert(e.target.checked)}
                className="h-4 w-4 mt-0.5 rounded border-slate-300 text-[#1f7fb8] focus:ring-[#1f7fb8]"
                data-testid="toggle-shopify-cert"
              />
              <span>
                <span className="text-[13px] text-slate-800">Also bundle a printed &amp; signed GoodDeed certificate</span>
                <p className="text-[11.5px] text-slate-400 mt-0.5 leading-snug">
                  Adds a physical, signed certificate on top of the PDF GoodDeed every buyer receives.
                </p>
              </span>
            </label>
          </div>

          {saveError && (
            <p className="text-[12px] text-rose-600" data-testid="text-mapping-save-error">
              {saveError}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setPanelMode("list"); setConfigVariant(null); setSaveError(null); }}
              className="h-9 px-3.5 rounded-md border border-[#e2e8f0] text-[13px] text-slate-700 hover:bg-[#f8fafc] transition-colors duration-[140ms]"
              data-testid="button-configure-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="h-9 px-3.5 rounded-md bg-[#1f7fb8] text-white text-[13px] font-medium hover:bg-[#1a6da0] disabled:opacity-50 transition-colors duration-[140ms]"
              data-testid="button-shopify-save-mapping"
            >
              {save.isPending ? "Saving…" : "Save mapping"}
            </button>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {panelMode === "edit" && editMappingId && (() => {
        const m = (mappings ?? []).find((x) => x.id === editMappingId);
        if (!m) return null;
        const variantLabel = m.shopifyVariantTitle && m.shopifyVariantTitle !== "Default Title"
          ? `${m.shopifyProductTitle ?? ""} — ${m.shopifyVariantTitle}`
          : (m.shopifyProductTitle ?? m.shopifyProductId);
        const linkDate = m.createdAt
          ? new Date(m.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
          : null;
        return (
          <div className="px-5 py-5 space-y-4 border-t border-[#e2e8f0]" data-testid="panel-edit-mapping">
            {/* Fixed variant row */}
            <div className="flex items-center gap-3 rounded-lg bg-[#f8fafc] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-slate-900 font-medium">{variantLabel}</div>
                <div className="text-[12px] text-slate-400 mt-0.5">
                  {m.shopifyVariantPrice && <span>${m.shopifyVariantPrice} · </span>}
                  {linkDate ? `Linked ${linkDate}` : "Linked"}
                </div>
              </div>
            </div>

            {/* Inclusion chip */}
            <div className="flex items-start gap-2.5 rounded-lg bg-[#f8fafc] px-4 py-3" data-testid="text-shopify-included-access-edit">
              <CheckCircle2 className="w-[15px] h-[15px] text-emerald-600 mt-0.5 shrink-0" strokeWidth={1.75} />
              <p className="text-[13px] text-slate-700 leading-snug">
                Buyers get GoodTunes digital access and a numbered GoodDeed (PDF).
              </p>
            </div>

            {/* Cert checkbox */}
            {!m.isSignedGooddeedAddon && (
              <div>
                <label className="inline-flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offerCert}
                    onChange={(e) => setOfferCert(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded border-slate-300 text-[#1f7fb8] focus:ring-[#1f7fb8]"
                    data-testid="toggle-shopify-cert-edit"
                  />
                  <span>
                    <span className="text-[13px] text-slate-800">Also bundle a printed &amp; signed GoodDeed certificate</span>
                    <p className="text-[11.5px] text-slate-400 mt-0.5 leading-snug">
                      Adds a physical, signed certificate on top of the PDF GoodDeed every buyer receives.
                    </p>
                  </span>
                </label>
              </div>
            )}

            {saveError && (
              <p className="text-[12px] text-rose-600" data-testid="text-edit-save-error">
                {saveError}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => remove.mutate(m.id)}
                disabled={remove.isPending}
                className="text-[13px] text-rose-600 hover:text-rose-700 disabled:opacity-50 mr-auto"
                data-testid={`button-remove-mapping-${m.id}`}
              >
                {remove.isPending ? "Removing…" : "Remove link"}
              </button>
              <button
                type="button"
                onClick={() => { setPanelMode("list"); setEditMappingId(null); setSaveError(null); }}
                className="h-9 px-3.5 rounded-md border border-[#e2e8f0] text-[13px] text-slate-700 hover:bg-[#f8fafc] transition-colors duration-[140ms]"
                data-testid="button-edit-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => editSave.mutate()}
                disabled={editSave.isPending}
                className="h-9 px-3.5 rounded-md bg-[#1f7fb8] text-white text-[13px] font-medium hover:bg-[#1a6da0] disabled:opacity-50 transition-colors duration-[140ms]"
                data-testid="button-shopify-edit-save-mapping"
              >
                {editSave.isPending ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Footer escape hatch */}
      {hasStore && newProductUrl && panelMode === "list" && (
        <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
          <a
            href={newProductUrl}
            target="_blank"
            rel="noopener"
            className="text-[12.5px] text-slate-500 hover:text-[#1f7fb8] inline-flex items-center gap-1.5 transition-colors duration-[140ms]"
            data-testid="link-create-product-in-store"
          >
            Not in Shopify yet? Create the product in your store
            <ExternalLink className="w-[13px] h-[13px]" strokeWidth={1.75} />
          </a>
        </div>
      )}

      {/* Variant picker dialog */}
      {pickerStoreId && (
        <ShopifyVariantPickerDialog
          open={pickerOpen}
          onOpenChange={(v) => {
            setPickerOpen(v);
            // If closing picker while in configure mode (user clicked Change
            // but then dismissed), keep the configure panel open.
          }}
          storeId={pickerStoreId}
          storeName={pickerStore?.storeName ?? pickerStore?.shopDomain}
          storeShopDomain={pickerStore?.shopDomain}
          albumId={albumId}
          linkedVariantIds={linkedVariantIds}
          onPick={handleVariantPicked}
        />
      )}
    </div>
  );

  // ── Task #2909 — upgraded Sale URL section ───────────────────────────
  // Prefills from the first mapping's shopifyProductUrl when externalSaleUrl
  // is empty. Shows helper text and a "Test link" button.
  const firstMappingUrl = (mappings ?? []).find((m) => m.shopifyProductUrl)?.shopifyProductUrl ?? null;
  const saleUrlSection = (
    <div data-testid="section-external-sale-url">
      {/* Helper text shown when the field was prefilled from a linked product */}
      {firstMappingUrl && !album?.externalSaleUrl ? (
        <p className="text-[12.5px] text-slate-500 mb-3 leading-snug">
          Filled in from your linked product. Edit it if the sale lives on a different page.
        </p>
      ) : (
        <p className="text-[12.5px] text-slate-500 mb-3 leading-snug">
          Buy buttons on the preview page will open this link. Leave empty to use GoodTunes checkout.
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={saleUrl}
          onChange={(e) => {
            setSaleUrl(e.target.value);
            setSaleUrlDirty(true);
            if (saleUrlError) setSaleUrlError(null);
          }}
          placeholder="https://the-artists-store.com/products/album"
          className="flex-1 h-9 rounded-md border border-[#e2e8f0] px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1f7fb8]"
          data-testid="input-external-sale-url"
        />
        <button
          type="button"
          onClick={onSaveSaleUrl}
          disabled={saveSaleUrl.isPending || !saleUrlDirty}
          className="h-9 px-4 rounded-md bg-[#1f7fb8] text-white text-[13px] font-medium hover:bg-[#1a6da0] disabled:opacity-50 transition-colors duration-[140ms]"
          data-testid="button-save-external-sale-url"
        >
          {saveSaleUrl.isPending ? "Saving…" : "Save"}
        </button>
        {/* Test link — opens the URL in a new tab */}
        {saleUrl && /^https:\/\//i.test(saleUrl) && (
          <button
            type="button"
            onClick={() => window.open(saleUrl, "_blank", "noopener")}
            className="text-[13px] text-[#1f7fb8] hover:underline shrink-0 inline-flex items-center gap-1"
            data-testid="button-test-sale-url"
          >
            <ExternalLink className="w-[13px] h-[13px]" strokeWidth={1.75} />
            Test link
          </button>
        )}
        {saleUrlSaved && !saveSaleUrl.isPending && (
          <span
            className="text-emerald-600 text-[12.5px] font-medium inline-flex items-center gap-1 shrink-0"
            data-testid="text-sale-url-saved"
          >
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {/* Task #2724 — deliberate clear */}
        {!!album?.externalSaleUrl && (
          <>
            <span className="mx-1 h-4 w-px bg-[#e2e8f0]" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setConfirmClearSaleUrl(true)}
              disabled={clearSaleUrl.isPending}
              className="w-9 h-9 shrink-0 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors duration-[140ms] disabled:opacity-50"
              aria-label="Remove the Shopify Sale URL"
              data-testid="button-clear-external-sale-url"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      {saleUrlError && (
        <p className="text-[12px] text-rose-600 mt-1.5" data-testid="text-sale-url-error">
          {saleUrlError}
        </p>
      )}
      <AlertDialog open={confirmClearSaleUrl} onOpenChange={setConfirmClearSaleUrl}>
        <AlertDialogContent data-testid="dialog-confirm-clear-sale-url">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the Shopify Sale URL?</AlertDialogTitle>
            <AlertDialogDescription>
              Fans will check out through GoodTunes again — every Buy button
              on the public preview page goes back to the GoodTunes Buy sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-sale-url">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearSaleUrl.mutate()}
              disabled={clearSaleUrl.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
              data-testid="button-confirm-clear-sale-url"
            >
              {clearSaleUrl.isPending ? "Removing…" : "Remove URL"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="py-6" data-testid="panel-shopify">
      {/* No inner max-w wrapper here (same rule as SellPanel, Task #427).
          The album page column is already centered + width-capped by the
          frame (AdminFrame in god-view, OperatorShell in the portals), and
          the tab rule spans that full column — so the cards inherit the
          page column and stay exactly as wide as the rule. */}
      <div>
        {/* Task #2892 — Shopify+ renders as a three-step checklist: all
            three steps always visible, locked until their prerequisite is
            met, collapsed to a checkmark line once complete. */}
        {isShopifyPlus && pushStatusError && (
          <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="shopify-plus-status-error">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 text-[13px] text-slate-600 leading-snug">
                Couldn't load this album's Shopify status, so the checklist can't tell which steps are ready.
              </div>
              <button
                type="button"
                onClick={() => refetchPushStatus()}
                className="h-8 px-3 rounded-md border border-slate-300 bg-white text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                data-testid="button-retry-push-status"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {isShopifyPlus && !pushStatusError && !pushStatus && (
          <div className="space-y-4" data-testid="shopify-plus-checklist-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-4 w-44" />
              </div>
            ))}
          </div>
        )}
        {isShopifyPlus && !pushStatusError && pushStatus && (
          <div className="space-y-4" data-testid="shopify-plus-checklist">
            <StepSection
              index={1}
              title="Connect a store"
              state={hasStore ? "complete" : "active"}
              summary={hasStore ? storeSummary : undefined}
              open={!!openSteps[1]}
              onToggle={() => toggleStep(1)}
              testId="step-shopify-connect"
            >
              <div className="space-y-2">
                {stores.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-[13px] text-slate-700"
                    data-testid={`step-store-${s.id}`}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-medium">{s.storeName ?? s.shopDomain}</span>
                    {s.storeName && <span className="text-slate-400 text-[12px] truncate">{s.shopDomain}</span>}
                  </div>
                ))}
                {!hasStore && (
                  <p className="text-[13px] text-slate-600 leading-snug">
                    {embedded ? (
                      "Ask your GoodTunes contact to connect the customer's Shopify store — mapping and the Sale URL unlock here as soon as it's live."
                    ) : (
                      <>
                        Connect the customer's Shopify store at{" "}
                        <a className="text-[var(--brand-blue)] underline underline-offset-2" href="/admin/shopify">
                          /admin/shopify
                        </a>{" "}
                        — mapping and the Sale URL unlock here as soon as it's live.
                      </>
                    )}
                  </p>
                )}
                {hasStore && <p className="text-[12px] text-slate-400">{manageStoresNode}</p>}
              </div>
            </StepSection>

            <StepSection
              index={2}
              title="Map a product"
              state={!hasStore ? "locked" : mappingCount > 0 ? "complete" : "active"}
              lockNote="Connect a store first."
              summary={mappingCount === 1 ? "1 product mapped" : `${mappingCount} products mapped`}
              open={!!openSteps[2]}
              onToggle={() => toggleStep(2)}
              testId="step-shopify-map"
            >
              <p className="text-[12.5px] text-slate-500 mb-3 leading-snug">
                Link each product on the customer's store to this album so its orders route to the right release.
              </p>
              {mappingSection}
            </StepSection>

            <StepSection
              index={3}
              title="Sale URL"
              state={!hasStore ? "locked" : album?.externalSaleUrl ? "complete" : "active"}
              lockNote="Connect a store first."
              summary={album?.externalSaleUrl ?? undefined}
              open={!!openSteps[3]}
              onToggle={() => toggleStep(3)}
              testId="step-shopify-sale-url"
            >
              {saleUrlSection}
            </StepSection>
          </div>
        )}
        {!isShopifyPlus && (
        <>
        <ShopifyExplainer />
        {album && (
          <ShopifyContentChecklist album={album} onJumpToTab={onJumpToTab} />
        )}
        {album && (pushStatus?.push || (mappings?.length ?? 0) > 0) && (
          <ShopifyProductSnippetCard
            album={album}
            push={pushStatus?.push ?? null}
            mappings={mappings ?? []}
          />
        )}
        {/* Push to Shopify (Task #242) — creates a DRAFT product on the
            label's connected store. Sits above the URL-pasting flow
            because this is the path most labels will take by default. */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6" data-testid="section-shopify-push">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Push to Shopify as a draft</h2>
          <p className="text-[13px] text-slate-500 mb-4 leading-snug">
            One-click create the album as a draft Shopify product on a connected store, with a “GoodTunes Edition”
            variant{pushStatus?.cert ? " plus an optional “+ Signed printed GoodDeed” variant" : ""}. We never publish
            for you — the label flips it live in Shopify when they’re ready.
          </p>

          {pushStatus && pushStatus.stores.length === 0 && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600">
              {embedded ? (
                <>No Shopify store connected. Ask your GoodTunes contact to connect the artist's store first.</>
              ) : (
                <>
                  No Shopify store connected. Install GoodTunes on a store at{" "}
                  <a className="text-[var(--brand-blue)] underline" href="/admin/shopify">/admin/shopify</a> first.
                </>
              )}
            </div>
          )}

          {pushStatus && pushStatus.stores.length > 0 && (
            <div className="space-y-3">
              {pushStatus.stores.length > 1 && (
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Store</label>
                  <select
                    value={pushStoreId}
                    onChange={(e) => setPushStoreId(e.target.value)}
                    className="w-full h-8 border border-slate-300 rounded-md px-2 text-[13px] bg-white"
                    data-testid="select-push-store"
                  >
                    <option value="">— Pick a store —</option>
                    {pushStatus.stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.storeName ?? s.shopDomain}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                    Edition price
                  </label>
                  <div className="h-8 px-2 flex items-center text-[13px] text-slate-700 bg-slate-50 rounded-md border border-slate-200">
                    {pushStatus.album.priceCents != null
                      ? formatUsdCents(pushStatus.album.priceCents)
                      : "— set bundle price on Sell tab"}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                    Edition inventory cap
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Uncapped"
                    className="w-full h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
                    data-testid="input-push-max-redemptions"
                  />
                </div>
              </div>

              {pushStatus.cert && (
                <div className="rounded-md bg-emerald-50/40 border border-emerald-200 p-3 space-y-2">
                  <div className="text-[12px] font-semibold text-slate-700">Signed-cert variant</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                        Retail (fan-facing)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[12px]">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={certRetail}
                          onChange={(e) => setCertRetail(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
                          data-testid="input-push-cert-retail"
                        />
                      </div>
                      {pushStatus.cert.minPriceCents != null && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          Min {formatUsdCents(pushStatus.cert.minPriceCents)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                        Inventory cap (planned)
                      </label>
                      <div className="h-8 px-2 flex items-center text-[13px] text-slate-700 bg-white rounded-md border border-slate-200">
                        {pushStatus.cert.plannedQuantity != null ? `${pushStatus.cert.plannedQuantity} units` : "—"}
                      </div>
                    </div>
                  </div>
                  {earnings && (
                    <div className="text-[12px] text-slate-600 leading-snug pt-1" data-testid="text-push-earnings">
                      <span className="font-semibold text-slate-800">Earnings preview</span> · GoodTunes bills{" "}
                      <span className="font-semibold">{formatUsdCents(earnings.wholesaleCents)}</span>/cert at the{" "}
                      {earnings.rungLabel} rung. At {dollars(liveCertCents)} retail you keep{" "}
                      <span className="font-semibold text-emerald-700">{dollars(liveEarnings?.perCertCents ?? null)}</span>{" "}
                      per cert · <span className="font-semibold">{dollars(liveEarnings?.totalCents ?? null)}</span> total
                      across {earnings.plannedQuantity} units.
                    </div>
                  )}
                </div>
              )}

              {pushConflicts && pushConflicts.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3" data-testid="push-conflict-banner">
                  <div className="flex items-start gap-2 text-[12.5px] text-amber-900">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">The label edited this product on Shopify.</div>
                      <div className="mt-1">Re-pushing will overwrite: {pushConflicts.join(", ")}.</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => push.mutate({ force: true })}
                          disabled={push.isPending}
                          className="h-7 px-2.5 rounded-md bg-amber-700 text-white text-[12px] font-medium hover:bg-amber-800 disabled:opacity-50"
                          data-testid="button-push-confirm-overwrite"
                        >
                          {push.isPending ? "Overwriting…" : "Overwrite anyway"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPushConflicts(null)}
                          className="h-7 px-2.5 rounded-md bg-white border border-amber-300 text-amber-900 text-[12px] font-medium hover:bg-amber-50"
                          data-testid="button-push-cancel-overwrite"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                {pushStatus.push ? (
                  <a
                    href={pushStatus.push.adminUrl ?? "#"}
                    target="_blank"
                    rel="noopener"
                    className="text-[12px] text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
                    data-testid="link-push-shopify-admin"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Draft on {pushStatus.push.storeName ?? pushStatus.push.shopDomain ?? "Shopify"}
                    {pushStatus.push.pushedAt && (
                      <span className="text-slate-400 ml-1">
                        · pushed {new Date(pushStatus.push.pushedAt).toLocaleString()}
                      </span>
                    )}
                  </a>
                ) : (
                  <div className="text-[12px] text-slate-400">Not pushed yet.</div>
                )}
                <button
                  type="button"
                  onClick={() => push.mutate({})}
                  disabled={push.isPending || !readyToPush || pushStatus.album.priceCents == null || (pushStatus.stores.length > 1 && !pushStoreId)}
                  title={
                    readyToPush
                      ? undefined
                      : "Finish Overview + Digital (masters on file) before pushing."
                  }
                  className="h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-medium hover:bg-[var(--brand-blue-hover)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  data-testid="button-push-to-shopify"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {push.isPending ? "Pushing…" : pushStatus.push ? "Re-push as draft" : "Push as draft"}
                </button>
              </div>
              {!readyToPush && pushBlockers.length > 0 && (
                <ul
                  className="mt-3 space-y-1 border-t border-slate-100 pt-3"
                  data-testid="push-blockers"
                >
                  {pushBlockers.map((b, i) => (
                    <li
                      key={i}
                      className="text-[12px] text-slate-500 flex items-center gap-1.5"
                    >
                      <span className="inline-block h-[5px] w-[5px] rounded-full bg-slate-300" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Sales mirror (Task #243) — read-only retail + units sold per
            pushed variant. Renders only when the album has actually been
            pushed (edition + optional cert variant ids on the row).
            Refresh pulls live retail past the 60s server cache. */}
        <ShopifySalesPanel albumId={albumId} />

        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Sell this album on Shopify</h2>
        <p className="text-[13px] text-slate-500 mb-4 leading-snug">
          Paste a Shopify product URL from a connected store and we'll bundle GoodTunes digital access into every paid
          order on that product. {manageStoresNode}
        </p>
        {mappingSection}
        </>
        )}

      </div>
    </div>
  );
}

// ── StepSection (Task #2892) ─────────────────────────────────────────
// One step card of the Shopify+ checklist. Three states:
//   locked   — grayed, not interactive, one line saying what unlocks it;
//              content never renders.
//   active   — numbered badge, content always expanded (this is the step
//              the operator should do next).
//   complete — checkmark badge + summary line, collapsed by default;
//              clicking the header expands/collapses the content.
// Steps never appear/disappear — only their state changes, so the page
// layout stays stable.
function StepSection({
  index,
  title,
  state,
  lockNote,
  summary,
  open,
  onToggle,
  children,
  testId,
}: {
  index: number;
  title: string;
  state: "locked" | "active" | "complete";
  lockNote?: string;
  summary?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  testId: string;
}) {
  const expanded = state === "active" || (state === "complete" && !!open);
  const interactive = state === "complete";
  return (
    <div
      className={[
        "rounded-lg border border-slate-200",
        state === "locked" ? "bg-slate-50/60" : "bg-white",
      ].join(" ")}
      data-testid={testId}
      data-state={state}
    >
      <div
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? expanded : undefined}
        onClick={interactive ? onToggle : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle?.();
                }
              }
            : undefined
        }
        className={[
          "px-4 py-3 flex items-center gap-3 rounded-lg",
          interactive ? "cursor-pointer select-none hover:bg-slate-50" : "",
        ].join(" ")}
        data-testid={`${testId}-header`}
      >
        {state === "complete" ? (
          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </span>
        ) : state === "locked" ? (
          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
            <Lock className="w-3 h-3" />
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[12px] font-semibold shrink-0">
            {index}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={[
              "text-[14px] font-semibold",
              state === "locked" ? "text-slate-400" : "text-slate-900",
            ].join(" ")}
          >
            {title}
          </div>
          {state === "locked" && lockNote && (
            <div className="text-[12.5px] text-slate-400" data-testid={`${testId}-lock-note`}>
              {lockNote}
            </div>
          )}
          {state === "complete" && summary && (
            <div className="text-[12.5px] text-slate-500 truncate" data-testid={`${testId}-summary`}>
              {summary}
            </div>
          )}
        </div>
        {interactive && (
          <ChevronDown
            className={[
              "w-4 h-4 text-slate-400 transition-transform shrink-0",
              expanded ? "rotate-180" : "",
            ].join(" ")}
          />
        )}
      </div>
      {expanded && children != null && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100">{children}</div>
      )}
    </div>
  );
}

// ── MappingListRow (Task #2909) ──────────────────────────────────────
// Silent at rest — shows variant title, price, variant GID in mono, and
// status badge. On hover: #f8fafc wash + borderless "Edit" + ⋯ menu.
// Deleted-variant detection is not yet live; the amber row is wired but
// never triggered (future follow-up).
function MappingListRow({
  m,
  justSaved,
  onEdit,
  onRemove,
  removePending,
}: {
  m: Mapping;
  justSaved: boolean;
  onEdit: () => void;
  onRemove: () => void;
  removePending: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const variantLabel =
    m.shopifyVariantTitle && m.shopifyVariantTitle !== "Default Title"
      ? `${m.shopifyProductTitle ?? ""} — ${m.shopifyVariantTitle}`
      : (m.shopifyProductTitle ?? m.shopifyProductId);

  const price = m.shopifyVariantPrice ? `$${m.shopifyVariantPrice}` : null;
  const gid = m.shopifyVariantId ?? null;
  const shortGid = gid ? gid.replace(/^gid:\/\/shopify\/ProductVariant\//, "") : null;

  const isSigned = m.offerSignedCert || m.isSignedGooddeedAddon;

  return (
    <div
      className="relative px-5 py-3.5 flex items-center gap-3"
      style={{
        backgroundColor: hovered ? "#f8fafc" : undefined,
        transition: "background-color 140ms",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      data-testid={`row-shopify-mapping-${m.id}`}
    >
      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium text-slate-900 truncate">{variantLabel}</span>
          {price && <span className="text-[13px] text-slate-500 shrink-0">{price}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {shortGid && (
            <span className="font-mono text-[11.5px] text-[#94a3b8]">{shortGid}</span>
          )}
          {/* Status badge */}
          {isSigned ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#1f7fb8]/10 text-[#1f7fb8]">
              + Signed GoodDeed
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
              Digital + PDF GoodDeed
            </span>
          )}
          {justSaved && (
            <span
              className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              data-testid={`chip-mapping-saved-${m.id}`}
            >
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Hover-only controls */}
      <div
        className="flex items-center gap-1 shrink-0"
        style={{
          opacity: hovered || menuOpen ? 1 : 0,
          transition: "opacity 140ms",
          pointerEvents: hovered || menuOpen ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          className="h-8 px-3 text-[13px] text-slate-600 hover:text-slate-900 rounded transition-colors duration-[140ms]"
          data-testid={`button-edit-mapping-${m.id}`}
        >
          Edit
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 transition-colors duration-[140ms]"
            data-testid={`button-menu-mapping-${m.id}`}
            aria-label="More options"
          >
            <MoreHorizontal className="w-[15px] h-[15px]" strokeWidth={1.75} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-[#e2e8f0] bg-white shadow-[0_12px_32px_rgba(15,23,42,.10)] py-1 z-50">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="w-full px-4 py-2 text-left text-[13px] text-slate-700 hover:bg-[#f8fafc] transition-colors duration-[140ms]"
                data-testid={`menu-item-edit-mapping-${m.id}`}
              >
                Edit mapping
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onRemove(); }}
                disabled={removePending}
                className="w-full px-4 py-2 text-left text-[13px] text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors duration-[140ms]"
                data-testid={`menu-item-remove-mapping-${m.id}`}
              >
                Remove link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ShopifySalesPanel (Task #243) ────────────────────────────────────
// Per-variant read-only mirror of "what is this priced at on Shopify,
// and how many have sold?". Backed by GET /api/admin/albums/:id/
// shopify-sales which returns one row per pushed variant (edition +
// optional cert). Hidden entirely when the album has not been pushed
// to Shopify yet — the existing empty state on the panel above
// continues to cover the "not mapped" case.
type SalesVariant = {
  kind: "edition" | "cert";
  label: string;
  variantId: string;
  retail: { priceCents: number | null; currency: string | null; removed: boolean } | null;
  unitsSold: number;
};
type SalesResponse = {
  mapped: boolean;
  storeName?: string;
  fetchedAt?: string;
  variants: SalesVariant[];
};

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ShopifySalesPanel({ albumId }: { albumId: string }) {
  const queryKey = ["/api/admin/albums", albumId, "shopify-sales"] as const;
  const { data, isLoading, isFetching, refetch } = useQuery<SalesResponse>({ queryKey });

  // Tick once a second so the "Updated 12s ago" line stays current
  // without re-fetching anything. Cheap state update.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  const refresh = async () => {
    // Bypass the server's 60s cache and pull fresh from Shopify.
    await queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/admin/albums/${albumId}/shopify-sales?refresh=1`);
        return r.json();
      },
    });
    refetch();
  };

  if (isLoading || !data) return null;
  if (!data.mapped || data.variants.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 mb-6"
      data-testid="section-shopify-sales"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Live on Shopify</h2>
          <p className="text-xs text-slate-500 leading-snug">
            Retail price and units sold to date{data.storeName ? ` on ${data.storeName}` : ""}, mirrored from Shopify.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isFetching}
          className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-xs text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
          data-testid="button-shopify-sales-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh from Shopify"}
        </button>
      </div>

      <div className={`grid gap-3 ${data.variants.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {data.variants.map((v) => {
          const removed = v.retail?.removed === true;
          const price = v.retail?.priceCents ?? null;
          return (
            <div
              key={v.variantId}
              className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
              data-testid={`shopify-sales-variant-${v.kind}`}
            >
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                {v.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                    Retail
                  </div>
                  <div
                    className={`text-sm font-semibold ${removed ? "text-rose-600" : "text-slate-900"}`}
                    data-testid={`text-sales-retail-${v.kind}`}
                  >
                    {removed
                      ? "Removed in Shopify"
                      : price != null
                        ? formatUsdCents(price)
                        : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                    Units sold
                  </div>
                  <div
                    className="text-sm font-semibold text-slate-900"
                    data-testid={`text-sales-units-${v.kind}`}
                  >
                    {v.unitsSold.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data.fetchedAt && (
        <div className="text-xs text-slate-400 mt-3" data-testid="text-shopify-sales-stamp">
          Updated {formatRelative(data.fetchedAt, now)}
        </div>
      )}
    </div>
  );
}

// ── ShopifyExplainer (Task #540) ─────────────────────────────────────
// First-visit "How this works" panel a label sees on the Shopify tab.
// Dismissible per-user via localStorage. Stays plain-English on purpose:
// Bill's one-sentence test is "you give us your Shopify product link,
// we match it to your tracks + art + bonus content on our side, and
// we hand you a snippet to paste into the Shopify product page so the
// fan gets the digital + signed GoodDeed at purchase."
const EXPLAINER_KEY = "gt:shopify:explainer:dismissed";
function ShopifyExplainer() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXPLAINER_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <div
      className="rounded-lg border border-[var(--brand-blue)]/30 bg-[var(--brand-blue)]/5 p-4 mb-6 relative"
      data-testid="shopify-explainer"
    >
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(EXPLAINER_KEY, "1");
          } catch {
            /* private mode — soft-dismiss for this render only */
          }
          setDismissed(true);
        }}
        className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-700 p-1"
        aria-label="Dismiss explainer"
        data-testid="button-dismiss-shopify-explainer"
      >
        <XIcon className="w-4 h-4" />
      </button>
      <h2 className="text-[15px] font-semibold text-slate-900 mb-2 pr-6">
        How the Shopify path works
      </h2>
      <p className="text-[13px] text-slate-700 leading-snug mb-3">
        You sell the physical product on your Shopify store the way you sell
        anything else. GoodTunes plugs into the digital side: we match your
        Shopify product to this album's tracks, art, and bonus content, and
        hand you a snippet to paste into the product page. Every paid order
        delivers a numbered GoodDeed and an Apple-Music-quality digital
        edition — instantly, on any device the fan signs in on.
      </p>
      <ol className="text-[12.5px] text-slate-600 space-y-1.5 list-decimal list-inside leading-snug">
        <li>
          Upload masters, set the 30-second preview, drop in cover art and
          bonus content — same uploaders the direct-to-fan flow uses (see the
          checklist below).
        </li>
        <li>
          Push the album to Shopify as a draft (or paste an existing product
          URL to match a product you already have).
        </li>
        <li>
          Copy the product-page snippet we generate and paste it into your
          Shopify product description.
        </li>
        <li>
          A fan checks out on Shopify → lands on a branded redeem page →
          plays the album. Refunds reverse the unlock automatically.
        </li>
      </ol>
    </div>
  );
}

// ── ShopifyContentChecklist (Task #540) ──────────────────────────────
// Surfaces the same album-content readiness the vinyl flow depends on,
// so a label opening the Shopify tab knows what's still missing without
// touring every other tab. Each row jumps to the existing surface that
// owns the data (Tracks tab for masters/previews, Overview/header for
// cover art, Bonus tab for bonus content). NOTHING is uploaded from
// here — parity means the same uploader runs the show, not a duplicate.
function ShopifyContentChecklist({
  album,
  onJumpToTab,
}: {
  album: ShopifyPanelAlbum;
  onJumpToTab?: (tab: ShopifyJumpTab) => void;
}) {
  const tracksCount = album.songs.length;
  const tracksWithMaster = album.songs.filter((s) => !!s.audioUrl).length;
  const tracksWithPreview = album.songs.filter(
    (s) =>
      typeof s.previewStartMs === "number" &&
      typeof s.previewEndMs === "number",
  ).length;
  const hasCover = !!album.artwork && !/placeholder/i.test(album.artwork);

  const rows: {
    key: string;
    icon: typeof Music;
    label: string;
    detail: string;
    state: "done" | "partial" | "todo";
    jump: ShopifyJumpTab;
    testId: string;
  }[] = [
    {
      key: "cover",
      icon: ImageIcon,
      label: "Cover art",
      detail: hasCover ? "On file" : "Tap the cover at the top to upload",
      state: hasCover ? "done" : "todo",
      jump: "overview",
      testId: "checklist-row-cover",
    },
    {
      key: "masters",
      icon: Music,
      label: "Track masters",
      detail:
        tracksCount === 0
          ? "No tracks yet"
          : tracksWithMaster === tracksCount
            ? `${tracksCount} of ${tracksCount} tracks have masters`
            : `${tracksWithMaster} of ${tracksCount} tracks have masters`,
      state:
        tracksCount === 0
          ? "todo"
          : tracksWithMaster === tracksCount
            ? "done"
            : tracksWithMaster === 0
              ? "todo"
              : "partial",
      jump: "tracks",
      testId: "checklist-row-masters",
    },
    {
      key: "previews",
      icon: Scissors,
      label: "30-second previews",
      detail:
        tracksCount === 0
          ? "Add tracks first"
          : tracksWithPreview === 0
            ? `Auto-derived from the first 30s of each master — set custom windows on Tracks`
            : tracksWithPreview === tracksCount
              ? `Custom windows set on all ${tracksCount} tracks`
              : `Custom windows on ${tracksWithPreview} of ${tracksCount}; the rest auto-derive`,
      state:
        tracksCount === 0
          ? "todo"
          : tracksWithPreview > 0
            ? "done"
            : "partial",
      jump: "tracks",
      testId: "checklist-row-previews",
    },
    {
      key: "bonus",
      icon: Video,
      label: "Bonus content",
      detail: "Drop in videos, photos, lyrics, credits on the Bonus tab",
      state: "partial",
      jump: "bonus",
      testId: "checklist-row-bonus",
    },
  ];

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 mb-6"
      data-testid="shopify-content-checklist"
    >
      <div className="mb-2">
        <h2 className="text-[15px] font-semibold text-slate-900">
          Album content
        </h2>
        <p className="text-[12.5px] text-slate-500 leading-snug">
          Shopify fans get the same digital experience as direct-to-fan
          buyers. Manage masters, previews, and bonus content on the same
          tabs the vinyl flow uses.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const Icon = r.icon;
          const stateIcon =
            r.state === "done" ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : r.state === "partial" ? (
              <Circle className="w-4 h-4 text-amber-500" strokeWidth={2.5} />
            ) : (
              <Circle className="w-4 h-4 text-slate-300" />
            );
          return (
            <li
              key={r.key}
              className="py-2.5 flex items-center gap-3"
              data-testid={r.testId}
            >
              <div className="shrink-0">{stateIcon}</div>
              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-slate-900">
                  {r.label}
                </div>
                <div className="text-[11.5px] text-slate-500 leading-snug">
                  {r.detail}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onJumpToTab?.(r.jump)}
                className="text-[12px] text-[var(--brand-blue)] hover:underline shrink-0"
                data-testid={`${r.testId}-jump`}
              >
                Open →
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── ShopifyProductSnippetCard (Task #540) ────────────────────────────
// Per-album HTML snippet the label pastes into their Shopify product
// description. Includes the album id so the badge can deep-link fans
// to the GoodTunes landing for this album (curiosity + reassurance
// pre-purchase). The actual redemption URL is per-order via the
// `GoodTunes redemption URL` note attribute and is documented at
// /admin/shopify for the order-confirm email block; this card is the
// product-page-side complement.
function ShopifyProductSnippetCard({
  album,
  push,
  mappings,
}: {
  album: ShopifyPanelAlbum;
  push: PushStatus["push"] | null;
  mappings: Mapping[];
}) {
  const { toast } = useToast();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://goodtunes.music";
  const albumUrl = `${origin}/album/${album.id}`;
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const snippet = useMemo(() => {
    const safeTitle = escapeHtml(album.title);
    return `<!-- GoodTunes digital edition · album ${album.id} -->
<div style="margin:16px 0;padding:14px 16px;border:1px solid #319ED8;border-radius:10px;background:#f3fbff;font-family:-apple-system,Segoe UI,sans-serif;">
  <div style="font-weight:600;color:#00062B;margin-bottom:4px;">Includes the GoodTunes digital edition</div>
  <div style="font-size:13px;color:#334;line-height:1.4;">
    Every paid order unlocks <em>${safeTitle}</em> instantly in a real Apple-Music-quality player on any device — plus a numbered GoodDeed certificate.
    <a href="${albumUrl}" style="color:#319ED8;text-decoration:underline;">Preview the album</a>.
  </div>
</div>`;
  }, [album.id, album.title, albumUrl]);
  // Target context: prefer the pushed draft (we know its admin URL),
  // otherwise point at the first mapped product so the URL-paste flow
  // gets the same "open my product" affordance.
  const target: { adminUrl: string | null; label: string } = push
    ? {
        adminUrl: push.adminUrl,
        label: `your draft on ${push.storeName ?? push.shopDomain ?? "Shopify"}`,
      }
    : (() => {
        const m = mappings[0];
        if (!m) return { adminUrl: null, label: "your Shopify product" };
        const adminUrl = m.shopDomain
          ? `https://${m.shopDomain}/admin/products/${m.shopifyProductId}`
          : null;
        const storeName = m.storeName ?? m.shopDomain ?? "Shopify";
        const productName = m.shopifyProductTitle ?? "your mapped product";
        return { adminUrl, label: `${productName} on ${storeName}` };
      })();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Snippet copied" });
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e: any) {
      toast({
        title: "Couldn't copy",
        description: "Select the text and copy it manually.",
        variant: "destructive",
      });
    }
  };
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 mb-6"
      data-testid="shopify-product-snippet"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">
            Paste this into your Shopify product
          </h2>
          <p className="text-[12.5px] text-slate-500 leading-snug">
            One-time setup. Tells shoppers the product comes with the GoodTunes
            digital edition + numbered GoodDeed. Paste into the
            <strong> Description</strong> field on{" "}
            {target.adminUrl ? (
              <a
                className="text-[var(--brand-blue)] underline underline-offset-2"
                href={target.adminUrl}
                target="_blank"
                rel="noopener"
                data-testid="link-shopify-product-target"
              >
                {target.label}
              </a>
            ) : (
              <span className="font-medium" data-testid="text-shopify-product-target">
                {target.label}
              </span>
            )}{" "}
            in Shopify admin.
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-[12px] text-slate-700 font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
          data-testid="button-copy-product-snippet"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? "Copied" : "Copy snippet"}
        </button>
      </div>
      <pre className="text-[11.5px] bg-slate-100 text-slate-800 border border-slate-200 p-3 rounded-md overflow-x-auto leading-relaxed">
        {snippet}
      </pre>
      <ol className="mt-3 text-[12px] text-slate-500 space-y-1 list-decimal list-inside leading-snug">
        <li>Open the product in Shopify admin and switch the Description to “Show HTML” (&lt;/&gt; in the editor toolbar).</li>
        <li>Paste the block above at the top of the description.</li>
        <li>Save. Fans see the badge before they buy; the redeem CTA appears in the order-confirm email automatically.</li>
      </ol>
    </div>
  );
}
