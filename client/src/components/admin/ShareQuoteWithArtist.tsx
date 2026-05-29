// ShareQuoteWithArtist — Task #706.
//
// Lets an operator (or, later, a press) turn a built set of quotes on
// the Sell panel into a shareable invite link. The quotes themselves
// already persist server-side as `album_skus` rows; this surface mints
// an artist invite (role=artist, inviteRole=identity) scoped to the
// album's primary artist and PRE-FLIGHTS the album so the recipient
// lands straight on the album editor with the prepared quotes waiting.
//
// Reuses the existing POST /api/admin/invites machinery wholesale —
// claimed-Person review gate, referral wiring, email send, and the
// security URL-suppression for held invites all come for free. Because
// that endpoint already authorizes scoped partners with `invite_subusers`
// (a press inviting an artist), the same flow is reusable by a press
// role later without new server work.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Copy, Check, Link2, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/ui/IconButton";

type InviteResult = {
  id: string;
  email: string;
  role: string;
  acceptUrl: string | null;
  emailDelivered: boolean;
  reviewStatus?: string;
  claimedReason?: string | null;
};

export function ShareQuoteWithArtist({
  albumId,
  albumTitle,
  primaryArtistId,
  artistName,
  savedQuoteCount,
  unsavedDraftCount,
}: {
  albumId: string;
  albumTitle: string;
  primaryArtistId: string | null;
  artistName: string;
  /** Number of formats already saved server-side (the quotes that will
   *  be waiting for the artist). */
  savedQuoteCount: number;
  /** Draft format rows the operator added but hasn't saved yet — these
   *  won't travel with the link, so we warn before sending. */
  unsavedDraftCount: number;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Prefill the email from the artist Person's contact email when we
  // have one on file (the admin projection carries `contactEmail`).
  // Loads on mount so the value is cached by the time the operator
  // opens the dialog.
  const { data: personData } = useQuery<{ contactEmail: string | null }>({
    queryKey: ["/api/admin/people", primaryArtistId ?? "__none__"],
    enabled: !!primaryArtistId,
  });
  const prefillEmail = personData?.contactEmail ?? "";

  function openDialog() {
    setResult(null);
    setCopied(false);
    setNote("");
    setEmail(prefillEmail);
    setOpen(true);
  }

  const mintMutation = useMutation({
    mutationFn: async (body: { email: string; note: string }) => {
      const r = await apiRequest("POST", "/api/admin/invites", {
        email: body.email,
        role: "artist",
        roleScopeId: primaryArtistId,
        inviteRole: "identity",
        targetPersonId: primaryArtistId,
        preFlightedAlbumId: albumId,
        welcomeNote: body.note || null,
      });
      return (await r.json()) as InviteResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      if (data.reviewStatus === "pending_review") {
        toast({
          title: "Held for review",
          description:
            data.claimedReason ||
            "This artist is already claimed — GoodTunes has to approve before the link goes out.",
        });
      } else {
        toast({
          title: data.emailDelivered ? "Quote link sent" : "Quote link ready",
          description: data.emailDelivered
            ? `Emailed ${data.email} — or copy the link below.`
            : "Copy the link below and send it however you like.",
        });
      }
    },
    onError: (e: Error) => {
      toast({
        title: "Couldn't create the link",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  async function copyUrl() {
    if (!result?.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(result.acceptUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL is still visible to select manually */
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canMint = !!primaryArtistId && emailValid && savedQuoteCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!primaryArtistId || savedQuoteCount === 0}
        className="px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="button-share-quote"
        title={
          !primaryArtistId
            ? "Link this album to a primary artist first"
            : savedQuoteCount === 0
              ? "Save at least one format before sharing"
              : "Send the artist a link with these quotes waiting"
        }
      >
        <Send className="w-3 h-3" />
        Share with artist
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-share-quote">
          <DialogHeader>
            <DialogTitle>Send these quotes to {artistName || "the artist"}</DialogTitle>
            <DialogDescription>
              They'll get a one-time link to create their account and land
              right on <span className="font-medium text-slate-700">{albumTitle || "this album"}</span>{" "}
              with {savedQuoteCount} saved {savedQuoteCount === 1 ? "format" : "formats"} already
              waiting — editable on their side per your existing permissions.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            // ── Post-mint: show the link (or the held-for-review state) ──
            result.reviewStatus === "pending_review" ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 p-4"
                data-testid="banner-quote-held"
              >
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <Clock className="w-4 h-4" />
                  Held for GoodTunes review
                </div>
                <p className="mt-1 text-sm text-amber-900/90">
                  {result.claimedReason ||
                    "This artist is already claimed. A super-admin has to approve the invite before the link can be shared."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                  <Check className="w-4 h-4" />
                  {result.emailDelivered
                    ? `Emailed ${result.email}`
                    : "Link ready to share"}
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Shareable link
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span
                        className="text-sm text-slate-700 truncate"
                        data-testid="text-quote-link"
                      >
                        {result.acceptUrl}
                      </span>
                    </div>
                    <IconButton
                      type="button"
                      variant="ghost"
                      label={copied ? "Copied" : "Copy link"}
                      onClick={copyUrl}
                      data-testid="button-copy-quote-link"
                      className="text-slate-600 hover:text-[color:var(--brand-blue)] shrink-0"
                    >
                      {copied ? <Check /> : <Copy />}
                    </IconButton>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    The link expires in 14 days and works once. Re-open this
                    dialog to mint a fresh one.
                  </p>
                </div>
              </div>
            )
          ) : (
            // ── Pre-mint: collect the recipient email + optional note ──
            <div className="space-y-4">
              <div>
                <Label
                  htmlFor="share-quote-email"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Artist email
                </Label>
                <Input
                  id="share-quote-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1"
                  data-testid="input-share-quote-email"
                />
              </div>
              <div>
                <Label
                  htmlFor="share-quote-note"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Note (optional)
                </Label>
                <Textarea
                  id="share-quote-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={`Hey ${artistName || "there"} — here are the Double LP quotes you asked about. Create your login and they'll be waiting.`}
                  className="mt-1 text-sm"
                  data-testid="textarea-share-quote-note"
                />
              </div>
              {unsavedDraftCount > 0 && (
                <p
                  className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                  data-testid="text-unsaved-warning"
                >
                  You have {unsavedDraftCount} unsaved{" "}
                  {unsavedDraftCount === 1 ? "format" : "formats"}. Only saved
                  formats travel with the link — save them first if you want
                  them included.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="button-close-quote-dialog"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-share-quote"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!canMint || mintMutation.isPending}
                  onClick={() => mintMutation.mutate({ email: email.trim(), note: note.trim() })}
                  data-testid="button-generate-quote-link"
                >
                  {mintMutation.isPending ? "Creating…" : "Generate link"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
