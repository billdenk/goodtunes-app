import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Receipt,
  Plus,
  Send,
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  Ban,
  RefreshCw,
  Copy,
  Disc3,
} from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PersonPicker, type PersonLite } from "@/components/admin/AddPeopleMenu";

type PaymentRequestRow = {
  id: string;
  createdByUserId: string;
  recipientPersonId: string;
  recipientEmail: string;
  recipientName: string;
  recipientPhotoUrl: string | null;
  amountCents: number;
  currency: string;
  description: string;
  albumId: string | null;
  albumTitle: string | null;
  stripePaymentLinkId: string | null;
  stripePaymentLinkUrl: string | null;
  status: "pending" | "paid" | "cancelled";
  paidAt: string | null;
  stripeCheckoutSessionId: string | null;
  createdAt: string;
};

type AlbumOption = { id: string; title: string };

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: PaymentRequestRow["status"] }) {
  if (status === "paid") {
    return (
      <Badge className="bg-[var(--apple-ready)]/10 text-[var(--apple-ready)] border border-[var(--apple-ready)]/20 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Paid
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="text-[var(--apple-faint)] gap-1">
        <Ban className="w-3 h-3" /> Cancelled
      </Badge>
    );
  }
  return (
    <Badge className="bg-[var(--apple-warning)]/10 text-[var(--apple-warning)] border border-[var(--apple-warning)]/20 gap-1">
      <Clock className="w-3 h-3" /> Pending
    </Badge>
  );
}

export default function AdminPaymentRequests() {
  const { toast } = useToast();

  // ── New-request sheet state ──────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recipient, setRecipient] = useState<PersonLite | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [albumSearch, setAlbumSearch] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumOption | null>(null);
  const [albumDropdownOpen, setAlbumDropdownOpen] = useState(false);

  // ── Created payment link confirmation dialog ─────────────────────────
  const [createdLink, setCreatedLink] = useState<{ url: string; recipient: string; amount: number } | null>(null);

  // ── Cancel confirm state ─────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<PaymentRequestRow | null>(null);

  const { data: requests = [], isLoading } = useQuery<PaymentRequestRow[]>({
    queryKey: ["/api/admin/payment-requests"],
  });

  // Album search query
  const { data: albumOptions = [] } = useQuery<AlbumOption[]>({
    queryKey: ["/api/admin/payment-requests/albums-search", albumSearch],
    queryFn: () =>
      fetch(`/api/admin/payment-requests/albums-search?q=${encodeURIComponent(albumSearch)}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: albumDropdownOpen,
  });

  function resetForm() {
    setRecipient(null);
    setAmountStr("");
    setDescription("");
    setSelectedAlbum(null);
    setAlbumSearch("");
    setAlbumDropdownOpen(false);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const dollars = parseFloat(amountStr.replace(/[$,]/g, ""));
      if (!recipient) throw new Error("Choose a recipient");
      if (isNaN(dollars) || dollars <= 0) throw new Error("Enter a valid amount");
      if (!description.trim()) throw new Error("Description is required");
      const amountCents = Math.round(dollars * 100);
      const res = await apiRequest("POST", "/api/admin/payment-requests", {
        recipientPersonId: recipient.id,
        amountCents,
        description: description.trim(),
        albumId: selectedAlbum?.id ?? null,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? "Failed to create request");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-requests"] });
      const recipientName = recipient?.name ?? "the artist";
      const amountCents = Math.round(parseFloat(amountStr.replace(/[$,]/g, "")) * 100);
      setSheetOpen(false);
      resetForm();
      // Show a confirmation dialog with the created payment URL
      if (data.paymentUrl) {
        setCreatedLink({ url: data.paymentUrl, recipient: recipientName, amount: amountCents });
      } else {
        toast({ title: "Payment request sent", description: `Invoice emailed to ${recipientName}` });
      }
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/payment-requests/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? "Failed to cancel");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-requests"] });
      setCancelTarget(null);
      toast({ title: "Request cancelled" });
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const resendMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/payment-requests/${id}/resend`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? "Failed to resend");
      }
    },
    onSuccess: () => {
      toast({ title: "Email resent" });
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied" }),
      () => toast({ title: "Could not copy", variant: "destructive" }),
    );
  }

  return (
    <AdminFrame active="payment-requests">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <AdminPageHeader
          title="Payment requests."
          subtitle="Send one-off invoices to artists via Stripe Payment Links."
          actions={
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setSheetOpen(true)}
              data-testid="button-new-payment-request"
            >
              <Plus className="w-4 h-4" />
              New request
            </Button>
          }
        />

        {/* ── List ── */}
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-[var(--apple-track)] animate-pulse" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <AdminEmptyState>No payment requests yet — click "New request" to send an invoice.</AdminEmptyState>
        ) : (
          <div className="divide-y divide-[var(--apple-hairline)] border border-[var(--apple-hairline)] rounded-2xl overflow-hidden">
            {requests.map((pr) => (
              <div key={pr.id} className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-[var(--apple-track)] transition-colors">
                {/* Avatar */}
                <Avatar className="h-9 w-9 flex-shrink-0">
                  {pr.recipientPhotoUrl && (
                    <AvatarImage src={pr.recipientPhotoUrl} alt={pr.recipientName} />
                  )}
                  <AvatarFallback className="text-xs bg-[var(--apple-track)] text-[var(--apple-subink)]">
                    {pr.recipientName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-[var(--apple-ink)] truncate">{pr.recipientName}</span>
                    <StatusBadge status={pr.status} />
                  </div>
                  <div className="text-xs text-[var(--apple-subink)] truncate mt-0.5">
                    {pr.description}
                    {pr.albumTitle && (
                      <span className="text-[var(--apple-faint)]"> · <Disc3 className="inline w-3 h-3 mb-0.5" /> {pr.albumTitle}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--apple-faint)] mt-0.5">{pr.recipientEmail} · {formatDate(pr.createdAt)}</div>
                </div>

                {/* Amount */}
                <div className="text-sm font-semibold tabular-nums text-[var(--apple-ink)] flex-shrink-0 w-20 text-right">
                  {formatCents(pr.amountCents)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {pr.stripePaymentLinkUrl && pr.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Copy payment link"
                        onClick={() => copyLink(pr.stripePaymentLinkUrl!)}
                        data-testid={`button-copy-link-${pr.id}`}
                      >
                        <Copy className="w-3.5 h-3.5 text-[var(--apple-subink)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Open payment link"
                        onClick={() => window.open(pr.stripePaymentLinkUrl!, "_blank")}
                        data-testid={`button-open-link-${pr.id}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[var(--apple-subink)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Resend email"
                        disabled={resendMut.isPending}
                        onClick={() => resendMut.mutate(pr.id)}
                        data-testid={`button-resend-${pr.id}`}
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[var(--apple-subink)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Cancel request"
                        onClick={() => setCancelTarget(pr)}
                        data-testid={`button-cancel-${pr.id}`}
                      >
                        <X className="w-3.5 h-3.5 text-[var(--apple-critical)]" />
                      </Button>
                    </>
                  )}
                  {pr.status === "paid" && pr.paidAt && (
                    <span className="text-xs text-[var(--apple-faint)]">Paid {formatDate(pr.paidAt)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Request Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o); }}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>New Payment Request</SheetTitle>
            <SheetDescription>
              A Stripe Payment Link will be created and the artist will receive an invoice by email. The link deactivates automatically after payment.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5">
            {/* Recipient picker */}
            <div className="space-y-2">
              <Label>Recipient</Label>
              <PersonPicker
                value={recipient}
                onChange={setRecipient}
                excludeIds={new Set()}
                testIdPrefix="payment-request"
                hidePaste
                pasteSecondary
              />
              {recipient && (
                <p className="text-xs text-[var(--apple-subink)]">
                  Invoice will be emailed to the contact email on file for {recipient.name}.
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="pr-amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--apple-faint)] text-sm">$</span>
                <Input
                  id="pr-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="pl-6"
                  data-testid="input-payment-amount"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="pr-description">Description</Label>
              <Textarea
                id="pr-description"
                placeholder="e.g. MRP vinyl setup fee for Blackout EP"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                data-testid="input-payment-description"
              />
              <p className="text-xs text-[var(--apple-faint)]">Shown on the invoice and in the Stripe payment page.</p>
            </div>

            {/* Album (optional) */}
            <div className="space-y-2">
              <Label htmlFor="pr-album">
                Album <span className="text-[var(--apple-faint)] font-normal">(optional)</span>
              </Label>
              {selectedAlbum ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--apple-hairline)] bg-[var(--apple-track)] px-3 py-2">
                  <Disc3 className="w-4 h-4 text-[var(--apple-faint)] flex-shrink-0" />
                  <span className="text-sm text-[var(--apple-ink)] flex-1 truncate">{selectedAlbum.title}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedAlbum(null); setAlbumSearch(""); }}
                    className="text-[var(--apple-faint)] hover:text-[var(--apple-subink)]"
                    data-testid="button-clear-album"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="pr-album"
                    placeholder="Search albums…"
                    value={albumSearch}
                    onChange={(e) => { setAlbumSearch(e.target.value); setAlbumDropdownOpen(true); }}
                    onFocus={() => setAlbumDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setAlbumDropdownOpen(false), 150)}
                    autoComplete="off"
                    data-testid="input-album-search"
                  />
                  {albumDropdownOpen && albumOptions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-[var(--apple-hairline)] bg-white shadow-lg max-h-48 overflow-y-auto">
                      {albumOptions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onMouseDown={() => { setSelectedAlbum(a); setAlbumSearch(""); setAlbumDropdownOpen(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--apple-track)]"
                          data-testid={`album-option-${a.id}`}
                        >
                          <Disc3 className="w-3.5 h-3.5 text-[var(--apple-faint)] flex-shrink-0" />
                          {a.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--apple-faint)]">Links this invoice to a specific release for reference.</p>
            </div>
          </div>

          <SheetFooter className="mt-8 flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => { resetForm(); setSheetOpen(false); }}
              data-testid="button-cancel-sheet"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !recipient || !amountStr || !description}
              className="gap-1.5"
              data-testid="button-send-payment-request"
            >
              {createMut.isPending ? (
                <>Sending…</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send request
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Created confirmation dialog (shows the payment URL) ── */}
      <Dialog open={!!createdLink} onOpenChange={(o) => { if (!o) setCreatedLink(null); }}>
        <DialogContent className="max-w-md rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[17px] font-semibold text-[var(--apple-ink)]">
              <CheckCircle2 className="w-5 h-5 text-[var(--apple-ready)]" />
              Payment request sent
            </DialogTitle>
            <DialogDescription>
              An invoice for <strong>{createdLink ? formatCents(createdLink.amount) : ""}</strong> was emailed to{" "}
              <strong>{createdLink?.recipient}</strong>. You can also share the link directly.
            </DialogDescription>
          </DialogHeader>
          {createdLink && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--apple-hairline)] bg-[var(--apple-track)] px-3 py-2 mt-2">
              <span className="text-xs text-[var(--apple-subink)] flex-1 truncate font-mono">{createdLink.url}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 flex-shrink-0"
                onClick={() => copyLink(createdLink.url)}
                data-testid="button-copy-created-link"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 flex-shrink-0"
                onClick={() => window.open(createdLink.url, "_blank")}
                data-testid="button-open-created-link"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <DialogFooter className="mt-2">
            <Button onClick={() => setCreatedLink(null)} data-testid="button-close-created-dialog">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Cancel this payment request?</AlertDialogTitle>
            <AlertDialogDescription>
              The Stripe payment link will be deactivated and the recipient will no longer be able to pay.
              {cancelTarget && (
                <span className="block mt-2 font-medium text-[var(--apple-ink)]">
                  {cancelTarget.recipientName} — {formatCents(cancelTarget.amountCents)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-dismiss">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/15"
              disabled={cancelMut.isPending}
              onClick={() => cancelTarget && cancelMut.mutate(cancelTarget.id)}
              data-testid="button-confirm-cancel"
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}
