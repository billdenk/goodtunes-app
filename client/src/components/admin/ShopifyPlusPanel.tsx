import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Truck,
  FileText,
  Download,
  Trash2,
  Plus,
  CreditCard,
  Loader2,
  AlertCircle,
  Factory,
  Lock,
  Undo2,
  Check,
  Bell,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, apiErrorStatus } from "@/lib/queryClient";
import { formatUsdCents } from "@shared/money";

// Task #2428 — GoodTunes Shopify+ (prepaid manufacturing). This panel is the
// "Payments" tab for a shopify_plus album: the customer sells on their own
// Shopify but runs the full Direct production pipeline (press → GoodDeed →
// optional fulfillment), prepaid via a staged ACH ledger. There is NO
// GoodTunes fan checkout and NO fan-sale pool for these releases.
//
// The panel has two stacked sections:
//   1. Manufacturing toggles — Signed GoodDeed + GoodTunes-fulfills, plus the
//      fulfillment-partner picker (auto-save on change).
//   2. Prepaid manufacturing ledger — the resolved plant, the quote PDF(s)
//      for records, and an open-ended series of payment steps. Each step is
//      paid with a US bank debit (ACH) via a hosted Stripe Checkout; once the
//      debit settles we mint a HELD earmark owed to the plant that Bill
//      releases from the existing /admin/payouts-release queue.
//
// Light admin (slate) theme — this is an operator surface, never the navy fan
// chrome. Writes are server-gated by the album scope's manage_payouts verb;
// a partner without it gets a muted note instead of the ledger.

interface Props {
  albumId: string;
  signedGooddeed: boolean;
  fulfillment: boolean;
  fulfillmentPartnerId: string | null;
  /** When false, switches + select render disabled (read-only teammates). */
  canEdit?: boolean;
  /**
   * Task #2428 — paying the prepaid manufacturing ledger is gated on album-level
   * `manage_payouts`, NOT `edit_metadata`. A label/manager/artist who can pay but
   * can't edit metadata still gets the Pay button; add/remove-step + toggles stay
   * on `canEdit`.
   */
  canPay?: boolean;
  /**
   * Task #2785 — true when the panel is rendering in the admin/operator shell
   * (AdminAlbum), false in an artist/label partner portal.
   *
   * For goodtunes_sales steps: only the operator sees Pay (Bill funds from
   * platform balance). For artist_direct steps: only the partner sees Pay
   * (artist sends the funds via ACH); the operator sees "Waiting for artist"
   * + a Send reminder link.
   */
  isOperatorView?: boolean;
}

interface FulfillmentPartner {
  id: string;
  name: string;
  isDefault?: boolean;
}

export function ShopifyPlusPanel({
  albumId,
  signedGooddeed,
  fulfillment,
  fulfillmentPartnerId,
  canEdit = true,
  canPay = true,
  isOperatorView = true,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: fulfillmentPartners = [] } = useQuery<FulfillmentPartner[]>({
    queryKey: ["/api/fulfillment-partners"],
  });
  const defaultPartner = fulfillmentPartners.find((p) => p.isDefault);

  // Per-unit fulfillment price for the customer to load into Shopify pricing
  // (partner base + markup). Only fetched when we fulfill. A read-only teammate
  // without manage_payouts gets a 403 here — we just don't render the line.
  const { data: fulfillmentPrice } = useQuery<{
    perUnitCents: number | null;
    partnerName: string | null;
    reason: string | null;
  }>({
    queryKey: ["/api/admin/albums", albumId, "shopify-plus", "fulfillment-price"],
    enabled: fulfillment,
    retry: false,
  });

  async function patch(body: Record<string, unknown>, key: string) {
    setSaving(key);
    try {
      await apiRequest("PUT", `/api/admin/albums/${albumId}`, body);
      await queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "shopify-plus", "fulfillment-price"],
      });
    } catch (e: any) {
      toast({
        title: "Couldn't save",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5" data-testid="panel-shopify-plus">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-slate-900 text-sm font-semibold">
              Prepaid manufacturing
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              This release sells on the customer's own Shopify. GoodTunes runs
              the full production pipeline and bills it up front — there's no
              GoodTunes fan checkout for a Shopify+ album.
            </p>
          </div>
          {saving && (
            <span
              className="text-slate-400 text-xs font-medium shrink-0"
              data-testid="text-shopify-plus-saving"
            >
              Saving…
            </span>
          )}
        </div>

        <div className="mt-3 divide-y divide-slate-100">
          {/* Signed GoodDeed */}
          <div
            className="flex items-center justify-between gap-4 py-3"
            data-testid="row-shopify-plus-signed-gooddeed"
          >
            <div className="flex items-start gap-3 min-w-0">
              <BadgeCheck
                className={`w-4 h-4 mt-0.5 shrink-0 ${signedGooddeed ? "text-[var(--brand-blue)]" : "text-slate-400"}`}
              />
              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold ${signedGooddeed ? "text-slate-900" : "text-slate-500"}`}
                >
                  Signed GoodDeed certificates
                </div>
                <div className="text-xs leading-snug text-slate-500">
                  Number and sign a GoodDeed certificate for every copy in the
                  run. Off means a plain manufacturing run with no certificates.
                </div>
              </div>
            </div>
            <Switch
              checked={signedGooddeed}
              disabled={saving !== null || !canEdit}
              onCheckedChange={(next) =>
                patch({ shopifyPlusSignedGooddeed: next }, "signedGooddeed")
              }
              data-testid="switch-shopify-plus-signed-gooddeed"
            />
          </div>

          {/* GoodTunes fulfills */}
          <div
            className="flex items-center justify-between gap-4 py-3"
            data-testid="row-shopify-plus-fulfillment"
          >
            <div className="flex items-start gap-3 min-w-0">
              <Truck
                className={`w-4 h-4 mt-0.5 shrink-0 ${fulfillment ? "text-[var(--brand-blue)]" : "text-slate-400"}`}
              />
              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold ${fulfillment ? "text-slate-900" : "text-slate-500"}`}
                >
                  GoodTunes fulfills orders
                </div>
                <div className="text-xs leading-snug text-slate-500">
                  We warehouse the run and ship each Shopify order. Off means we
                  hand the finished run to the customer, who ships it themselves.
                </div>
              </div>
            </div>
            <Switch
              checked={fulfillment}
              disabled={saving !== null || !canEdit}
              onCheckedChange={(next) =>
                patch({ shopifyPlusFulfillment: next }, "fulfillment")
              }
              data-testid="switch-shopify-plus-fulfillment"
            />
          </div>
        </div>

        {/* Fulfillment partner picker — only relevant when we ship. */}
        {fulfillment && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label
              htmlFor="shopify-plus-fulfillment-partner"
              className="block text-xs font-semibold text-slate-700"
            >
              Fulfillment warehouse
            </label>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Which warehouse ships this release. Leave on the platform default
              unless this run ships from a specific partner.
            </p>
            <select
              id="shopify-plus-fulfillment-partner"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] disabled:opacity-60"
              value={fulfillmentPartnerId ?? ""}
              disabled={saving !== null || !canEdit}
              onChange={(e) =>
                patch(
                  { fulfillmentPartnerId: e.target.value || null },
                  "fulfillmentPartnerId",
                )
              }
              data-testid="select-shopify-plus-fulfillment-partner"
            >
              <option value="">
                {defaultPartner
                  ? `Platform default (${defaultPartner.name})`
                  : "Platform default"}
              </option>
              {[...fulfillmentPartners]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            {fulfillmentPrice?.perUnitCents != null ? (
              <p
                className="text-xs text-slate-600 mt-2"
                data-testid="text-fulfillment-price"
              >
                Per-unit fulfillment price to load into Shopify:{" "}
                <span className="font-semibold text-slate-900">
                  {formatUsdCents(fulfillmentPrice.perUnitCents)}
                </span>
                {fulfillmentPrice.partnerName
                  ? ` (${fulfillmentPrice.partnerName})`
                  : ""}
              </p>
            ) : fulfillmentPrice?.reason === "no-rate" ? (
              <p
                className="text-xs text-amber-700 mt-2"
                data-testid="text-fulfillment-price"
              >
                No shipping rate on file for this warehouse yet — set one to
                surface a per-unit fulfillment price.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <ManufacturingLedger
        albumId={albumId}
        canEdit={canEdit}
        canPay={canPay}
        isOperatorView={isOperatorView}
      />
    </div>
  );
}

// ── Ledger ──────────────────────────────────────────────────────────────

interface LedgerQuote {
  id: string;
  albumId: string;
  fileUrl: string;
  fileName: string | null;
  notes: string | null;
  totalCents: number | null;
  isActive: boolean;
  createdAt: string;
}

interface LedgerStep {
  id: string;
  albumId: string;
  description: string;
  amountCents: number;
  marginCents: number;
  fundingSource: "goodtunes_sales" | "artist_direct";
  status: "unpaid" | "processing" | "paid" | "failed";
  sortOrder: number;
  paidAt: string | null;
  lastError: string | null;
  // Task #2785 — earmark status joined server-side.
  earmark?: { id: string; status: string } | null;
}

interface LedgerData {
  manufacturer: { id: string; name: string } | null;
  quotes: LedgerQuote[];
  steps: LedgerStep[];
  totals: {
    quotedCents: number;
    quotedSource: "quote" | "system" | "steps";
    systemCents: number | null;
    paidCents: number;
    processingCents: number;
    outstandingCents: number;
  };
  runClosedAt: string | null;
}

const STATUS_STYLES: Record<LedgerStep["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  processing: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  unpaid: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

// Task #2697 — the ledger reads as customer-facing "payment requests":
// a request starts out Requested, moves to Paying while the ACH clears,
// and lands on Paid (or Needs retry when the debit fails).
const STATUS_LABELS: Record<LedgerStep["status"], string> = {
  paid: "Paid",
  processing: "Paying",
  failed: "Needs retry",
  unpaid: "Requested",
};

const QUOTED_SOURCE_CAPTION: Record<LedgerData["totals"]["quotedSource"], string> = {
  quote: "From the active quote",
  system: "System-computed manufacturing cost (no active quote total)",
  steps: "Sum of payment requests (no quote or system cost yet)",
};

// Task #2785 — earmark status chip for paid steps.
function EarmarkChip({
  earmark,
  stepId,
}: {
  earmark: { id: string; status: string } | null | undefined;
  stepId: string;
}) {
  if (!earmark) return null;
  if (earmark.status === "released") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
        data-testid="chip-earmark-released"
      >
        <Check className="w-3 h-3" />
        Released to plant
      </span>
    );
  }
  if (earmark.status === "held") {
    return (
      <a
        href={`/admin/payouts-release?sourceRef=${encodeURIComponent(stepId)}`}
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition-colors"
        data-testid="chip-earmark-held"
        title="Go to release queue"
      >
        <Clock className="w-3 h-3" />
        Held — release pending
        <ArrowRight className="w-3 h-3" />
      </a>
    );
  }
  if (earmark.status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-200"
        data-testid="chip-earmark-failed"
      >
        <AlertCircle className="w-3 h-3" />
        Transfer failed
      </span>
    );
  }
  return null;
}

function ManufacturingLedger({
  albumId,
  canEdit,
  canPay,
  isOperatorView,
}: {
  albumId: string;
  canEdit: boolean;
  canPay: boolean;
  isOperatorView: boolean;
}) {
  const { toast } = useToast();
  const ledgerKey = ["/api/admin/albums", albumId, "manufacturing-ledger"];

  const { data, isLoading, error } = useQuery<LedgerData>({
    queryKey: ledgerKey,
  });

  // Task #2697 — close-out is a super-admin-only reversible action.
  const { data: myRole } = useQuery<{ role: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const isSuperAdmin = myRole?.role === "super_admin";

  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [margin, setMargin] = useState("");
  // Task #2785 — funding source for the new step form.
  const [fundingSource, setFundingSource] = useState<"goodtunes_sales" | "artist_direct">(
    "artist_direct",
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ledgerKey });

  // A partner without the manage_payouts verb gets a 403 on the ledger GET.
  if (apiErrorStatus(error) === 403) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-xs text-slate-500"
        data-testid="note-ledger-forbidden"
      >
        You don't have access to this release's manufacturing payments.
      </div>
    );
  }

  async function addStep() {
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!desc.trim()) {
      toast({ title: "Describe the step first", variant: "destructive" });
      return;
    }
    if (!cents || cents <= 0) {
      toast({ title: "Enter the amount owed", variant: "destructive" });
      return;
    }
    const marginCents = Math.round(parseFloat(margin || "0") * 100);
    setBusy("add");
    try {
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/steps`,
        {
          description: desc.trim(),
          amountCents: cents,
          marginCents: marginCents > 0 ? marginCents : 0,
          fundingSource,
        },
      );
      setDesc("");
      setAmount("");
      setMargin("");
      await refresh();
    } catch (e: any) {
      toast({
        title: "Couldn't add step",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function pay(step: LedgerStep) {
    setBusy(`pay-${step.id}`);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/steps/${step.id}/pay`,
      );
      const { url } = await res.json();
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e: any) {
      toast({
        title: "Couldn't start the payment",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
      setBusy(null);
    }
  }

  async function sendReminder(step: LedgerStep) {
    setBusy(`remind-${step.id}`);
    try {
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/steps/${step.id}/remind`,
      );
      toast({ title: "Reminder sent" });
    } catch (e: any) {
      toast({
        title: "Couldn't send reminder",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function patchStep(
    step: LedgerStep,
    body: { fundingSource?: "goodtunes_sales" | "artist_direct" },
    busyKey: string,
  ) {
    setBusy(busyKey);
    try {
      await apiRequest(
        "PATCH",
        `/api/admin/albums/${albumId}/manufacturing-ledger/steps/${step.id}`,
        body,
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: "Couldn't update step",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function removeStep(step: LedgerStep) {
    setBusy(`del-${step.id}`);
    try {
      await apiRequest(
        "DELETE",
        `/api/admin/albums/${albumId}/manufacturing-ledger/steps/${step.id}`,
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: "Couldn't remove step",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function removeQuote(quote: LedgerQuote) {
    setBusy(`delq-${quote.id}`);
    try {
      await apiRequest(
        "DELETE",
        `/api/admin/albums/${albumId}/manufacturing-ledger/quotes/${quote.id}`,
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: "Couldn't remove quote",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  // Task #2697 — save an edited quote total (dollars string → cents) or
  // flip the active quote.
  async function patchQuote(
    quote: LedgerQuote,
    body: { totalCents?: number | null; isActive?: boolean },
    busyKey: string,
  ) {
    setBusy(busyKey);
    try {
      await apiRequest(
        "PATCH",
        `/api/admin/albums/${albumId}/manufacturing-ledger/quotes/${quote.id}`,
        body,
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: "Couldn't save quote",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  // Task #2697 — super-admin reversible close-out.
  async function setRunClosed(close: boolean) {
    if (
      close &&
      !window.confirm(
        "Close out this run? No new payment requests can be added until it's reopened. Existing requests — including paying them — are unaffected.",
      )
    ) {
      return;
    }
    setBusy("close");
    try {
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/${close ? "close" : "reopen"}`,
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: close ? "Couldn't close out the run" : "Couldn't reopen the run",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  // Two-step signed upload: ask for a PUT url, stream the PDF to storage,
  // then record the /objects/... path. Mirrors the press-invoice uploader.
  async function uploadQuote(file: File) {
    if (file.type && file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Quotes must be a PDF.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const signRes = await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/quotes/upload-url`,
      );
      const { uploadUrl, publicUrl } = await signRes.json();
      if (!uploadUrl || !publicUrl) throw new Error("No signed upload URL");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/manufacturing-ledger/quotes`,
        { fileUrl: publicUrl, fileName: file.name },
      );
      await refresh();
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  const manufacturer = data?.manufacturer ?? null;
  const quotes = data?.quotes ?? [];
  const steps = data?.steps ?? [];
  const totals =
    data?.totals ?? {
      quotedCents: 0,
      quotedSource: "steps" as const,
      systemCents: null,
      paidCents: 0,
      processingCents: 0,
      outstandingCents: 0,
    };
  const runClosed = Boolean(data?.runClosedAt);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="panel-manufacturing-ledger"
    >
      <div className="flex items-start gap-3">
        <Factory className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <h3 className="text-slate-900 text-sm font-semibold">
            Manufacturing payments
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Pay the plant for this run in stages by US bank transfer. Each
            payment takes a few business days to clear; once it settles it's
            queued for release to the plant.
          </p>
          <p className="text-xs mt-1 text-slate-600" data-testid="text-ledger-manufacturer">
            Manufacturer:{" "}
            {manufacturer ? (
              <span className="font-semibold text-slate-900">
                {manufacturer.name}
              </span>
            ) : (
              <span className="text-rose-600">
                none assigned — set a press before collecting a payment
              </span>
            )}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading ledger…
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2" data-testid="stat-ledger-quoted">
              <div className="text-xs text-slate-500">Quoted</div>
              <div className="text-sm font-semibold text-slate-900">
                {formatUsdCents(totals.quotedCents)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2" data-testid="stat-ledger-paid">
              <div className="text-xs text-slate-500">Paid</div>
              <div className="text-sm font-semibold text-emerald-700">
                {formatUsdCents(totals.paidCents)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2" data-testid="stat-ledger-outstanding">
              <div className="text-xs text-slate-500">Outstanding</div>
              <div className="text-sm font-semibold text-slate-900">
                {formatUsdCents(totals.outstandingCents)}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5" data-testid="text-quoted-source">
            Quoted: {QUOTED_SOURCE_CAPTION[totals.quotedSource]}. Outstanding =
            quoted − paid. The quoted figure is the plant's estimate and may
            change with the press's ±10% run tolerance.
          </p>
          {totals.processingCents > 0 && (
            <p className="text-xs text-amber-700 mt-2" data-testid="text-ledger-processing">
              {formatUsdCents(totals.processingCents)} is clearing the bank now.
            </p>
          )}

          {/* Task #2697 — closed-out banner + super-admin close/reopen. */}
          {(runClosed || isSuperAdmin) && (
            <div
              className={`mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                runClosed
                  ? "bg-amber-50 ring-1 ring-amber-200"
                  : "bg-slate-50 ring-1 ring-slate-200"
              }`}
              data-testid="banner-run-closed"
            >
              <p className={`text-xs ${runClosed ? "text-amber-800" : "text-slate-500"}`}>
                {runClosed
                  ? "This run is closed out — no new payment requests can be added. Existing requests can still be paid."
                  : "Closing out the run blocks new payment requests. Reversible."}
              </p>
              {isSuperAdmin && (
                <button
                  onClick={() => setRunClosed(!runClosed)}
                  disabled={busy === "close"}
                  className={`h-9 shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${
                    runClosed
                      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "border border-amber-200 bg-white text-amber-800 hover:bg-amber-50"
                  }`}
                  data-testid="button-toggle-run-closed"
                >
                  {busy === "close" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : runClosed ? (
                    <Undo2 className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  {runClosed ? "Reopen run" : "Close out run"}
                </button>
              )}
            </div>
          )}

          {/* Task #2697 — Quotes block: the plant's quote PDFs, each with
              an editable dollar total and a single Active flag driving the
              Quoted stat. */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Quotes
            </div>
            {quotes.length === 0 ? (
              <p className="text-xs text-slate-400" data-testid="text-no-quotes">
                No quotes on file. Upload the plant's quote PDF to drive the
                Quoted total.
              </p>
            ) : (
              <div className="space-y-1.5">
                {quotes.map((q) => (
                  <QuoteRow
                    key={q.id}
                    quote={q}
                    canEdit={canEdit}
                    busy={busy}
                    onSaveTotal={(cents) =>
                      patchQuote(q, { totalCents: cents }, `total-${q.id}`)
                    }
                    onActivate={() =>
                      patchQuote(q, { isActive: true }, `activate-${q.id}`)
                    }
                    onRemove={() => removeQuote(q)}
                  />
                ))}
              </div>
            )}
            {canEdit && (
              <label
                className="mt-2 inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer w-fit"
                data-testid="button-upload-quote"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                {uploading ? "Uploading…" : "Upload quote PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadQuote(f);
                    e.target.value = "";
                  }}
                  data-testid="input-quote-file"
                />
              </label>
            )}
          </div>

          {/* Task #2785 — Payment requests block. The Pay button and "Waiting
              for artist" indicator depend on both the step's fundingSource and
              whether this is the operator or artist view. */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Payment requests
            </div>
            {steps.length === 0 ? (
              <p className="text-xs text-slate-400" data-testid="text-no-steps">
                No payment requests yet.
                {canEdit && !runClosed ? " Request the first one below." : ""}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {steps.map((step) => {
                  const isArtistDirect = step.fundingSource === "artist_direct";
                  const isGoodTunesPays = step.fundingSource === "goodtunes_sales";
                  // Who can pay this step:
                  //   artist_direct → artist (isOperatorView=false) can pay
                  //   goodtunes_sales → operator (isOperatorView=true) can pay
                  const canPayThisStep =
                    canPay &&
                    ((isArtistDirect && !isOperatorView) ||
                      (isGoodTunesPays && isOperatorView));
                  // Operator sees "Waiting for artist" on artist_direct steps.
                  const showWaiting =
                    isOperatorView &&
                    isArtistDirect &&
                    (step.status === "unpaid" || step.status === "failed");

                  return (
                    <div
                      key={step.id}
                      className="px-3 py-2.5"
                      data-testid={`row-step-${step.id}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 truncate">
                            {step.description}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatUsdCents(step.amountCents + step.marginCents)}
                            {step.marginCents > 0 && (
                              <span className="text-slate-400">
                                {" "}
                                ({formatUsdCents(step.amountCents)} to plant +{" "}
                                {formatUsdCents(step.marginCents)} margin)
                              </span>
                            )}
                            {/* Task #2785 — show funding source badge inline. */}
                            <span
                              className={`ml-2 text-xs font-medium ${
                                isArtistDirect
                                  ? "text-blue-600"
                                  : "text-purple-600"
                              }`}
                              data-testid={`badge-funding-${step.id}`}
                            >
                              {isArtistDirect ? "Artist pays" : "GoodTunes pays"}
                            </span>
                          </div>
                          {step.lastError && (
                            <div className="text-xs text-rose-600 mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {step.lastError}
                            </div>
                          )}
                          {/* Task #2785 — earmark status chip for paid steps. */}
                          {step.status === "paid" && step.earmark && (
                            <div className="mt-1">
                              <EarmarkChip earmark={step.earmark} stepId={step.id} />
                            </div>
                          )}
                          {/* Task #2785 — operator can change funding source while
                              the step is still unpaid. */}
                          {isOperatorView &&
                            canEdit &&
                            (step.status === "unpaid" || step.status === "failed") && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    patchStep(
                                      step,
                                      { fundingSource: "artist_direct" },
                                      `fs-${step.id}`,
                                    )
                                  }
                                  disabled={
                                    busy === `fs-${step.id}` || isArtistDirect
                                  }
                                  className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                                    isArtistDirect
                                      ? "border-blue-400 bg-blue-50 text-blue-700"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600"
                                  }`}
                                  data-testid={`button-fs-artist-${step.id}`}
                                >
                                  Artist pays
                                </button>
                                <button
                                  onClick={() =>
                                    patchStep(
                                      step,
                                      { fundingSource: "goodtunes_sales" },
                                      `fs-${step.id}`,
                                    )
                                  }
                                  disabled={
                                    busy === `fs-${step.id}` || isGoodTunesPays
                                  }
                                  className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                                    isGoodTunesPays
                                      ? "border-purple-400 bg-purple-50 text-purple-700"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-purple-300 hover:text-purple-600"
                                  }`}
                                  data-testid={`button-fs-goodtunes-${step.id}`}
                                >
                                  GoodTunes pays
                                </button>
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[step.status]}`}
                            data-testid={`status-step-${step.id}`}
                          >
                            {STATUS_LABELS[step.status]}
                          </span>

                          {/* Pay button — shown only to the right party. */}
                          {canPayThisStep &&
                            (step.status === "unpaid" || step.status === "failed") && (
                              <button
                                onClick={() => pay(step)}
                                disabled={busy === `pay-${step.id}` || !manufacturer}
                                className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                data-testid={`button-pay-step-${step.id}`}
                              >
                                {busy === `pay-${step.id}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CreditCard className="w-3.5 h-3.5" />
                                )}
                                Pay
                              </button>
                            )}

                          {/* Task #2785 — operator sees "Waiting for artist" +
                              Send reminder for unpaid artist_direct steps. */}
                          {showWaiting && (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-xs text-slate-500 italic"
                                data-testid={`text-waiting-artist-${step.id}`}
                              >
                                Waiting for artist
                              </span>
                              <button
                                onClick={() => sendReminder(step)}
                                disabled={busy === `remind-${step.id}`}
                                className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                data-testid={`button-remind-step-${step.id}`}
                                title="Re-send payment request email to artist"
                              >
                                {busy === `remind-${step.id}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Bell className="w-3.5 h-3.5" />
                                )}
                                Send reminder
                              </button>
                            </div>
                          )}

                          {canEdit &&
                            (step.status === "unpaid" || step.status === "failed") && (
                              <button
                                onClick={() => removeStep(step)}
                                disabled={busy === `del-${step.id}`}
                                aria-label="Remove payment request"
                                className="h-9 inline-flex items-center justify-center rounded-lg px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                data-testid={`button-remove-step-${step.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Request payment — hidden once the run is closed out.
                Operator-only (canEdit gates on edit_metadata). */}
            {canEdit && !runClosed && (
              <div className="mt-3 space-y-2" data-testid="form-add-step">
                {/* Task #2785 — funding source selector. */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Funded by
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFundingSource("artist_direct")}
                      className={`h-8 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold border transition-colors ${
                        fundingSource === "artist_direct"
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      data-testid="button-funding-artist-direct"
                    >
                      Artist pays GoodTunes
                    </button>
                    <button
                      type="button"
                      onClick={() => setFundingSource("goodtunes_sales")}
                      className={`h-8 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold border transition-colors ${
                        fundingSource === "goodtunes_sales"
                          ? "border-purple-400 bg-purple-50 text-purple-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      data-testid="button-funding-goodtunes-sales"
                    >
                      GoodTunes pays from sales
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {fundingSource === "artist_direct"
                      ? "Artist gets an email with a payment link. You'll be notified when funds arrive."
                      : "Bill pays the plant from GoodTunes' sales balance. No artist notification."}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-slate-500 mb-1">
                      Reason
                    </label>
                    <input
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="e.g. Vinyl run — 500 units"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
                      data-testid="input-step-description"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs text-slate-500 mb-1">
                      To plant $
                    </label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
                      data-testid="input-step-amount"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs text-slate-500 mb-1">
                      Margin $
                    </label>
                    <input
                      value={margin}
                      onChange={(e) => setMargin(e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)]"
                      data-testid="input-step-margin"
                    />
                  </div>
                  <button
                    onClick={addStep}
                    disabled={busy === "add"}
                    className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    data-testid="button-add-step"
                  >
                    {busy === "add" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Request payment
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Task #2697 — one quote PDF row: download link, editable dollar total
// (saved on blur/Enter), Active pill or Make-active button, delete.
function QuoteRow({
  quote,
  canEdit,
  busy,
  onSaveTotal,
  onActivate,
  onRemove,
}: {
  quote: LedgerQuote;
  canEdit: boolean;
  busy: string | null;
  onSaveTotal: (cents: number | null) => void;
  onActivate: () => void;
  onRemove: () => void;
}) {
  const [total, setTotal] = useState(
    quote.totalCents != null ? (quote.totalCents / 100).toFixed(2) : "",
  );

  function commitTotal() {
    const trimmed = total.trim();
    if (trimmed === "") {
      if (quote.totalCents != null) onSaveTotal(null);
      return;
    }
    const cents = Math.round(parseFloat(trimmed) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setTotal(
        quote.totalCents != null ? (quote.totalCents / 100).toFixed(2) : "",
      );
      return;
    }
    if (cents !== quote.totalCents) onSaveTotal(cents);
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
      data-testid={`row-quote-${quote.id}`}
    >
      <div className="inline-flex items-center gap-2 min-w-0 flex-1">
        <a
          href={quote.fileUrl}
          download={quote.fileName || "Quote.pdf"}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-200 shrink-0 transition-colors"
          data-testid={`link-quote-${quote.id}`}
          aria-label={`Download ${quote.fileName || "Quote.pdf"}`}
        >
          <Download className="w-4 h-4" />
        </a>
        <span className="text-sm text-slate-700 truncate">
          {quote.fileName || "Quote.pdf"}
        </span>
        {quote.isActive && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0"
            data-testid={`badge-quote-active-${quote.id}`}
          >
            Active
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            $
          </span>
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            onBlur={commitTotal}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            type="number"
            step="0.01"
            placeholder="Total"
            disabled={!canEdit || busy === `total-${quote.id}`}
            className="w-28 rounded-lg border border-slate-200 bg-white pl-6 pr-2 py-1.5 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] disabled:opacity-60"
            data-testid={`input-quote-total-${quote.id}`}
          />
        </div>
        {canEdit && !quote.isActive && (
          <button
            onClick={onActivate}
            disabled={busy === `activate-${quote.id}` || quote.totalCents == null}
            title={
              quote.totalCents == null
                ? "Set a total before making this the active quote"
                : "Use this quote's total as the Quoted amount"
            }
            className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-activate-quote-${quote.id}`}
          >
            {busy === `activate-${quote.id}` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Make active
          </button>
        )}
        {canEdit && (
          <button
            onClick={onRemove}
            disabled={busy === `delq-${quote.id}`}
            aria-label="Remove quote"
            className="h-9 inline-flex items-center justify-center rounded-lg px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            data-testid={`button-remove-quote-${quote.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
