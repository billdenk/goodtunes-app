import { useMemo } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
};

function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body?.message) return String(body.message);
    } catch {
      /* fall through */
    }
    return m[1];
  }
  return raw || "Something went wrong.";
}

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
}

export function OrganizationPeople({
  apiPath,
  testIdPrefix,
  entityKind,
  entityId,
  entityName,
  title = "Contacts",
  blurb = "People who represent this partner. Add as many as you need.",
}: OrganizationPeopleProps) {
  const { toast } = useToast();
  const contactsKey = [apiPath] as const;
  const contactsQ = useQuery<Contact[]>({ queryKey: contactsKey });

  const attachedIds = useMemo(
    () => new Set((contactsQ.data ?? []).map((c) => c.personId)),
    [contactsQ.data],
  );

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
          {blurb && <p className="text-xs text-slate-500">{blurb}</p>}
        </div>
        <AddPeopleMenu
          entityKind={entityKind}
          entityId={entityId}
          entityName={entityName}
          contactsApiPath={apiPath}
          contactsQueryKey={contactsKey}
          testIdPrefix={testIdPrefix}
          attachedIds={attachedIds}
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
              className="flex items-center gap-3 px-1 py-2"
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
                <Link href={`/admin/people/${c.personId}`} className="text-sm font-semibold text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate block" data-testid={`link-${testIdPrefix}-contact-${c.personId}`}>
                  {c.name}
                </Link>
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
                data-testid={`button-${testIdPrefix}-remove-contact-${c.personId}`}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
