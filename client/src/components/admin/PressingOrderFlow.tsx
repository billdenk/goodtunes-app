import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Package, Image as ImageIcon, DollarSign, Hash, Send, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AlbumSku, PressingOrderRequest } from "@shared/schema";

// Task #225 — five-stage "Go to Press!" flow that frames every Sell
// panel. The strip at the top tells the artist where they are; the
// button at the bottom is the same flow's terminal action, only
// clickable when stages 0-3 are complete. Both share the same stage
// derivation so they never disagree.

type Stage = {
  key: "package" | "art" | "price" | "quantity" | "submit";
  label: string;
  icon: LucideIcon;
  done: boolean;
};

type UploadValidation = {
  status: "pass" | "warn" | "fail";
  overrideAt: string | null;
};

function rollupPreflight(rows: UploadValidation[] | undefined): "pass" | "warn" | "fail" | "overridden" | null {
  if (!rows || rows.length === 0) return null;
  let worst: "pass" | "warn" | "overridden" = "pass";
  for (const r of rows) {
    const effective = r.overrideAt ? "overridden" : r.status;
    if (effective === "fail") return "fail";
    if (effective === "warn" && worst === "pass") worst = "warn";
    if (effective === "overridden" && worst === "pass") worst = "overridden";
  }
  return worst;
}

function useStages(albumId: string, skus: AlbumSku[]): {
  stages: Stage[];
  allDone: boolean;
  preflight: ReturnType<typeof rollupPreflight>;
  currentIdx: number;
} {
  const { data: validations } = useQuery<UploadValidation[]>({
    queryKey: ["/api/admin/albums", albumId, "upload-validations"],
  });
  const preflight = rollupPreflight(validations);

  return useMemo(() => {
    const configured = skus.filter((s) => s.active);
    const packageDone = configured.length > 0 || skus.length > 0;
    const artDone = preflight === "pass" || preflight === "warn" || preflight === "overridden";
    const priceDone =
      configured.length > 0 && configured.every((s) => (s.priceCents ?? 0) > 0);
    const quantityDone =
      configured.length > 0 && configured.every((s) => (s.plannedQuantity ?? 0) > 0);
    const stages: Stage[] = [
      { key: "package", label: "Select package", icon: Package, done: packageDone },
      { key: "art", label: "Upload art", icon: ImageIcon, done: artDone },
      { key: "price", label: "Set price", icon: DollarSign, done: priceDone },
      { key: "quantity", label: "Select quantity", icon: Hash, done: quantityDone },
      { key: "submit", label: "Go to Press!", icon: Send, done: false },
    ];
    const firstUndone = stages.findIndex((s) => !s.done);
    const allDone = packageDone && artDone && priceDone && quantityDone;
    return { stages, allDone, preflight, currentIdx: firstUndone === -1 ? 4 : firstUndone };
  }, [skus, preflight]);
}

export function PressingOrderStepper({
  albumId,
  skus,
  mode = "direct",
  onChangeMode,
}: {
  albumId: string;
  skus: AlbumSku[];
  /** Task #335 — when "shopify", we render a slim 3-stage strip (masters
   *  → cover art → push-to-Shopify) instead of the full press flow.
   *  The label runs their own fulfillment, so there is no press to go
   *  to; the milestone is "product is live in your Shopify store". */
  mode?: "direct" | "shopify";
  /** Task #335 — small text affordance in the header that reopens the
   *  two-step mode/format picker. Surfaced on the top-of-page strip
   *  so the operator can switch direction without leaving the page. */
  onChangeMode?: () => void;
}) {
  const directStages = useStages(albumId, skus);
  if (mode === "shopify") {
    // Slim Shopify variant — same visual chrome, fewer stages. The
    // stage cues here are coarse (we don't have a Shopify-publish
    // status hook yet); they exist to give the artist the same sense
    // of "where am I" the direct flow does. Refine when the
    // Push-to-Shopify status pipe is wired through.
    const skusReady = skus.some((s) => s.active);
    const slimStages: Stage[] = [
      { key: "package", label: "Masters on file", icon: Package, done: true },
      { key: "art", label: "Cover art", icon: ImageIcon, done: true },
      { key: "submit", label: "Live on Shopify", icon: Send, done: skusReady },
    ];
    return (
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4" data-testid="pressing-order-stepper-shopify">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[14px] font-semibold text-slate-900">Path to Shopify</div>
            <div className="text-[12px] text-slate-500">
              Push the album to your Shopify store — you fulfill the physical product.
            </div>
          </div>
          {onChangeMode && (
            <button
              type="button"
              onClick={onChangeMode}
              data-testid="button-change-path-mode"
              className="text-[12px] font-semibold text-[color:var(--brand-blue)] hover:underline shrink-0"
            >
              Change
            </button>
          )}
        </div>
        <div className="rounded-full bg-slate-100 border border-slate-200 p-1 flex items-center gap-1" role="list">
          {slimStages.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                role="listitem"
                aria-label={s.label}
                className={[
                  "flex items-center gap-1.5 rounded-full transition-all duration-200 min-w-0 px-2.5 py-1.5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]/40",
                  s.done
                    ? "bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)]"
                    : "text-slate-500 hover:bg-slate-200/70 focus:bg-slate-200/70",
                ].join(" ")}
                data-testid={`stage-${s.key}-${s.done ? "done" : "pending"}`}
              >
                {s.done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5 opacity-70" />}
                <span className="text-xs font-semibold truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const { stages, currentIdx } = directStages;
  const { data: latest } = useQuery<PressingOrderRequest | null>({
    queryKey: ["/api/admin/albums", albumId, "pressing-order"],
  });

  const submittedPending = latest && latest.status === "pending";
  const submittedApproved = latest && latest.status === "approved";

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4" data-testid="pressing-order-stepper">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[14px] font-semibold text-slate-900">Path to press</div>
          <div className="text-[12px] text-slate-500">
            Five steps from picking a package to sending the order to GoodTunes.
          </div>
        </div>
        {submittedPending && (
          <span
            className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
            data-testid="badge-pressing-status"
          >
            Awaiting GoodTunes review
          </span>
        )}
        {submittedApproved && (
          <span
            className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
            data-testid="badge-pressing-status"
          >
            Approved — going to press
          </span>
        )}
        {onChangeMode && !submittedPending && !submittedApproved && (
          <button
            type="button"
            onClick={onChangeMode}
            data-testid="button-change-path-mode"
            className="text-[12px] font-semibold text-[color:var(--brand-blue)] hover:underline shrink-0"
          >
            Change
          </button>
        )}
      </div>
      <div
        className="rounded-full bg-slate-100 border border-slate-200 p-1 flex items-center gap-1"
        role="list"
      >
        {stages.map((s, i) => {
          const active = i === currentIdx && !s.done;
          const Icon = s.icon;
          if (active || s.done) {
            return (
              <button
                key={s.key}
                type="button"
                role="listitem"
                aria-label={s.label}
                aria-current={active ? "step" : undefined}
                className={[
                  "flex items-center gap-1.5 rounded-full transition-all duration-200 min-w-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-100",
                  active
                    ? "flex-1 px-3 py-1.5 bg-[color:var(--brand-blue)] text-white shadow-sm focus-visible:ring-[color:var(--brand-blue)]"
                    : "px-2.5 py-1.5 bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)] focus-visible:ring-[color:var(--brand-mint)]",
                ].join(" ")}
                data-testid={`stage-${s.key}-${s.done ? "done" : "active"}`}
              >
                {s.done ? (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className="text-xs font-semibold truncate">{s.label}</span>
              </button>
            );
          }
          return (
            <button
              key={s.key}
              type="button"
              role="listitem"
              aria-label={s.label}
              className={[
                "group flex items-center rounded-full transition-all duration-200 min-w-0",
                "px-2.5 py-1.5 text-slate-500",
                "hover:bg-slate-200/70 hover:text-slate-700",
                "focus:bg-slate-200/70 focus:text-slate-700",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]/40",
              ].join(" ")}
              data-testid={`stage-${s.key}-pending`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200" />
              <span
                className={[
                  "text-xs font-semibold whitespace-nowrap overflow-hidden",
                  "max-w-0 ml-0",
                  "group-hover:max-w-[160px] group-hover:ml-1.5",
                  "group-focus:max-w-[160px] group-focus:ml-1.5",
                  "transition-all duration-200",
                ].join(" ")}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {latest && latest.status === "rejected" && (
        <div className="mt-3 rounded-md border border-[color:var(--brand-heart)]/40 bg-[color:var(--brand-heart)]/5 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[color:var(--brand-heart)] flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-slate-900">
              GoodTunes asked for changes
            </div>
            {latest.rejectionNote && (
              <div className="text-[12px] text-slate-700 mt-0.5">“{latest.rejectionNote}”</div>
            )}
            <div className="text-[11.5px] text-slate-500 mt-1">
              Make the change above and resubmit — your prior request is archived.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GoToPressButton({
  albumId,
  skus,
}: {
  albumId: string;
  skus: AlbumSku[];
}) {
  const { toast } = useToast();
  const { stages, allDone } = useStages(albumId, skus);
  const { data: latest } = useQuery<PressingOrderRequest | null>({
    queryKey: ["/api/admin/albums", albumId, "pressing-order"],
  });
  const submit = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/pressing-order`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "pressing-order"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pressing-orders"] });
      toast({
        title: "Order sent to GoodTunes.",
        description: "You'll see it switch to Approved once GoodTunes reviews it.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't submit",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  const pending = latest?.status === "pending";
  const undoneLabels = stages
    .slice(0, 4)
    .filter((s) => !s.done)
    .map((s) => s.label);

  return (
    <div className="mt-8 mb-2 rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900">Ready to press this record?</div>
          <div className="text-[12.5px] text-slate-500 mt-0.5">
            {pending
              ? "Already submitted — GoodTunes is reviewing your run."
              : allDone
                ? "Send the run to GoodTunes for review. We'll approve and push it to the press."
                : `Finish these first: ${undoneLabels.join(", ")}.`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => submit.mutate()}
          disabled={!allDone || submit.isPending || pending}
          className={[
            "h-11 px-5 rounded-full text-[13.5px] font-bold transition-all flex items-center gap-2",
            !allDone || pending
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-[color:var(--brand-purple)] text-white hover:brightness-110 shadow-sm",
          ].join(" ")}
          data-testid="button-go-to-press"
        >
          <Send className="w-4 h-4" />
          {pending ? "Submitted" : submit.isPending ? "Submitting…" : "Go to Press!"}
        </button>
      </div>
    </div>
  );
}
