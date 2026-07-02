import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Truck,
  FileText,
  Trash2,
  Plus,
  CreditCard,
  Loader2,
  AlertCircle,
  Factory,
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

      <ManufacturingLedger albumId={albumId} canEdit={canEdit} canPay={canPay} />
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
  createdAt: string;
}

interface LedgerStep {
  id: string;
  albumId: string;
  description: string;
  amountCents: number;
  marginCents: number;
  status: "unpaid" | "processing" | "paid" | "failed";
  sortOrder: number;
  paidAt: string | null;
  lastError: string | null;
}

interface LedgerData {
  manufacturer: { id: string; name: string } | null;
  quotes: LedgerQuote[];
  steps: LedgerStep[];
  totals: {
    quotedCents: number;
    paidCents: number;
    processingCents: number;
    outstandingCents: number;
  };
}

const STATUS_STYLES: Record<LedgerStep["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  processing: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  unpaid: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const STATUS_LABELS: Record<LedgerStep["status"], string> = {
  paid: "Paid",
  processing: "Processing",
  failed: "Retry needed",
  unpaid: "Unpaid",
};

function ManufacturingLedger({
  albumId,
  canEdit,
  canPay,
}: {
  albumId: string;
  canEdit: boolean;
  canPay: boolean;
}) {
  const { toast } = useToast();
  const ledgerKey = ["/api/admin/albums", albumId, "manufacturing-ledger"];

  const { data, isLoading, error } = useQuery<LedgerData>({
    queryKey: ledgerKey,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [margin, setMargin] = useState("");

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
      paidCents: 0,
      processingCents: 0,
      outstandingCents: 0,
    };

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
          {totals.processingCents > 0 && (
            <p className="text-xs text-amber-700 mt-2" data-testid="text-ledger-processing">
              {formatUsdCents(totals.processingCents)} is clearing the bank now.
            </p>
          )}

          {/* Steps */}
          <div className="mt-5">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Payment steps
            </div>
            {steps.length === 0 ? (
              <p className="text-xs text-slate-400" data-testid="text-no-steps">
                No payment steps yet. Add the first one below.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                    data-testid={`row-step-${step.id}`}
                  >
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
                      </div>
                      {step.lastError && (
                        <div className="text-xs text-rose-600 mt-0.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {step.lastError}
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
                      {canPay &&
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
                      {canEdit &&
                        (step.status === "unpaid" || step.status === "failed") && (
                          <button
                            onClick={() => removeStep(step)}
                            disabled={busy === `del-${step.id}`}
                            aria-label="Remove step"
                            className="h-9 inline-flex items-center justify-center rounded-lg px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            data-testid={`button-remove-step-${step.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add step */}
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="form-add-step">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-slate-500 mb-1">
                    Step
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
                  Add step
                </button>
              </div>
            )}
          </div>

          {/* Quotes */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Quote PDFs
            </div>
            {quotes.length === 0 ? (
              <p className="text-xs text-slate-400" data-testid="text-no-quotes">
                No quotes on file.
              </p>
            ) : (
              <div className="space-y-1.5">
                {quotes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                    data-testid={`row-quote-${q.id}`}
                  >
                    <a
                      href={q.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 min-w-0"
                      data-testid={`link-quote-${q.id}`}
                    >
                      <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                      <span className="truncate">
                        {q.fileName || "Quote.pdf"}
                      </span>
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => removeQuote(q)}
                        disabled={busy === `delq-${q.id}`}
                        aria-label="Remove quote"
                        className="h-9 inline-flex items-center justify-center rounded-lg px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        data-testid={`button-remove-quote-${q.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
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
        </>
      )}
    </div>
  );
}
