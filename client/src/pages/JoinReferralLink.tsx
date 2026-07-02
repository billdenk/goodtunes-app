// Task #2399 — Public branded landing page for reusable referral links.
// Task #2422 — Ownership proof + evidence links.
// Route: /join/:code (public, no auth required on admin host).
//
// Flow:
//   1. Loads branding via GET /api/public/referral/:code
//   2. Fan fills in name + email + optional Spotify self-identification
//   3. Optional: adds evidence links (website, streaming, distributor)
//   4. Optional: proves channel ownership (social bio / domain DNS)
//   5. POST /api/public/referral/:code/apply → pending artist_applications row
//   6. "Thanks — we'll be in touch" confirmation state

import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Loader2, Music2, Search, X, Check, ChevronDown, ChevronUp,
  Globe, Link2, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReferralInfo {
  code: string;
  referrerKind: string;
  branding: {
    name: string;
    photoUrl: string | null;
    orgName: string | null;
  };
}

interface SpotifyCandidate {
  id: string;
  name: string;
  imageUrl: string | null;
  followers: number | null;
  spotifyUrl: string | null;
  genres: string[];
}

type ProofKind = "instagram" | "x" | "tiktok" | "domain";
type ProofFlowState =
  | "idle"
  | "choosing"
  | "issuing"
  | "pending"
  | "verifying"
  | "proven"
  | "failed";

// ─── Spotify artist search ────────────────────────────────────────────────────
type SpotifySearchResult =
  | { ok: true; candidates: SpotifyCandidate[] }
  | { ok: false };

async function searchSpotifyArtists(query: string): Promise<SpotifySearchResult> {
  if (!query.trim()) return { ok: true, candidates: [] };
  try {
    const r = await fetch(
      `/api/public/referral/spotify/artist-search?q=${encodeURIComponent(query)}`,
    );
    if (!r.ok) return { ok: false };
    const data = await r.json();
    const candidates = Array.isArray(data) ? data : data.candidates ?? [];
    return {
      ok: true,
      candidates: candidates.slice(0, 6).map((a: any) => ({
        id: a.id ?? "",
        name: a.name ?? "",
        imageUrl: a.photoUrl ?? a.imageUrl ?? null,
        followers: a.followers ?? null,
        spotifyUrl: a.spotifyUrl ?? null,
        genres: a.genres ?? [],
      })),
    };
  } catch {
    return { ok: false };
  }
}

// ─── Form validation ──────────────────────────────────────────────────────────
const formSchema = z.object({
  applicantName: z.string().min(1, "Enter your name").max(200),
  applicantEmail: z.string().email("Enter a valid email"),
});

const urlSchema = z.string().url("Enter a valid URL (include https://)").or(z.literal(""));

// ─── Shared page shell ────────────────────────────────────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-12">
      {children}
    </div>
  );
}

// ─── Submitted state ──────────────────────────────────────────────────────────
function SubmittedState({
  referrerName,
  existing,
}: {
  referrerName: string;
  existing: boolean;
}) {
  return (
    <PageShell>
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 leading-snug">
          {existing ? "Already received!" : "We got it!"}
        </h1>
        <p className="text-slate-500 text-base leading-relaxed">
          {existing
            ? "It looks like we already have your application — we'll be in touch soon."
            : `Thanks for applying. ${referrerName} referred you, and the GoodTunes team will review your application and send you a confirmation email shortly.`}
        </p>
        <img src="/goodtunes-logo-color.png" alt="GoodTunes" className="w-28 mx-auto mt-4 opacity-70" />
      </div>
    </PageShell>
  );
}

// ─── Proof channel labels ─────────────────────────────────────────────────────
const PROOF_KIND_LABELS: Record<ProofKind, string> = {
  instagram: "Instagram",
  x: "X (Twitter)",
  tiktok: "TikTok",
  domain: "Your website / domain",
};

const PROOF_KIND_PLACEHOLDER: Record<ProofKind, string> = {
  instagram: "@yourhandle",
  x: "@yourhandle",
  tiktok: "@yourhandle",
  domain: "yourdomain.com",
};

// ─── Proof instructions helper ────────────────────────────────────────────────
function proofInstructions(kind: ProofKind, channel: string, code: string): string {
  if (kind === "domain") {
    return `Add a DNS TXT record with the value  goodtunes-verify=${code}  on ${channel}, OR publish a file at https://${channel}/.well-known/goodtunes-verification.txt containing the code. Then click "Verify".`;
  }
  return `Add the code  ${code}  to your ${PROOF_KIND_LABELS[kind]} bio for @${channel.replace(/^@/, "")}. Your profile must be public. Then click "Verify".`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function JoinReferralLink() {
  const { code } = useParams<{ code: string }>();

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  // Spotify state
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyCandidate[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyCandidate | null>(null);
  const [spotifySearched, setSpotifySearched] = useState(false);
  const [spotifyFetchError, setSpotifyFetchError] = useState(false);

  // Evidence links state
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceWebsite, setEvidenceWebsite] = useState("");
  const [evidenceStreaming, setEvidenceStreaming] = useState("");
  const [evidenceDistributor, setEvidenceDistributor] = useState("");
  const [evidenceErrors, setEvidenceErrors] = useState<{
    website?: string;
    streaming?: string;
    distributor?: string;
  }>({});

  // Proof of ownership state
  const [showProof, setShowProof] = useState(false);
  const [proofKind, setProofKind] = useState<ProofKind>("instagram");
  const [proofChannel, setProofChannel] = useState("");
  const [proofCode, setProofCode] = useState<string | null>(null);
  const [proofFlow, setProofFlow] = useState<ProofFlowState>("idle");
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofVerifiedChannel, setProofVerifiedChannel] = useState<string | null>(null);
  const proofEmailRef = useRef<string>("");

  // Submitted
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState(false);

  // Fetch referral link branding
  const { data, isLoading, error } = useQuery<ReferralInfo>({
    queryKey: ["/api/public/referral", code],
    queryFn: async () => {
      const r = await fetch(`/api/public/referral/${code}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Invalid referral link");
      return j;
    },
    retry: false,
    staleTime: Infinity,
  });

  // ─── Proof issue mutation ──────────────────────────────────────────────────
  const proofIssueMutation = useMutation({
    mutationFn: async ({
      email: em,
      proofKind: pk,
      proofChannel: pc,
    }: { email: string; proofKind: ProofKind; proofChannel: string }) => {
      const r = await fetch(`/api/public/referral/${code}/proof-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, proofKind: pk, proofChannel: pc }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not generate a code");
      return j as { proofCode: string; alreadyProven: boolean };
    },
    onSuccess: (data) => {
      setProofCode(data.proofCode);
      if (data.alreadyProven) {
        setProofFlow("proven");
        setProofVerifiedChannel(proofChannel);
      } else {
        setProofFlow("pending");
      }
    },
    onError: (e: Error) => {
      setProofError(e.message);
      setProofFlow("failed");
    },
  });

  // ─── Proof verify mutation ─────────────────────────────────────────────────
  const proofVerifyMutation = useMutation({
    mutationFn: async ({
      email: em,
      proofKind: pk,
      proofChannel: pc,
      proofCode: pcode,
    }: { email: string; proofKind: ProofKind; proofChannel: string; proofCode: string }) => {
      const r = await fetch(`/api/public/referral/${code}/proof-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, proofKind: pk, proofChannel: pc, proofCode: pcode }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Verification failed");
      return j as { ok: boolean; channel?: string; error?: string };
    },
    onSuccess: (data) => {
      if (data.ok) {
        setProofFlow("proven");
        setProofVerifiedChannel(data.channel ?? proofChannel);
        setProofError(null);
      } else {
        setProofFlow("failed");
        setProofError(data.error ?? "Verification failed. Check the code is in your bio and try again.");
      }
    },
    onError: (e: Error) => {
      setProofFlow("failed");
      setProofError(e.message);
    },
  });

  // ─── Submit mutation ───────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async (body: {
      applicantEmail: string;
      applicantName: string;
      spotifyArtistId?: string | null;
      spotifyArtistName?: string | null;
      spotifyArtistUrl?: string | null;
      spotifyPhotoUrl?: string | null;
      evidenceLinks?: Array<{ kind: string; url: string }>;
    }) => {
      const r = await fetch(`/api/public/referral/${code}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Something went wrong");
      return j as { ok: boolean; existing: boolean };
    },
    onSuccess: (data) => {
      setSubmitted(true);
      setExisting(data.existing);
    },
  });

  // ─── Event handlers ────────────────────────────────────────────────────────

  async function handleSpotifySearch() {
    if (!spotifyQuery.trim()) return;
    setSpotifyLoading(true);
    setSpotifyResults([]);
    setSpotifySearched(true);
    setSpotifyFetchError(false);
    const result = await searchSpotifyArtists(spotifyQuery);
    if (result.ok) {
      setSpotifyResults(result.candidates);
    } else {
      setSpotifyFetchError(true);
    }
    setSpotifyLoading(false);
  }

  function handleGetCode() {
    const emailTrimmed = email.trim();
    if (!emailTrimmed || !proofChannel.trim()) return;
    proofEmailRef.current = emailTrimmed;
    setProofFlow("issuing");
    setProofError(null);
    proofIssueMutation.mutate({
      email: emailTrimmed,
      proofKind,
      proofChannel: proofChannel.trim(),
    });
  }

  function handleVerify() {
    if (!proofCode) return;
    setProofFlow("verifying");
    setProofError(null);
    proofVerifyMutation.mutate({
      email: proofEmailRef.current || email.trim(),
      proofKind,
      proofChannel: proofChannel.trim(),
      proofCode,
    });
  }

  function handleResetProof() {
    setProofCode(null);
    setProofFlow("idle");
    setProofError(null);
    setProofVerifiedChannel(null);
    setProofChannel("");
  }

  function validateEvidence(): boolean {
    const errs: typeof evidenceErrors = {};
    if (evidenceWebsite && !urlSchema.safeParse(evidenceWebsite).success) {
      errs.website = "Enter a valid URL (include https://)";
    }
    if (evidenceStreaming && !urlSchema.safeParse(evidenceStreaming).success) {
      errs.streaming = "Enter a valid URL (include https://)";
    }
    if (evidenceDistributor && !urlSchema.safeParse(evidenceDistributor).success) {
      errs.distributor = "Enter a valid URL (include https://)";
    }
    setEvidenceErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = formSchema.safeParse({
      applicantName: name.trim(),
      applicantEmail: email.trim(),
    });
    if (!result.success) {
      const errs: { name?: string; email?: string } = {};
      for (const issue of result.error.issues) {
        if (issue.path[0] === "applicantName") errs.name = issue.message;
        if (issue.path[0] === "applicantEmail") errs.email = issue.message;
      }
      setErrors(errs);
      return;
    }
    if (!validateEvidence()) return;
    setErrors({});

    // Collect evidence links (filter empties).
    const evidenceLinks: Array<{ kind: string; url: string }> = [];
    if (evidenceWebsite) evidenceLinks.push({ kind: "website", url: evidenceWebsite });
    if (evidenceStreaming) evidenceLinks.push({ kind: "streaming", url: evidenceStreaming });
    if (evidenceDistributor) evidenceLinks.push({ kind: "distributor", url: evidenceDistributor });

    submitMutation.mutate({
      applicantEmail: result.data.applicantEmail,
      applicantName: result.data.applicantName,
      spotifyArtistId: selectedArtist?.id ?? null,
      spotifyArtistName: selectedArtist?.name ?? null,
      spotifyArtistUrl: selectedArtist?.spotifyUrl ?? null,
      spotifyPhotoUrl: selectedArtist?.imageUrl ?? null,
      evidenceLinks: evidenceLinks.length > 0 ? evidenceLinks : undefined,
    });
  }

  // ─── States ─────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SubmittedState
        referrerName={data?.branding?.name ?? "The team"}
        existing={existing}
      />
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center mt-32">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <div className="w-full max-w-sm text-center space-y-3 mt-16">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200">
            <Music2 className="w-7 h-7 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {(error as Error)?.message?.includes("no longer active")
              ? "This referral link is no longer active"
              : "Invalid referral link"}
          </h1>
          <p className="text-slate-500 text-sm">
            {(error as Error)?.message?.includes("no longer active")
              ? "The person who shared this link has deactivated it."
              : "This link may have expired or been removed. Ask the person who sent it to share a fresh one."}
          </p>
          <img src="/goodtunes-logo-color.png" alt="GoodTunes" className="w-24 mx-auto mt-8 opacity-60" />
        </div>
      </PageShell>
    );
  }

  const referrerName = data.branding.name;
  const referrerPhoto = data.branding.photoUrl;
  const referrerOrg = data.branding.orgName;

  // Whether the email field is filled enough to issue a proof code.
  const emailReadyForProof = z.string().email().safeParse(email.trim()).success;

  return (
    <PageShell>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <img src="/goodtunes-logo-color.png" alt="GoodTunes" className="w-32 mx-auto mb-6" />
        </div>

        {/* Referrer hero */}
        <div className="flex flex-col items-center text-center space-y-3">
          {referrerPhoto ? (
            <img
              src={referrerPhoto}
              alt={referrerName}
              className="w-16 h-16 rounded-full object-cover bg-slate-100 ring-1 ring-slate-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-50 ring-1 ring-blue-200 flex items-center justify-center">
              <Music2 className="w-7 h-7 text-blue-500" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-snug">
              {referrerOrg
                ? `${referrerOrg} invited you to GoodTunes`
                : `${referrerName} invited you to GoodTunes`}
            </h1>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name or artist name"
                className={[
                  "gt-admin-autofill w-full rounded-md border px-3 py-2.5 bg-white text-slate-900",
                  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm",
                  errors.name ? "border-rose-400 focus:ring-rose-400" : "border-slate-200",
                ].join(" ")}
                data-testid="input-applicant-name"
              />
              {errors.name && (
                <p className="text-xs text-rose-500 mt-1" data-testid="error-name">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={[
                  "gt-admin-autofill w-full rounded-md border px-3 py-2.5 bg-white text-slate-900",
                  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm",
                  errors.email ? "border-rose-400 focus:ring-rose-400" : "border-slate-200",
                ].join(" ")}
                data-testid="input-applicant-email"
              />
              {errors.email && (
                <p className="text-xs text-rose-500 mt-1" data-testid="error-email">{errors.email}</p>
              )}
            </div>

            {/* Spotify self-identification (optional) */}
            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Your Spotify artist profile{" "}
                <span className="normal-case font-normal text-slate-400">(optional)</span>
              </label>

              {selectedArtist ? (
                <div
                  className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5"
                  data-testid="selected-spotify-artist"
                >
                  {selectedArtist.imageUrl ? (
                    <img src={selectedArtist.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{selectedArtist.name}</div>
                    {selectedArtist.followers != null && (
                      <div className="text-xs text-slate-500">
                        {selectedArtist.followers.toLocaleString()} followers
                      </div>
                    )}
                  </div>
                  <IconButton
                    variant="ghost"
                    size="md"
                    aria-label="Clear Spotify selection"
                    onClick={() => {
                      setSelectedArtist(null);
                      setSpotifyResults([]);
                      setSpotifySearched(false);
                      setSpotifyFetchError(false);
                      setSpotifyQuery("");
                    }}
                    data-testid="button-clear-spotify"
                  >
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={spotifyQuery}
                      onChange={(e) => setSpotifyQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSpotifySearch(); } }}
                      placeholder="Search by artist name…"
                      className="gt-admin-autofill flex-1 rounded-md border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      data-testid="input-spotify-search"
                    />
                    <button
                      type="button"
                      onClick={handleSpotifySearch}
                      disabled={!spotifyQuery.trim() || spotifyLoading}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      data-testid="button-spotify-search"
                    >
                      {spotifyLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {spotifyResults.length > 0 && (
                    <ul
                      className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden shadow-sm"
                      data-testid="list-spotify-results"
                    >
                      {spotifyResults.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedArtist(a)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                            data-testid={`option-spotify-${a.id}`}
                          >
                            {a.imageUrl ? (
                              <img src={a.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                              {a.followers != null && (
                                <div className="text-xs text-slate-500">{a.followers.toLocaleString()} followers</div>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {spotifySearched && !spotifyLoading && spotifyFetchError && (
                    <p className="text-xs text-slate-400 px-1" data-testid="text-spotify-error">
                      Artist search unavailable — you can skip this and just submit your email.
                    </p>
                  )}
                  {spotifySearched && !spotifyLoading && !spotifyFetchError && spotifyResults.length === 0 && (
                    <p className="text-xs text-slate-400 px-1" data-testid="text-spotify-no-results">
                      No results — you can skip this and just submit your email.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Evidence links section (optional) ───────────────────────── */}
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowEvidence((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 transition-colors"
                data-testid="button-toggle-evidence"
              >
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Add evidence links
                  <span className="normal-case font-normal text-slate-400">(optional)</span>
                </span>
                {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showEvidence && (
                <div className="mt-3 space-y-3" data-testid="section-evidence">
                  <p className="text-xs text-slate-500 leading-snug">
                    These links help the reviewer verify your identity — official site, Spotify/Apple for Artists, or your distributor dashboard.
                  </p>
                  <EvidenceField
                    label="Official website"
                    placeholder="https://yoursite.com"
                    value={evidenceWebsite}
                    onChange={setEvidenceWebsite}
                    error={evidenceErrors.website}
                    testId="input-evidence-website"
                    icon={<Globe className="w-3.5 h-3.5" />}
                  />
                  <EvidenceField
                    label="Spotify / Apple for Artists link"
                    placeholder="https://artists.spotify.com/…"
                    value={evidenceStreaming}
                    onChange={setEvidenceStreaming}
                    error={evidenceErrors.streaming}
                    testId="input-evidence-streaming"
                    icon={<Music2 className="w-3.5 h-3.5" />}
                  />
                  <EvidenceField
                    label="Distributor / label page"
                    placeholder="https://distrokid.com/…"
                    value={evidenceDistributor}
                    onChange={setEvidenceDistributor}
                    error={evidenceErrors.distributor}
                    testId="input-evidence-distributor"
                    icon={<Link2 className="w-3.5 h-3.5" />}
                  />
                </div>
              )}
            </div>

            {/* ── Prove ownership section (optional) ──────────────────────── */}
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowProof((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 transition-colors"
                data-testid="button-toggle-proof"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {proofFlow === "proven"
                    ? <span className="text-emerald-600 normal-case font-semibold">✓ Ownership proved</span>
                    : <>Prove you're this artist <span className="normal-case font-normal text-slate-400">(optional but speeds up review)</span></>}
                </span>
                {showProof ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showProof && (
                <div className="mt-3 space-y-3" data-testid="section-proof">
                  {proofFlow === "proven" ? (
                    <div
                      className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5"
                      data-testid="proof-proven-badge"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-emerald-800">Ownership proved</div>
                        <div className="text-xs text-emerald-600">{proofVerifiedChannel}</div>
                      </div>
                      <IconButton
                        variant="ghost"
                        size="md"
                        aria-label="Reset proof"
                        onClick={handleResetProof}
                        data-testid="button-reset-proof"
                      >
                        <X className="w-4 h-4" />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 leading-snug">
                        GoodTunes will generate a short code. Add it to your social bio or domain to prove you control that account — no login required.
                      </p>

                      {/* Channel picker */}
                      <div className="flex gap-1.5 flex-wrap" data-testid="proof-kind-picker">
                        {(["instagram", "x", "tiktok", "domain"] as ProofKind[]).map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setProofKind(k);
                              setProofChannel("");
                              setProofCode(null);
                              setProofFlow("idle");
                              setProofError(null);
                            }}
                            className={[
                              "text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors",
                              proofKind === k
                                ? "bg-[var(--brand-blue)] border-[var(--brand-blue)] text-white"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
                            ].join(" ")}
                            data-testid={`button-proof-kind-${k}`}
                          >
                            {PROOF_KIND_LABELS[k]}
                          </button>
                        ))}
                      </div>

                      {/* Channel input + get-code */}
                      {proofFlow === "idle" && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={proofChannel}
                            onChange={(e) => setProofChannel(e.target.value)}
                            placeholder={PROOF_KIND_PLACEHOLDER[proofKind]}
                            className="gt-admin-autofill flex-1 rounded-md border border-slate-200 px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            data-testid="input-proof-channel"
                          />
                          <button
                            type="button"
                            onClick={handleGetCode}
                            disabled={!proofChannel.trim() || !emailReadyForProof}
                            title={!emailReadyForProof ? "Enter your email address first" : undefined}
                            className="rounded-md bg-slate-900 text-white text-xs font-semibold px-3 py-2 hover:opacity-80 disabled:opacity-40 transition-opacity whitespace-nowrap"
                            data-testid="button-get-proof-code"
                          >
                            Get code
                          </button>
                        </div>
                      )}

                      {/* Issuing */}
                      {proofFlow === "issuing" && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating code…
                        </div>
                      )}

                      {/* Pending — show code + instructions */}
                      {(proofFlow === "pending" || proofFlow === "failed") && proofCode && (
                        <div className="space-y-3" data-testid="section-proof-code">
                          <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-center">
                            <div className="text-xs text-slate-400 mb-1">Your verification code</div>
                            <div
                              className="font-mono text-lg font-bold text-slate-900 tracking-widest"
                              data-testid="text-proof-code"
                            >
                              {proofCode}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {proofInstructions(proofKind, proofChannel, proofCode)}
                          </p>

                          {proofFlow === "failed" && proofError && (
                            <div
                              className="flex items-start gap-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2"
                              data-testid="proof-error-msg"
                            >
                              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-rose-700 leading-snug">{proofError}</p>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleVerify}
                              disabled={proofVerifyMutation.isPending}
                              className="flex-1 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold px-3 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
                              data-testid="button-verify-proof"
                            >
                              {proofVerifyMutation.isPending ? (
                                <span className="inline-flex items-center gap-1.5 justify-center">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…
                                </span>
                              ) : (
                                "Verify"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleResetProof}
                              className="rounded-md border border-slate-200 text-slate-500 text-xs font-medium px-3 py-2 hover:bg-slate-50 transition-colors"
                              data-testid="button-cancel-proof"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Verifying */}
                      {proofFlow === "verifying" && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Checking your profile…
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Submit error */}
            {submitMutation.isError && (
              <p className="text-sm text-rose-500" data-testid="error-submit">
                {(submitMutation.error as Error)?.message ?? "Something went wrong. Try again."}
              </p>
            )}

            <button
              type="submit"
              disabled={submitMutation.isPending || !name.trim() || !email.trim()}
              className="w-full rounded-md bg-[var(--brand-blue)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity px-4 py-2.5 text-sm font-semibold text-white"
              data-testid="button-submit-application"
            >
              {submitMutation.isPending ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                </span>
              ) : (
                "Apply to join GoodTunes"
              )}
            </button>

            <p className="text-xs text-center text-slate-400 leading-relaxed">
              By applying you agree to GoodTunes' terms of service and privacy policy. Your application
              will be reviewed — you won't have access until you receive your invite email.
            </p>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

// ─── Evidence field sub-component ────────────────────────────────────────────
function EvidenceField({
  label,
  placeholder,
  value,
  onChange,
  error,
  testId,
  icon,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  testId: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "gt-admin-autofill w-full rounded-md border px-3 py-2 bg-white text-slate-900",
          "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm",
          error ? "border-rose-400 focus:ring-rose-400" : "border-slate-200",
        ].join(" ")}
        data-testid={testId}
      />
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
