import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Heart, Pencil } from "lucide-react";
import { ReferralSummaryPanel } from "@/pages/AdminPerson";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

// Task #78 — Super-admin detail page for a non-profit partner.
// Task #283 brings it under AdminFrame (narrow) with the standard
// breadcrumb + thumbnail-pencil header that Presses, Makers, and
// Resellers use.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

type PersonLite = {
  id: string;
  name: string;
  photoUrl: string | null;
};

type NpoContact = {
  personId: string;
  name: string;
  photoUrl: string | null;
  role: string | null;
};

export default function AdminNonProfit() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { id } = useParams<{ id: string }>();
  const npoQ = useQuery<NonProfit>({ queryKey: [`/api/non-profits/${id}`] });
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);

  if (npoQ.isLoading) {
    return (
      <AdminFrame active="nonprofits" contentWidth="narrow">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (npoQ.error || !npoQ.data) {
    return (
      <AdminFrame active="nonprofits" contentWidth="narrow">
        <div className="py-20 text-center space-y-2">
          <p className="text-sm text-rose-700">
            {(npoQ.error as Error)?.message ?? "Not found"}
          </p>
          <Link href="/admin/non-profits" className="text-[var(--brand-blue)] text-sm hover:underline underline-offset-2">
            ← Back to NPOs
          </Link>
        </div>
      </AdminFrame>
    );
  }

  const npo = npoQ.data;
  const invalidateNpo = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/non-profits/${id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/non-profits"] });
  };

  return (
    <AdminFrame active="nonprofits" contentWidth="narrow">
      <div className="space-y-5" data-testid="page-admin-non-profit">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <Link href="/admin/non-profits" className="hover:text-slate-700 hover:underline underline-offset-2">
            NPOs
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {npo.name}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 group"
            data-testid="button-edit-npo-logo"
            aria-label="Edit logo"
          >
            {npo.logoUrl ? (
              <img
                src={npo.logoUrl}
                alt={npo.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Heart className="w-7 h-7 text-slate-300" strokeWidth={1.5} />
            )}
            <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
              <Pencil className="w-4 h-4" />
            </span>
          </button>
          <PressLogoEditorDialog
            name={npo.name}
            logoUrl={npo.logoUrl}
            apiPath={`/api/non-profits/${npo.id}`}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
            onInvalidate={invalidateNpo}
            FallbackIcon={Heart}
            testIdPrefix="npo"
            hint="Square works best — shown on the NPOs list and anywhere this partner is credited."
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Non-profit
            </div>
            <h1
              className="text-2xl font-bold text-slate-900 truncate"
              data-testid="text-npo-admin-name"
            >
              {npo.name}
            </h1>
            {npo.websiteUrl && (
              <a
                href={npo.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                data-testid="link-npo-website"
              >
                {npo.websiteUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <ContactsPanel npoId={npo.id} />

        <ReferralSummaryPanel kind="non_profit" id={npo.id} />
      </div>
    </AdminFrame>
  );
}

function ContactsPanel({ npoId }: { npoId: string }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  const contactsKey = [`/api/non-profits/${npoId}/people`] as const;
  const contactsQ = useQuery<NpoContact[]>({ queryKey: contactsKey });

  // /api/people returns the whole directory; we filter client-side. Same
  // pattern AdminPeople uses for its top-of-page search.
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
      const res = await apiRequest("POST", `/api/non-profits/${npoId}/people`, vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactsKey });
      setSearch("");
      setRole("");
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
      await apiRequest("DELETE", `/api/non-profits/${npoId}/people/${personId}`);
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
      data-testid="panel-npo-contacts"
    >
      <div>
        <h2 className="text-sm font-bold text-slate-900">Contacts</h2>
        <p className="text-xs text-slate-500">
          People who represent this NPO. Add as many as you need.
        </p>
      </div>

      <ul className="divide-y divide-slate-100 -mx-1">
        {contactsQ.isLoading ? (
          <li className="px-1 py-2 text-xs text-slate-500">Loading…</li>
        ) : (contactsQ.data ?? []).length === 0 ? (
          <li className="px-1 py-2 text-xs text-slate-500" data-testid="text-no-contacts">
            No contacts yet.
          </li>
        ) : (
          (contactsQ.data ?? []).map((c) => (
            <li
              key={c.personId}
              className="flex items-center gap-3 px-1 py-2"
              data-testid={`row-npo-contact-${c.personId}`}
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
                <Link href={`/admin/people/${c.personId}`} className="text-sm font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 truncate block">
                  {c.name}
                </Link>
                {c.role && <p className="text-xs text-slate-500 truncate">{c.role}</p>}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => detach.mutate(c.personId)}
                disabled={detach.isPending}
                data-testid={`button-remove-contact-${c.personId}`}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Add a contact
        </p>
        <Input
          type="text"
          placeholder="Search people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-npo-contact-search"
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
                    data-testid={`button-attach-person-${p.id}`}
                  >
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover bg-slate-100"
                      />
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
          data-testid="input-npo-contact-role"
        />
        <p className="text-xs text-slate-500">
          Don't see them?{" "}
          <Link href="/admin/people" className="text-[var(--brand-blue)] hover:underline underline-offset-2">
            Add the person first
          </Link>
          , then come back here.
        </p>
      </div>
    </section>
  );
}
