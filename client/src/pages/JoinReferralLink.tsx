// Task #2399 — Public branded landing page for reusable referral links.
// Route: /join/:code (public, no auth required on admin host).
//
// Flow:
//   1. Loads branding via GET /api/public/referral/:code
//   2. Fan fills in name + email + optional Spotify self-identification
//   3. POST /api/public/referral/:code/apply → pending artist_applications row
//   4. "Thanks — we'll be in touch" confirmation state

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Music2, Search, X, Check, ChevronRight } from "lucide-react";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

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

// ─── Spotify artist search via the existing admin endpoint ────────────────────
// Uses the same Spotify search the admin uses for people; public endpoint
// for simple artist search.
async function searchSpotifyArtists(query: string): Promise<SpotifyCandidate[]> {
  if (!query.trim()) return [];
  try {
    const r = await fetch(
      `/api/admin/spotify/artists?q=${encodeURIComponent(query)}&limit=6`,
      { credentials: "include" },
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data) ? data : data.artists ?? []).slice(0, 6).map((a: any) => ({
      id: a.id ?? a.spotifyId ?? "",
      name: a.name ?? "",
      imageUrl: a.imageUrl ?? a.photoUrl ?? null,
      followers: a.followers ?? null,
      spotifyUrl: a.externalUrl ?? a.spotifyUrl ?? null,
      genres: a.genres ?? [],
    }));
  } catch {
    return [];
  }
}

// ─── Helper: referrer kind → human label ─────────────────────────────────────
function referrerKindLabel(kind: string): string {
  switch (kind) {
    case "artist": return "an artist";
    case "non_profit": return "a non-profit";
    case "manufacturer": return "a pressing plant";
    case "label": return "a record label";
    case "ambassador": return "an ambassador";
    default: return "GoodTunes";
  }
}

// ─── Form validation ──────────────────────────────────────────────────────────
const formSchema = z.object({
  applicantName: z.string().min(1, "Enter your name").max(200),
  applicantEmail: z.string().email("Enter a valid email"),
});

// ─── Submitted state ──────────────────────────────────────────────────────────
function SubmittedState({
  referrerName,
  existing,
}: {
  referrerName: string;
  existing: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border"
          style={{ background: "rgba(74,255,202,0.12)", borderColor: "rgba(74,255,202,0.28)" }}
        >
          <Check className="w-8 h-8 text-[var(--brand-mint)]" />
        </div>
        <h1 className="text-2xl font-bold text-white leading-snug">
          {existing ? "Already received!" : "We got it!"}
        </h1>
        <p className="text-[#8fa6c2] text-base leading-relaxed">
          {existing
            ? "It looks like we already have your application — we'll be in touch soon."
            : `Thanks for applying. ${referrerName} referred you, and the GoodTunes team will review your application and send you a confirmation email shortly.`}
        </p>
        <img src={gtLogo} alt="GoodTunes" className="w-28 mx-auto opacity-60 mt-4" />
      </div>
    </div>
  );
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

  const submitMutation = useMutation({
    mutationFn: async (body: {
      applicantEmail: string;
      applicantName: string;
      spotifyArtistId?: string | null;
      spotifyArtistName?: string | null;
      spotifyArtistUrl?: string | null;
      spotifyPhotoUrl?: string | null;
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

  async function handleSpotifySearch() {
    if (!spotifyQuery.trim()) return;
    setSpotifyLoading(true);
    setSpotifyResults([]);
    setSpotifySearched(true);
    const results = await searchSpotifyArtists(spotifyQuery);
    setSpotifyResults(results);
    setSpotifyLoading(false);
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
    setErrors({});
    submitMutation.mutate({
      applicantEmail: result.data.applicantEmail,
      applicantName: result.data.applicantName,
      spotifyArtistId: selectedArtist?.id ?? null,
      spotifyArtistName: selectedArtist?.name ?? null,
      spotifyArtistUrl: selectedArtist?.spotifyUrl ?? null,
      spotifyPhotoUrl: selectedArtist?.imageUrl ?? null,
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
      <div className="min-h-screen bg-[var(--brand-bg)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fan-faint animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col items-center justify-center px-4 text-center">
        <Music2 className="w-10 h-10 text-fan-faint mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">
          {(error as Error)?.message?.includes("no longer active")
            ? "This referral link is no longer active"
            : "Invalid referral link"}
        </h1>
        <p className="text-[#8fa6c2] text-sm">
          {(error as Error)?.message?.includes("no longer active")
            ? "The person who shared this link has deactivated it."
            : "This link may have expired or been removed. Ask the person who sent it to share a fresh one."}
        </p>
        <img src={gtLogo} alt="GoodTunes" className="w-24 mx-auto mt-8 opacity-50" />
      </div>
    );
  }

  const referrerName = data.branding.name;
  const referrerPhoto = data.branding.photoUrl;
  const referrerOrg = data.branding.orgName;

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col items-center justify-start px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <img src={gtLogo} alt="GoodTunes" className="w-32 mx-auto mb-6" />
        </div>

        {/* Referrer hero */}
        <div className="flex flex-col items-center text-center space-y-3">
          {referrerPhoto ? (
            <img
              src={referrerPhoto}
              alt={referrerName}
              className="w-16 h-16 rounded-full object-cover bg-white/10 border border-white/20"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full border flex items-center justify-center"
              style={{ background: "rgba(49,158,216,0.15)", borderColor: "rgba(49,158,216,0.25)" }}
            >
              <Music2 className="w-7 h-7 text-[var(--brand-blue)]" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white leading-snug">
              {referrerOrg
                ? `${referrerOrg} invited you to GoodTunes`
                : `${referrerName} invited you to GoodTunes`}
            </h1>
            <p className="text-[#8fa6c2] text-sm mt-1">
              You've been referred by {referrerKindLabel(data.referrerKind)} to join the platform as an artist.
              Fill in your info below — we'll review your application and send you an invite link.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#8fa6c2] mb-1">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name or artist name"
              className={[
                "w-full rounded-xl border px-4 py-3 bg-white/5 text-white placeholder-white/30",
                "focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] text-sm",
                errors.name ? "border-rose-500" : "border-white/10 focus:border-[var(--brand-blue)]",
              ].join(" ")}
              data-testid="input-applicant-name"
            />
            {errors.name && (
              <p className="text-xs text-rose-400 mt-1" data-testid="error-name">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#8fa6c2] mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={[
                "w-full rounded-xl border px-4 py-3 bg-white/5 text-white placeholder-white/30",
                "focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] text-sm",
                errors.email ? "border-rose-500" : "border-white/10 focus:border-[var(--brand-blue)]",
              ].join(" ")}
              data-testid="input-applicant-email"
            />
            {errors.email && (
              <p className="text-xs text-rose-400 mt-1" data-testid="error-email">{errors.email}</p>
            )}
          </div>

          {/* Spotify self-identification (optional) */}
          <div className="pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#8fa6c2] mb-1">
              Your Spotify artist profile{" "}
              <span className="normal-case font-normal text-fan-faint">(optional)</span>
            </label>

            {selectedArtist ? (
              <div
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "rgba(74,255,202,0.28)", background: "rgba(74,255,202,0.05)" }}
                data-testid="selected-spotify-artist"
              >
                {selectedArtist.imageUrl ? (
                  <img src={selectedArtist.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-white/10 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{selectedArtist.name}</div>
                  {selectedArtist.followers != null && (
                    <div className="text-xs text-fan-secondary">
                      {selectedArtist.followers.toLocaleString()} followers
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtist(null);
                    setSpotifyResults([]);
                    setSpotifySearched(false);
                    setSpotifyQuery("");
                  }}
                  className="text-fan-faint hover:text-white transition-colors"
                  data-testid="button-clear-spotify"
                >
                  <X className="w-4 h-4" />
                </button>
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
                    className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] text-sm"
                    data-testid="input-spotify-search"
                  />
                  <button
                    type="button"
                    onClick={handleSpotifySearch}
                    disabled={!spotifyQuery.trim() || spotifyLoading}
                    style={{ background: "var(--brand-blue-soft)", borderColor: "rgba(49,158,216,0.2)", color: "var(--brand-blue)" }}
                    className="rounded-xl border px-3 py-2.5 disabled:opacity-40 transition-colors hover:opacity-80"
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
                  <ul className="rounded-xl border border-white/10 bg-[#040a24] divide-y divide-white/5 overflow-hidden"
                    data-testid="list-spotify-results">
                    {spotifyResults.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedArtist(a)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                          data-testid={`option-spotify-${a.id}`}
                        >
                          {a.imageUrl ? (
                            <img src={a.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-white/10 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-white truncate">{a.name}</div>
                            {a.followers != null && (
                              <div className="text-xs text-fan-faint">{a.followers.toLocaleString()} followers</div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-fan-faint flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {spotifySearched && !spotifyLoading && spotifyResults.length === 0 && (
                  <p className="text-xs text-fan-faint px-1" data-testid="text-spotify-no-results">
                    No results — you can skip this and just submit your email.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          {submitMutation.isError && (
            <p className="text-sm text-rose-400" data-testid="error-submit">
              {(submitMutation.error as Error)?.message ?? "Something went wrong. Try again."}
            </p>
          )}

          <button
            type="submit"
            disabled={submitMutation.isPending || !name.trim() || !email.trim()}
            className="w-full rounded-xl bg-[var(--brand-blue)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity px-4 py-3.5 text-sm font-semibold text-white"
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

          <p className="text-xs text-center text-fan-faint leading-relaxed">
            By applying you agree to GoodTunes' terms of service and privacy policy. Your application
            will be reviewed — you won't have access until you receive your invite email.
          </p>
        </form>
      </div>
    </div>
  );
}
