import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Linkedin, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Task #294 — shared "Contacts" panel rendered on every entity-detail
// admin page (vendor, press, label, fulfillment partner, NPO). Each
// page passes its own apiPath (e.g. `/api/vendors/abc-123/people`).
// Server-side, the path's `:id/people` segment maps to one of two
// generalised endpoints:
//   - /api/non-profits/...   → organization_people  (NPOs only)
//   - /api/<kind>/...        → entity_contacts      (every other kind)
// Both shapes return `{ personId, name, photoUrl, role, linkedinUrl? }`
// so this component doesn't need to know which is which.
//
// Add-flow: two tabs.
//   1. "Search" — type-ahead against /api/people (existing directory).
//   2. "LinkedIn" — paste a public profile URL; we scrape OG tags
//      (name / headline / avatar) and rehost the avatar. If LinkedIn
//      blocks the scrape we fall back to a name-derived-from-slug stub
//      so the admin can still create the Person + save the link in a
//      single step. The /api/admin/people/from-linkedin endpoint
//      dedupes by canonical URL so re-pasting the same profile snaps
//      back to the existing Person.

type Contact = {
  personId: string;
  name: string;
  photoUrl: string | null;
  linkedinUrl?: string | null;
  role: string | null;
};

type PersonLite = {
  id: string;
  name: string;
  photoUrl: string | null;
};

type ScrapeResult = {
  linkedinUrl: string;
  name: string | null;
  headline: string | null;
  photoUrl: string | null;
  fellBack: boolean;
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
  /** Optional section title — defaults to "Contacts". */
  title?: string;
  /** Optional one-liner under the title. */
  blurb?: string;
}

export function OrganizationPeople({
  apiPath,
  testIdPrefix,
  title = "Contacts",
  blurb = "People who represent this partner. Add as many as you need.",
}: OrganizationPeopleProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"search" | "linkedin">("search");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [linkedinInput, setLinkedinInput] = useState("");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);

  const contactsKey = [apiPath] as const;
  const contactsQ = useQuery<Contact[]>({ queryKey: contactsKey });
  const peopleQ = useQuery<PersonLite[]>({ queryKey: ["/api/people"] });

  const attached = useMemo(
    () => new Set((contactsQ.data ?? []).map((c) => c.personId)),
    [contactsQ.data],
  );
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as PersonLite[];
    return (peopleQ.data ?? [])
      .filter((p) => !attached.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, peopleQ.data, attached]);

  const attach = useMutation({
    mutationFn: async (vars: { personId: string; role: string | null }) => {
      const res = await apiRequest("POST", apiPath, vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactsKey });
      setSearch("");
      setRole("");
      setLinkedinInput("");
      setScrape(null);
    },
    onError: (err) =>
      toast({
        title: "Couldn't add contact",
        description: humanizeApiError(err),
        variant: "destructive",
      }),
  });

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

  const lookup = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/admin/people/scrape-linkedin", { url });
      return (await res.json()) as ScrapeResult;
    },
    onSuccess: (data) => setScrape(data),
    onError: (err) =>
      toast({
        title: "Couldn't read that LinkedIn URL",
        description: humanizeApiError(err),
        variant: "destructive",
      }),
  });

  const createFromLinkedin = useMutation({
    mutationFn: async () => {
      if (!scrape) throw new Error("No preview to create from");
      const res = await apiRequest("POST", "/api/admin/people/from-linkedin", {
        linkedinUrl: scrape.linkedinUrl,
        name: scrape.name,
        headline: scrape.headline,
        photoUrl: scrape.photoUrl,
      });
      return (await res.json()) as { id: string };
    },
    onSuccess: (person) => {
      attach.mutate({ personId: person.id, role: role.trim() || null });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    },
    onError: (err) =>
      toast({
        title: "Couldn't add LinkedIn contact",
        description: humanizeApiError(err),
        variant: "destructive",
      }),
  });

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
      data-testid={`panel-${testIdPrefix}-contacts`}
    >
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {blurb && <p className="text-xs text-slate-500">{blurb}</p>}
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
                <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-100" />
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

      <div className="border-t border-slate-100 pt-3 space-y-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">Add a contact</p>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("search")}
            className={[
              "flex-1 rounded-md px-3 py-1.5 transition-colors",
              mode === "search" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
            data-testid={`tab-${testIdPrefix}-add-search`}
          >
            Search existing
          </button>
          <button
            type="button"
            onClick={() => setMode("linkedin")}
            className={[
              "flex-1 rounded-md px-3 py-1.5 transition-colors inline-flex items-center justify-center gap-1.5",
              mode === "linkedin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
            data-testid={`tab-${testIdPrefix}-add-linkedin`}
          >
            <Linkedin className="w-3.5 h-3.5" />
            Paste LinkedIn
          </button>
        </div>

        {mode === "search" && (
          <>
            <Input
              type="text"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid={`input-${testIdPrefix}-contact-search`}
            />
            {search.trim() && (
              <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                {peopleQ.isLoading ? (
                  <li className="px-3 py-2 text-xs text-slate-500">Loading people…</li>
                ) : matches.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-slate-500">No matches.</li>
                ) : (
                  matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => attach.mutate({ personId: p.id, role: role.trim() || null })}
                        disabled={attach.isPending}
                        data-testid={`button-${testIdPrefix}-attach-person-${p.id}`}
                      >
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-100" />
                        )}
                        <span className="text-sm text-slate-900">{p.name}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <Input
              type="text"
              placeholder="Role (optional, e.g. Director)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              data-testid={`input-${testIdPrefix}-contact-role`}
            />
            <p className="text-xs text-slate-500">
              Don't see them?{" "}
              <Link href="/admin/people" className="text-[var(--brand-blue)] hover:underline underline-offset-2">
                Add the person first
              </Link>
              , then come back here.
            </p>
          </>
        )}

        {mode === "linkedin" && (
          <>
            {!scrape ? (
              <>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://www.linkedin.com/in/…"
                    value={linkedinInput}
                    onChange={(e) => setLinkedinInput(e.target.value)}
                    data-testid={`input-${testIdPrefix}-linkedin-url`}
                  />
                  <Button
                    type="button"
                    onClick={() => lookup.mutate(linkedinInput.trim())}
                    disabled={!linkedinInput.trim() || lookup.isPending}
                    data-testid={`button-${testIdPrefix}-linkedin-lookup`}
                  >
                    {lookup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  We'll read the public profile and create a Person if it doesn't already exist.
                </p>
              </>
            ) : (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3"
                data-testid={`preview-${testIdPrefix}-linkedin`}
              >
                <div className="flex items-start gap-3">
                  {scrape.photoUrl ? (
                    <img src={scrape.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover bg-white" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white ring-1 ring-slate-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Input
                      type="text"
                      value={scrape.name ?? ""}
                      onChange={(e) => setScrape({ ...scrape, name: e.target.value })}
                      placeholder="Full name"
                      className="font-semibold"
                      data-testid={`input-${testIdPrefix}-linkedin-name`}
                    />
                    {scrape.headline && (
                      <p className="mt-1 text-xs text-slate-500 truncate">{scrape.headline}</p>
                    )}
                    <a
                      href={scrape.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                      data-testid={`link-${testIdPrefix}-linkedin-preview`}
                    >
                      <Linkedin className="w-3 h-3" />
                      {scrape.linkedinUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScrape(null)}
                    className="text-slate-400 hover:text-slate-600 -mt-1"
                    aria-label="Cancel preview"
                    data-testid={`button-${testIdPrefix}-linkedin-cancel`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {scrape.fellBack && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    LinkedIn blocked the scrape — we filled the name from the URL. Edit it before saving and we'll still save the link.
                  </p>
                )}
                <Input
                  type="text"
                  placeholder="Role (optional, e.g. Director)"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  data-testid={`input-${testIdPrefix}-linkedin-role`}
                />
                <Button
                  type="button"
                  onClick={() => createFromLinkedin.mutate()}
                  disabled={
                    !scrape.name?.trim() ||
                    createFromLinkedin.isPending ||
                    attach.isPending
                  }
                  className="w-full"
                  data-testid={`button-${testIdPrefix}-linkedin-create`}
                >
                  {createFromLinkedin.isPending || attach.isPending
                    ? "Adding…"
                    : "Add contact"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
