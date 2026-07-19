import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Linkedin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, apiErrorBody } from "@/lib/queryClient";
import {
  AddPeopleMenu,
  type AddPeopleMenuEntityKind,
} from "@/components/admin/AddPeopleMenu";

// Task #294 / #421 — shared "Contacts" panel rendered on every
// entity-detail admin page (vendor, press, label, fulfillment partner,
// NPO). Each page passes its own apiPath (e.g.
// `/api/vendors/abc-123/people`). Server-side, the path's `:id/people`
// segment maps to one of two generalised endpoints:
//   - /api/non-profits/...   → organization_people  (NPOs only)
//   - /api/<kind>/...        → entity_contacts      (every other kind)
// Both shapes return `{ personId, name, photoUrl, role, linkedinUrl? }`.
//
// Task #421 — the old "Search existing / Paste LinkedIn" tab strip is
// replaced by a unified `+ Add ▾` dropdown (AddPeopleMenu) with three
// items: Add Admin, Add Ambassador (NPO only), Invite Artist. The
// LinkedIn endpoint stays alive on the backend (linked profiles can
// still be surfaced on existing contacts and edited from AdminPerson)
// but is no longer how operators add a contact from here.

type Contact = {
  personId: string;
  name: string;
  photoUrl: string | null;
  linkedinUrl?: string | null;
  role: string | null;
  // Task #665 — set when this Person has a still-valid partner-scoped
  // admin_invite for the org owning the Contacts panel. Drives the
  // "Invite pending" chip + the copy-link mini-dialog reopen flow.
  contactEmail?: string | null;
  contactPhone?: string | null;
  invitePending?: boolean;
  inviteId?: string | null;
  acceptUrl?: string | null;
};

function humanizeApiError(err: unknown): string {
  const body = apiErrorBody<{ message?: string }>(err);
  if (body?.message && String(body.message).trim()) return String(body.message).trim();
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return raw.replace(/^\d{3}:\s*/, "") || "Something went wrong.";
}

// Each org kind's admin detail route. Used to build the breadcrumb
// back-link so a contact opened from a press/label/vendor Contacts tab
// returns to that org's People tab (not the global People catalog).
const PARTNER_ROUTE_BASE: Record<AddPeopleMenuEntityKind, string> = {
  manufacturer: "/admin/manufacturers",
  vendor: "/admin/vendors",
  label: "/admin/labels",
  manager: "/admin/managers",
  non_profit: "/admin/non-profits",
  fulfillment: "/admin/fulfillment-partners",
};

export interface OrganizationPeopleProps {
  /**
   * Base URL of the contacts collection, e.g.
   * `/api/vendors/abc-123/people` or `/api/non-profits/xyz/people`.
   * GET, POST, and DELETE all hang off this exact path (DELETE adds
   * `/:personId`).
   */
  apiPath: string;
  /** Unique kebab-case suffix for data-testid attributes ("vendor", "press", "npo", …). */
  testIdPrefix: string;
  /** Kind of partner that owns this panel — drives Add Ambassador visibility + invite referrer attribution. */
  entityKind: AddPeopleMenuEntityKind;
  /** Partner id (same id baked into apiPath, surfaced separately for the invite dialog). */
  entityId: string;
  /** Partner display name shown in dialog copy. */
  entityName: string;
  /** Optional section title — defaults to "Contacts". */
  title?: string;
  /** Optional one-liner under the title. */
  blurb?: string;
  /**
   * Task #2129 — whose voice this panel speaks in. "operator" (default)
   * is the third-person admin voice ("People who represent this partner");
   * "partner" is the second-person voice a partner sees in their own portal
   * ("People who represent you"). Only changes the default blurb — an
   * explicit `blurb` always wins.
   */
  voice?: "operator" | "partner";
  /**
   * Task #665 — gate the "+ Add ▾" menu. Defaults true (admin pages
   * are super_admin only). Partner shells fetch their own verb status
   * and pass false to hide the button for users without
   * `invite_subusers`. The server still enforces the verb on every
   * POST regardless of this flag.
   */
  canInviteSubusers?: boolean;
  /**
   * Task #699 — partner website URL, passed through to the Add Admin
   * dialog so a press can flag an email-domain mismatch. Optional.
   */
  entityWebsiteUrl?: string | null;
  /**
   * Task #699 — gate the "Add Admin" item separately. Press Staff can
   * invite artists (menu visible) but can't add admins. Defaults true.
   */
  canAddAdmins?: boolean;
  /**
   * Optional click handler for a contact name in voice="partner" mode.
   * When provided, the name renders as a button that calls this with the
   * person's id — lets portals navigate to a scoped person detail view.
   * When omitted, the name renders as a plain span (non-navigable).
   */
  onPersonClick?: (personId: string) => void;
}

export function OrganizationPeople({
  apiPath,
  testIdPrefix,
  entityKind,
  entityId,
  entityName,
  title = "Contacts",
  blurb,
  voice = "operator",
  canInviteSubusers = true,
  entityWebsiteUrl,
  canAddAdmins = true,
  onPersonClick,
}: OrganizationPeopleProps) {
  const resolvedBlurb =
    blurb ??
    (voice === "partner"
      ? "People who represent you. Add as many as you need."
      : "People who represent this partner. Add as many as you need.");
  const { toast } = useToast();
  const contactsKey = [apiPath] as const;
  const contactsQ = useQuery<Contact[]>({ queryKey: contactsKey });

  const attachedIds = useMemo(
    () => new Set((contactsQ.data ?? []).map((c) => c.personId)),
    [contactsQ.data],
  );

  // Task #665 — reopening the Invite-Ready state from the chip. Same
  // "Invite ready" surface AttachContactDialog flips to after a fresh
  // mint (URL + Copy), plus a Revoke button so operators can kill a
  // pending invite without leaving the Contacts panel.
  const [openInvite, setOpenInvite] = useState<{
    inviteId: string | null;
    personId: string;
    name: string;
    email: string;
    url: string;
  } | null>(null);

  const detach = useMutation({
    mutationFn: async (personId: string) => {
      await apiRequest("DELETE", `${apiPath}/${personId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKey }),
    onError: (err) =>
      toast({
        title: "Couldn't remove contact",
        description: humanizeApiError(err),
        variant: "destructive",
      }),
  });

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
      data-testid={`panel-${testIdPrefix}-contacts`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {resolvedBlurb && <p className="text-xs text-slate-500">{resolvedBlurb}</p>}
        </div>
        <AddPeopleMenu
          entityKind={entityKind}
          entityId={entityId}
          entityName={entityName}
          contactsApiPath={apiPath}
          contactsQueryKey={contactsKey}
          testIdPrefix={testIdPrefix}
          attachedIds={attachedIds}
          canInviteSubusers={canInviteSubusers}
          entityWebsiteUrl={entityWebsiteUrl}
          canAddAdmins={canAddAdmins}
        />
      </div>

      <ul className="divide-y divide-slate-100 -mx-1">
        {contactsQ.isLoading ? (
          <li className="px-1 py-2 text-xs text-slate-500">Loading…</li>
        ) : (contactsQ.data ?? []).length === 0 ? (
          <li
            className="px-1 py-2 text-xs text-slate-500"
            data-testid={`text-${testIdPrefix}-no-contacts`}
          >
            No contacts yet.
          </li>
        ) : (
          (contactsQ.data ?? []).map((c) => (
            <li
              key={c.personId}
              className="group flex items-center gap-3 px-1 py-2"
              data-testid={`row-${testIdPrefix}-contact-${c.personId}`}
            >
              {c.photoUrl ? (
                <img
                  src={c.photoUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover bg-slate-100"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-100" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {voice === "partner" ? (
                    onPersonClick ? (
                      <button
                        type="button"
                        onClick={() => onPersonClick(c.personId)}
                        className="text-sm font-semibold text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate block text-left"
                        data-testid={`link-${testIdPrefix}-contact-${c.personId}`}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <span className="text-sm font-semibold text-inherit truncate block" data-testid={`text-${testIdPrefix}-contact-${c.personId}`}>
                        {c.name}
                      </span>
                    )
                  ) : (
                    <Link href={`/admin/people/${c.personId}?from=partner&backHref=${encodeURIComponent(`${PARTNER_ROUTE_BASE[entityKind]}/${entityId}?tab=people`)}&backName=${encodeURIComponent(entityName)}`} className="text-sm font-semibold text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate block" data-testid={`link-${testIdPrefix}-contact-${c.personId}`}>
                      {c.name}
                    </Link>
                  )}
                  {c.invitePending && c.acceptUrl && (
                    <button
                      type="button"
                      onClick={() => setOpenInvite({
                        inviteId: c.inviteId ?? null,
                        personId: c.personId,
                        name: c.name,
                        email: c.contactEmail ?? "",
                        url: c.acceptUrl!,
                      })}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide flex-shrink-0"
                      data-testid={`chip-${testIdPrefix}-invite-pending-${c.personId}`}
                    >
                      Invite pending
                    </button>
                  )}
                </div>
                {c.role && <p className="text-xs text-slate-500 truncate">{c.role}</p>}
              </div>
              {c.linkedinUrl && (
                <a
                  href={c.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-[color:var(--brand-blue)]"
                  aria-label="Open LinkedIn profile"
                  data-testid={`link-${testIdPrefix}-contact-linkedin-${c.personId}`}
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => detach.mutate(c.personId)}
                disabled={detach.isPending}
                className="opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                data-testid={`button-${testIdPrefix}-remove-contact-${c.personId}`}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>
      <InvitePendingDialog
        open={!!openInvite}
        onOpenChange={(v) => !v && setOpenInvite(null)}
        invite={openInvite}
        testIdPrefix={testIdPrefix}
        onRevoked={() => {
          queryClient.invalidateQueries({ queryKey: contactsKey });
          setOpenInvite(null);
        }}
      />
    </section>
  );
}

function InvitePendingDialog({
  open,
  onOpenChange,
  invite,
  testIdPrefix,
  onRevoked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invite: { inviteId: string | null; personId: string; name: string; email: string; url: string } | null;
  testIdPrefix: string;
  onRevoked: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  async function copyUrl() {
    if (!invite?.url) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Select and copy the link manually.", variant: "destructive" });
    }
  }
  // Task #665 — revoke the pending invite from inside the reopen
  // dialog. DELETE /api/admin/invites/:id soft-revokes; the token is
  // immediately rejected at /api/invites/:token. Endpoint is super-admin
  // only on the server; partner-shell operators will see a clear
  // "Couldn't revoke" toast (the chip stays).
  const revoke = useMutation({
    mutationFn: async () => {
      if (!invite?.inviteId) throw new Error("No invite to revoke");
      await apiRequest("DELETE", `/api/admin/invites/${invite.inviteId}`);
    },
    onSuccess: () => {
      toast({ title: "Invite revoked" });
      onRevoked();
    },
    onError: (err) =>
      toast({
        title: "Couldn't revoke invite",
        description: humanizeApiError(err),
        variant: "destructive",
      }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={`dialog-${testIdPrefix}-invite-pending`}>
        <DialogHeader>
          <DialogTitle>Invite ready</DialogTitle>
          <DialogDescription>
            {invite
              ? `${invite.name} hasn't accepted yet${invite.email ? ` — sent to ${invite.email}` : ""}. Re-share this link if needed.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {invite && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Accept link</div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 min-w-0 text-xs text-slate-800 bg-white border border-slate-200 rounded-md px-2 py-1.5 truncate"
                data-testid={`text-${testIdPrefix}-invite-pending-url`}
              >{invite.url}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copyUrl}
                data-testid={`button-${testIdPrefix}-invite-pending-copy`}
              >
                {copied ? (<><Check className="w-3.5 h-3.5 mr-1.5" /> Copied</>) : (<><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>)}
              </Button>
            </div>
            <p className="text-xs text-slate-500 leading-snug">
              Valid for 14 days from when it was created.
            </p>
          </div>
        )}
        <DialogFooter className="sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => revoke.mutate()}
            disabled={!invite?.inviteId || revoke.isPending}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            data-testid={`button-${testIdPrefix}-invite-pending-revoke`}
          >
            {revoke.isPending ? "Revoking…" : "Revoke invite"}
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            data-testid={`button-${testIdPrefix}-invite-pending-done`}
          >Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
