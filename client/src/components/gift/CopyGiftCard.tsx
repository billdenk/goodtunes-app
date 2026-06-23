// Task #2063 — per-copy gift card. A buyer with a multi-quantity order can
// gift ONE copy and keep the rest. This card renders a single copy's gift
// state (yours / sent / claimed / cancelled) plus the self-serve manage
// controls (copy link, resend, change recipient ≤24h, revoke pre-claim &
// pre-fulfillment). It is rendered once per copy on both the post-purchase
// Welcome screen and the Orders page, so it owns its own state + mutations
// (no hooks-in-a-map) and refreshes its host via the `onMutated` callback.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { Gift } from "lucide-react";

// Mirrors server/gifts.ts serializeGiftForBuyer().
export type CopyGift = {
  id: string;
  copyId: string | null;
  buyerUserId: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  claimToken: string | null;
  claimed: boolean;
  claimedAt: string | null;
  revokedAt: string | null;
  reverted: boolean;
  deliverOn: string | null;
  deliveredAt: string | null;
  expiresAt: string;
  createdAt: string;
  resendCount: number;
  isBuyer: boolean;
};

// The per-copy entitlement row plus its (optional) gift, as returned by
// /api/checkout/session/:id and /api/orders.
export type GiftableCopy = {
  id: string;
  position: number;
  format: string;
  goodDeedNumber: number | null;
  gift?: CopyGift | null;
};

const RECIPIENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const FULFILLMENT_LOCKED = new Set(["in_fulfillment", "shipped", "delivered"]);

// ─── Shared surface tokens (Task #2063 design pass) ──────────────────
// Brand-blue tints, never the muddy gray that white-alpha fills become over
// the navy fan bg. Cards have NO hard outline; fields keep a DIM white
// hairline that warms to brand-blue on focus.
const CARD = "rounded-2xl bg-[color:var(--fan-surface)] px-3.5 py-3";
const FIELD =
  "rounded-lg bg-[color:var(--fan-surface-strong)] border border-[color:var(--fan-field-border)] text-sm text-fan-primary outline-none focus:border-[color:var(--brand-blue)]";

type Props = {
  orderId: string;
  copy: GiftableCopy;
  // 1-based label for this copy ("Copy 2 of 3").
  index: number;
  total: number;
  // The whole order is itself a gift — per-copy and whole-order gifting must
  // not coexist, so creating a per-copy gift is blocked.
  wholeOrderGifted: boolean;
  // Drives the revoke lock: a copy in fulfillment can't be re-routed.
  fulfillmentStatus?: string | null;
  // Host refreshes its own data source after a mutation (Welcome re-pulls the
  // checkout session; Orders invalidates the ["/api/orders"] query).
  onMutated: () => void;
};

export function CopyGiftCard({ orderId, copy, index, total, wholeOrderGifted, fulfillmentStatus, onMutated }: Props) {
  const { toast } = useToast();
  const g = copy.gift;
  const [creating, setCreating] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [contactKind, setContactKind] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");

  const base = `/api/orders/${orderId}/copies/${copy.id}/gift`;
  const label = `Copy ${index} of ${total}`;

  const createGift = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", base, {
        firstName: first.trim(),
        lastName: last.trim(),
        email: contactKind === "email" ? contact.trim() : "",
        phone: contactKind === "phone" ? contact.trim() : "",
      });
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      track("gift_initiated", { orderId, copyId: copy.id });
      setCreating(false);
      setFirst(""); setLast(""); setContact("");
      onMutated();
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Gift link ready · copied", description: "Send it to your recipient." });
      } catch {
        toast({ title: "Gift link ready", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't create gift", description: e?.message, variant: "destructive" }),
  });

  const resendGift = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `${base}/resend`, {});
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      onMutated();
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Gift link refreshed", description: "Copied to clipboard — send it to your recipient." });
      } catch {
        toast({ title: "Gift link refreshed", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't refresh link", description: e?.message, variant: "destructive" }),
  });

  const patchGift = useMutation({
    mutationFn: async (body: { firstName: string; lastName: string; email: string | null; phone: string | null }) => {
      const r = await apiRequest("PATCH", base, body);
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      onMutated();
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Recipient updated · new link copied" });
      } catch {
        toast({ title: "Recipient updated", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  const revokeGift = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `${base}/revoke`, {});
      return r.json();
    },
    onSuccess: () => {
      onMutated();
      toast({ title: "Gift cancelled", description: "The claim link is invalid. This copy stays in your collection." });
    },
    onError: (e: any) => toast({ title: "Couldn't cancel gift", description: e?.message, variant: "destructive" }),
  });

  function submitCreate() {
    if (!first.trim() || !last.trim()) {
      toast({ title: "Add the recipient's name", variant: "destructive" });
      return;
    }
    if (!contact.trim()) {
      toast({ title: `Add the recipient's ${contactKind}`, variant: "destructive" });
      return;
    }
    createGift.mutate();
  }

  async function copyLink() {
    if (!g?.claimToken) return;
    const url = `${window.location.origin}/gift/${g.claimToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Gift link copied" });
    } catch {
      toast({ title: "Gift link", description: url });
    }
  }

  function promptChangeRecipient() {
    if (!g) return;
    const firstName = window.prompt("Recipient first name", g.recipientFirstName)?.trim();
    if (!firstName) return;
    const lastName = window.prompt("Recipient last name", g.recipientLastName)?.trim();
    if (!lastName) return;
    const email = window.prompt("Recipient email (blank to skip)", g.recipientEmail ?? "")?.trim() || null;
    const phone = email ? null : window.prompt("Recipient phone (required if no email)", g.recipientPhone ?? "")?.trim() || null;
    patchGift.mutate({ firstName, lastName, email, phone });
  }

  // ─── Has a gift: render its state + manage controls ────────────────
  if (g) {
    const expired = !g.claimed && !g.revokedAt && !g.reverted && new Date(g.expiresAt).getTime() < Date.now();
    const editable = !g.claimed && Date.now() - new Date(g.createdAt).getTime() <= RECIPIENT_EDIT_WINDOW_MS;
    const fulfillmentLocked = !!fulfillmentStatus && FULFILLMENT_LOCKED.has(fulfillmentStatus);
    return (
      <div
        className={CARD}
        data-testid={`copy-gift-card-${copy.id}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-fan-secondary">{label}</span>
          {g.copyId && <Gift className="w-3.5 h-3.5 text-[color:var(--brand-heart)]" />}
        </div>
        <div className="mt-1 text-xs text-fan-secondary leading-snug">
          Gift to{" "}
          <span className="text-fan-primary font-medium">
            {g.recipientFirstName} {g.recipientLastName}
          </span>
          {g.recipientEmail && <> · <span className="text-fan-secondary">{g.recipientEmail}</span></>}
          {g.recipientPhone && <> · <span className="text-fan-secondary">{g.recipientPhone}</span></>}
        </div>
        {g.reverted ? (
          <div className="mt-1.5 text-xs text-rose-300">Gift reverted after a refund — this copy is back with you.</div>
        ) : g.revokedAt ? (
          <div className="mt-1.5 text-xs text-rose-300">
            Gift cancelled {new Date(g.revokedAt).toLocaleDateString()} — this copy stays with you.
          </div>
        ) : g.claimed && g.claimedAt ? (
          <div className="mt-1.5 text-xs text-[color:var(--brand-mint)]">Claimed {new Date(g.claimedAt).toLocaleDateString()}</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {g.claimToken && !expired && (
              <button
                type="button"
                onClick={copyLink}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue)] hover:bg-[color:var(--fan-surface-strong)]"
                data-testid={`button-copy-link-copy-${copy.id}`}
              >
                Copy link
              </button>
            )}
            <button
              type="button"
              onClick={() => resendGift.mutate()}
              disabled={resendGift.isPending}
              className="px-3 py-1 rounded-full text-xs font-medium bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-pink)] hover:bg-[color:var(--brand-pink-soft-hover)] disabled:opacity-50"
              data-testid={`button-resend-gift-copy-${copy.id}`}
            >
              {expired ? "Recover expired link" : "Resend link"}
            </button>
            {editable && (
              <button
                type="button"
                onClick={promptChangeRecipient}
                disabled={patchGift.isPending}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[color:var(--brand-purple-soft)] text-[#c89dff] hover:bg-[color:var(--brand-purple-soft-hover)] disabled:opacity-50"
                data-testid={`button-change-recipient-copy-${copy.id}`}
              >
                Change recipient
              </button>
            )}
            {!fulfillmentLocked && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Cancel this gift? The claim link will stop working and the copy stays in your collection.")) {
                    revokeGift.mutate();
                  }
                }}
                disabled={revokeGift.isPending}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[color:var(--brand-rose-soft)] text-rose-300 hover:bg-[color:var(--brand-rose-soft-hover)] disabled:opacity-50"
                data-testid={`button-revoke-gift-copy-${copy.id}`}
              >
                Cancel gift
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── No gift yet: "yours" — offer to gift this copy ────────────────
  return (
    <div
      className={CARD}
      data-testid={`copy-gift-card-${copy.id}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-fan-secondary">{label}</span>
        <span className="text-xs font-medium text-[color:var(--brand-mint)]">Yours</span>
      </div>
      {wholeOrderGifted ? (
        <div className="mt-1.5 text-xs text-fan-secondary">
          This whole order is already a gift, so individual copies can't be gifted separately.
        </div>
      ) : creating ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="First name"
              className={`min-w-0 flex-1 px-3 py-2 placeholder:text-fan-secondary/60 ${FIELD}`}
              data-testid={`input-gift-first-copy-${copy.id}`}
            />
            <input
              value={last}
              onChange={(e) => setLast(e.target.value)}
              placeholder="Last name"
              className={`min-w-0 flex-1 px-3 py-2 placeholder:text-fan-secondary/60 ${FIELD}`}
              data-testid={`input-gift-last-copy-${copy.id}`}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={contactKind}
              onChange={(e) => setContactKind(e.target.value as "email" | "phone")}
              className={`px-2 py-2 ${FIELD}`}
              data-testid={`select-gift-contact-kind-copy-${copy.id}`}
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={contactKind === "email" ? "recipient@email.com" : "Phone number"}
              className={`min-w-0 flex-1 px-3 py-2 placeholder:text-fan-secondary/60 ${FIELD}`}
              data-testid={`input-gift-contact-copy-${copy.id}`}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitCreate}
              disabled={createGift.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[color:var(--brand-pink)] text-white hover:opacity-90 disabled:opacity-50"
              data-testid={`button-submit-gift-copy-${copy.id}`}
            >
              {createGift.isPending ? "Creating…" : "Create gift link"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-[color:var(--fan-surface-strong)] text-fan-secondary hover:bg-[color:var(--brand-blue-soft)]"
              data-testid={`button-cancel-gift-copy-${copy.id}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[color:var(--brand-pink-soft)] text-[color:var(--brand-pink)] hover:bg-[color:var(--brand-pink-soft-hover)]"
          data-testid={`button-gift-copy-${copy.id}`}
        >
          <Gift className="w-3.5 h-3.5" /> Gift this copy
        </button>
      )}
    </div>
  );
}
