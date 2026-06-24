import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, X, RefreshCw, Trash2, Clock } from "lucide-react";

// Task #1020 — "Invite to this artist" affordance. Lives on the
// Permissions tab of AdminPerson so an operator can grant someone
// access to a specific artist without leaving the page and without
// risking scoping the invite to the wrong artist. The scope is
// pre-filled and HARD-LOCKED to the Person being viewed (role=artist,
// roleScopeId=targetPersonId=this person). Only the invite sub-role
// (Manager / Team / Identity), email, and an optional welcome note are
// operator-editable. Sends through the same /api/admin/invites
// endpoint the global Invites page uses, so the recipient gets the
// identical invite email + accept flow.
//
// This is the Nightbirde scenario: the artist never logs in, but her
// father (full control) and brother (limited) each get their own login
// scoped to her profile.

interface RoleInfo {
  role: "super_admin" | "admin" | "label" | "artist" | "manufacturer" | "fulfillment";
  roleScopeId: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  inviteRole: string | null;
  reviewStatus: string | null;
  expiresAt: string;
  resentAt: string | null;
}

interface Props {
  personId: string;
  personName: string;
}

// Invite sub-roles, in the order the task asks for them. Each maps onto
// the existing team-invite `inviteRole` value; the role-to-verb defaults
// behind each are unchanged (see docs/roles-and-permissions.md).
const INVITE_ROLES: Array<{ value: "manager" | "team" | "identity" | "label"; label: string; hint: string }> = [
  {
    value: "manager",
    label: "Manager",
    hint: "Manages the artist — edit catalog, releases, and payouts on their behalf.",
  },
  {
    value: "team",
    label: "Team",
    hint: "Band or team member — credits and gear only, no catalog or payout control.",
  },
  {
    value: "identity",
    label: "Identity",
    hint: "This person IS the artist — full control of the profile.",
  },
  {
    value: "label",
    label: "Label",
    hint: "The artist's record label — recognition only, no editing permissions.",
  },
];

const INVITE_ROLE_LABEL: Record<string, string> = Object.fromEntries(
  INVITE_ROLES.map((r) => [r.value, r.label]),
);

export function InviteToArtistPanel({ personId, personName }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: role } = useQuery<RoleInfo>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "team" | "identity" | "label">("manager");
  const [welcomeNote, setWelcomeNote] = useState("");

  // Reuse the same query key the global Invites page uses so a send here
  // (and any revoke / resend) keeps both surfaces in sync. We filter to
  // this artist client-side.
  const invitesKey = ["/api/admin/invites"];
  const { data: allInvites = [] } = useQuery<PendingInvite[]>({
    queryKey: invitesKey,
    enabled: isSuperAdmin,
  });
  const artistInvites = allInvites.filter(
    (i) => i.role === "artist" && i.roleScopeId === personId,
  );

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/invites", {
        email: email.trim(),
        role: "artist",
        roleScopeId: personId,
        targetPersonId: personId,
        inviteRole,
        welcomeNote: welcomeNote.trim() || null,
      });
      return r.json() as Promise<{
        email: string;
        emailDelivered: boolean;
        reviewStatus?: string;
        claimedReason?: string | null;
      }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: invitesKey });
      qc.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      setEmail("");
      setWelcomeNote("");
      setInviteRole("manager");
      setOpen(false);
      toast({
        title:
          data.reviewStatus === "pending_review"
            ? "Held for review"
            : data.emailDelivered
              ? "Invite sent"
              : "Invite created (email failed)",
        description:
          data.reviewStatus === "pending_review"
            ? `${data.claimedReason || "Needs super-admin approval"} — the email won't go out until approved.`
            : data.emailDelivered
              ? `Emailed ${data.email} for ${personName}.`
              : `${data.email} — couldn't email automatically, resend from the Invites page.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not send invite", description: e.message, variant: "destructive" });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invitesKey });
      toast({ title: "Invite revoked" });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/invites/${id}/resend`);
      return r.json();
    },
    onSuccess: (data: { emailDelivered: boolean }) => {
      qc.invalidateQueries({ queryKey: invitesKey });
      toast({ title: data.emailDelivered ? "Invite re-sent" : "Re-sent (email failed)" });
    },
    onError: (e: Error) => toast({ title: "Resend failed", description: e.message, variant: "destructive" }),
  });

  // Non-super-admins can't read the invites list (the endpoint 403s) and
  // can't issue cross-scope grants here, so the panel hides itself.
  if (!isSuperAdmin) return null;

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSend = emailRe.test(email.trim()) && !create.isPending;

  return (
    <Card className="p-6 mt-6 bg-white border border-slate-200" data-testid="card-invite-to-artist">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Invite to this artist</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Give someone their own login scoped to{" "}
            <span className="font-medium text-slate-700">{personName}</span>. The invite is locked to this
            artist — you can't accidentally scope it elsewhere.
          </p>
        </div>
        {!open && (
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-[var(--brand-blue)] text-white hover:opacity-90 flex-shrink-0"
            data-testid="button-open-invite-to-artist"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Invite
          </Button>
        )}
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) create.mutate();
          }}
          className="mt-4 pt-4 border-t border-slate-100"
          data-testid="form-invite-to-artist"
        >
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="text-sm font-semibold text-slate-700">New invite</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close invite form"
              data-testid="button-close-invite-to-artist"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@example.com"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            data-testid="input-invite-to-artist-email"
          />

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-4">
            Access level
          </label>
          <div className="space-y-2" data-testid="invite-to-artist-role-grid">
            {INVITE_ROLES.map((r) => {
              const selected = inviteRole === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setInviteRole(r.value)}
                  aria-pressed={selected}
                  className={[
                    "w-full flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 ring-1 ring-[var(--brand-blue)]/30"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                  data-testid={`button-invite-role-${r.value}`}
                >
                  <span className="text-sm font-semibold text-slate-900">{r.label}</span>
                  <span className="text-xs text-slate-500 leading-snug">{r.hint}</span>
                </button>
              );
            })}
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-4">
            Personal note (optional)
          </label>
          <textarea
            value={welcomeNote}
            onChange={(e) => setWelcomeNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Hi — adding you so you can keep an eye on the profile."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20 text-sm"
            data-testid="textarea-invite-to-artist-note"
          />
          <p className="mt-1 text-xs text-slate-500">They'll see this on their first sign-in.</p>

          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
              className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              data-testid="button-cancel-invite-to-artist"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSend}
              className="bg-[var(--brand-blue)] text-white hover:opacity-90"
              data-testid="button-send-invite-to-artist"
            >
              {create.isPending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      )}

      {/* Outstanding invites for THIS artist — so the operator can see
          who's already been invited and avoid duplicates. */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">
          Outstanding invites
          {artistInvites.length > 0 && (
            <span className="ml-1 text-slate-400 font-normal">({artistInvites.length})</span>
          )}
        </h3>
        {artistInvites.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="text-no-artist-invites">
            No outstanding invites for {personName}. Send one above and it'll
            appear here with resend (↻) and revoke controls on its row.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="list-artist-invites">
            {artistInvites.map((inv) => {
              const expires = new Date(inv.expiresAt);
              const expired = expires < new Date();
              const held = inv.reviewStatus === "pending_review";
              return (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 py-2.5"
                  data-testid={`row-artist-invite-${inv.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{inv.email}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span data-testid={`text-artist-invite-role-${inv.id}`}>
                        {inv.inviteRole ? INVITE_ROLE_LABEL[inv.inviteRole] || inv.inviteRole : "Artist"}
                      </span>
                      <span className="mx-1.5">·</span>
                      {held ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="w-3 h-3" /> held for review
                        </span>
                      ) : (
                        <span className={expired ? "text-rose-600" : ""}>
                          {expired ? "expired" : `expires ${expires.toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {!held && (
                    <button
                      type="button"
                      onClick={() => resend.mutate(inv.id)}
                      disabled={resend.isPending}
                      className="p-1.5 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 transition-colors"
                      title="Resend invite"
                      aria-label="Resend invite"
                      data-testid={`button-resend-artist-invite-${inv.id}`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => revoke.mutate(inv.id)}
                    disabled={revoke.isPending}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Revoke invite"
                    aria-label="Revoke invite"
                    data-testid={`button-revoke-artist-invite-${inv.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
