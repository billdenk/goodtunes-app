import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, ChevronRight, Check, Circle, CircleDot } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #2061 — post-purchase "Who's the gift for?" stepper.
//
// A custom add-on ("Gift of Hope") can be bought in quantity; each unit
// becomes one *box* the buyer personalizes AFTER checkout so the owning
// foundation gets a real recipient + shipping address. This sheet walks the
// buyer through their boxes one at a time:
//   • "{org} chooses"  → the foundation picks who receives it (giver name +
//                         message optional).
//   • "Someone I know" → the buyer supplies the recipient's name, phone, and
//                         shipping address so the fulfiller can mail it.
//
// It is GENERIC — every label comes from the box's snapshotted `orgName`, so
// there is no hard-coded Nightbirde / "Gift of Hope" string here. Copy never
// implies we email the recipient (we don't); the buyer shares the link.

export type GiftBox = {
  id: string;
  orderId: string;
  orderItemId: string;
  position: number;
  orgName: string | null;
  mode: "foundation" | "known" | null;
  recipientName: string | null;
  recipientPhone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  giverName: string | null;
  message: string | null;
  personalized: boolean;
  personalizedAt: string | null;
};

const NAME_MAX = 120;
const MESSAGE_MAX = 500;
const ADDR_MAX = 200;
const SHORT_MAX = 60;

type FormState = {
  mode: "foundation" | "known" | null;
  giverName: string;
  message: string;
  recipientName: string;
  recipientPhone: string;
  address1: string;
  address2: string;
  zip: string;
  state: string;
};

function formFromBox(b: GiftBox | undefined): FormState {
  return {
    mode: b?.mode ?? null,
    giverName: b?.giverName ?? "",
    message: b?.message ?? "",
    recipientName: b?.recipientName ?? "",
    recipientPhone: b?.recipientPhone ?? "",
    address1: b?.address1 ?? "",
    address2: b?.address2 ?? "",
    zip: b?.zip ?? "",
    state: b?.state ?? "",
  };
}

const inputCls =
  "w-full border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-white/[0.06] focus:outline-none focus:border-[color:var(--brand-blue)]";

interface Props {
  orderId: string;
  albumTitle?: string | null;
  onClose: () => void;
  /** Fired once the buyer reaches the end of the stepper (Done on the last box). */
  onAllDone?: () => void;
}

export function GiftBoxPersonalizer({ orderId, albumTitle, onClose, onAllDone }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ boxes: GiftBox[] }>({
    queryKey: ["/api/orders", orderId, "gift-boxes"],
  });
  const boxes = useMemo(() => data?.boxes ?? [], [data]);

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormState>(formFromBox(undefined));

  const currentBox: GiftBox | undefined = boxes[stepIndex];
  const total = boxes.length;
  const isLast = stepIndex >= total - 1;
  const orgName = currentBox?.orgName ?? "the foundation";

  // Re-seed the form whenever we land on a different box (by id, so a
  // background refetch of the same box doesn't clobber in-progress edits).
  useEffect(() => {
    setForm(formFromBox(currentBox));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBox?.id]);

  const patch = useMutation({
    mutationFn: async (vars: { boxId: string; body: Record<string, unknown> }) => {
      const r = await apiRequest("PATCH", `/api/orders/${orderId}/gift-boxes/${vars.boxId}`, vars.body);
      return (await r.json()) as { box: GiftBox };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "gift-boxes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't save", description: e?.message?.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function advance() {
    if (isLast) {
      onAllDone?.();
      onClose();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleNext() {
    if (!currentBox) return;
    if (!form.mode) {
      toast({ title: "Pick who the gift is for", variant: "destructive" });
      return;
    }
    let body: Record<string, unknown>;
    if (form.mode === "foundation") {
      body = { mode: "foundation", giverName: form.giverName.trim() || null, message: form.message.trim() || null };
    } else {
      if (!form.recipientName.trim()) return toast({ title: "Add the recipient's name", variant: "destructive" });
      if (!form.recipientPhone.trim())
        return toast({ title: "Add a phone number so the box can be delivered", variant: "destructive" });
      if (!form.address1.trim()) return toast({ title: "Add a street address", variant: "destructive" });
      if (!form.state.trim()) return toast({ title: "Add a state", variant: "destructive" });
      if (!form.zip.trim()) return toast({ title: "Add a ZIP code", variant: "destructive" });
      body = {
        mode: "known",
        recipientName: form.recipientName.trim(),
        recipientPhone: form.recipientPhone.trim(),
        address1: form.address1.trim(),
        address2: form.address2.trim() || null,
        zip: form.zip.trim(),
        state: form.state.trim(),
        giverName: form.giverName.trim() || null,
        message: form.message.trim() || null,
      };
    }
    patch.mutate({ boxId: currentBox.id, body }, { onSuccess: advance });
  }

  const panel = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      data-testid="gift-personalizer"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full sm:max-w-[440px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl bg-[color:var(--brand-bg)]"
        role="dialog"
        aria-modal="true"
        aria-label="Personalize your gift"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 pt-5 pb-3 bg-[color:var(--brand-bg)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider font-semibold truncate text-[color:var(--brand-mint)]">
                {currentBox?.orgName ?? "Gift"}
                {albumTitle ? <span className="text-fan-faint"> · {albumTitle}</span> : null}
              </div>
              <h2 className="text-white text-2xl font-bold leading-tight mt-1">Who's the gift for?</h2>
            </div>
            <IconButton
              variant="ghost"
              label="Close"
              onClick={onClose}
              className="flex-shrink-0 -mr-1.5 -mt-1"
              data-testid="button-close-personalizer"
            >
              <X />
            </IconButton>
          </div>
          {total > 1 && (
            <div className="mt-1.5 text-xs text-fan-faint" data-testid="text-box-progress">
              Gift {stepIndex + 1} of {total}
            </div>
          )}
        </div>

        {isLoading || !currentBox ? (
          <div className="px-5 py-12 text-center text-fan-secondary text-sm">Loading your gifts…</div>
        ) : (
          <div className="px-5 pb-5">
            {/* Mode chooser */}
            <div className="flex flex-col gap-2.5">
              <ModeOption
                selected={form.mode === "foundation"}
                onClick={() => set("mode", "foundation")}
                title={`${orgName} chooses`}
                subtitle={`Let ${orgName} send it to someone who needs it.`}
                testid="option-foundation"
              />
              <ModeOption
                selected={form.mode === "known"}
                onClick={() => set("mode", "known")}
                title="Someone I know"
                subtitle="I'll share their name and shipping address."
                testid="option-known"
              />
            </div>

            {/* Mode-specific fields */}
            {form.mode === "known" && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <input
                  className={inputCls}
                  placeholder="Friend's name"
                  aria-label="Friend's name"
                  value={form.recipientName}
                  onChange={(e) => set("recipientName", e.target.value.slice(0, NAME_MAX))}
                  data-testid="input-recipient-name"
                />
                <input
                  className={inputCls}
                  type="tel"
                  placeholder="Friend's phone number"
                  aria-label="Friend's phone number"
                  value={form.recipientPhone}
                  onChange={(e) => set("recipientPhone", e.target.value.slice(0, SHORT_MAX))}
                  data-testid="input-recipient-phone"
                />
                <input
                  className={inputCls}
                  placeholder="Friend's address"
                  aria-label="Friend's address"
                  value={form.address1}
                  onChange={(e) => set("address1", e.target.value.slice(0, ADDR_MAX))}
                  data-testid="input-address1"
                />
                <input
                  className={inputCls}
                  placeholder="Friend's address 2"
                  aria-label="Friend's address line 2"
                  value={form.address2}
                  onChange={(e) => set("address2", e.target.value.slice(0, ADDR_MAX))}
                  data-testid="input-address2"
                />
                <input
                  className={inputCls}
                  placeholder="Zip-Code"
                  aria-label="ZIP code"
                  value={form.zip}
                  onChange={(e) => set("zip", e.target.value.slice(0, SHORT_MAX))}
                  data-testid="input-zip"
                />
                <input
                  className={inputCls}
                  placeholder="State"
                  aria-label="State"
                  value={form.state}
                  onChange={(e) => set("state", e.target.value.slice(0, SHORT_MAX))}
                  data-testid="input-state"
                />
                <input
                  className={`${inputCls} col-span-2`}
                  placeholder="Your name (optional)"
                  aria-label="Your name (optional)"
                  value={form.giverName}
                  onChange={(e) => set("giverName", e.target.value.slice(0, NAME_MAX))}
                  data-testid="input-giver-name"
                />
              </div>
            )}

            {form.mode && (
              <textarea
                className={`${inputCls} mt-2.5 resize-none`}
                placeholder="Leave a message (optional)"
                aria-label="Leave a message (optional)"
                rows={3}
                value={form.message}
                onChange={(e) => set("message", e.target.value.slice(0, MESSAGE_MAX))}
                data-testid="input-message"
              />
            )}

            {form.mode && (
              <p className="mt-3 text-xs leading-snug text-fan-faint">
                {form.mode === "known" ? (
                  <>We'll share these details with {orgName} so they can send the box to your friend.</>
                ) : (
                  <>{orgName} will choose a recipient and handle delivery on your behalf.</>
                )}
              </p>
            )}

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={patch.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)]"
                data-testid="button-next-box"
              >
                {patch.isPending ? "Saving…" : isLast ? "Done" : "Next"}
                {isLast ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function ModeOption({
  selected,
  onClick,
  title,
  subtitle,
  testid,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 text-left rounded-2xl border px-4 py-3 transition-colors ${
        selected
          ? "border-[color:var(--brand-orange)] bg-white/[0.06]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
      }`}
      data-testid={testid}
      aria-pressed={selected}
    >
      {selected ? (
        <CircleDot className="mt-0.5 flex-shrink-0 w-5 h-5 text-[color:var(--brand-orange)]" />
      ) : (
        <Circle className="mt-0.5 flex-shrink-0 w-5 h-5 text-fan-faint" />
      )}
      <span className="min-w-0">
        <span className="block text-base font-semibold text-white">{title}</span>
        <span className="block text-xs text-fan-secondary leading-snug mt-0.5">{subtitle}</span>
      </span>
    </button>
  );
}
