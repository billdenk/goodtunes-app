// Task #2739 — Multi-step wizard redesign of the /join/:code referral page.
//
// Steps:
//   1. info            — name + email → request email OTP
//   2. otp             — enter 6-digit code from email
//   3. spotify_search  — find yourself on Spotify (or skip)
//   4. spotify_selected— confirm artist card → get GT- proof code
//   5. spotify_verify  — add code to bio → verify
//   6. submitted       — success

import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Loader2, Search, X, Copy, Check, ChevronLeft, Music,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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

type Step =
  | "info"
  | "otp"
  | "spotify_search"
  | "spotify_selected"
  | "spotify_verify"
  | "submitted";

// ─── Spotify artist search ────────────────────────────────────────────────────

async function searchSpotifyArtists(
  query: string,
): Promise<{ ok: true; candidates: SpotifyCandidate[] } | { ok: false }> {
  if (!query.trim()) return { ok: true, candidates: [] };
  try {
    const r = await fetch(
      `/api/public/referral/spotify/artist-search?q=${encodeURIComponent(query)}`,
    );
    if (!r.ok) return { ok: false };
    const data = await r.json();
    const candidates = Array.isArray(data) ? data : (data.candidates ?? []);
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogoHeader({ photoUrl, orgName }: { photoUrl: string | null; orgName: string | null }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {photoUrl && (
        <>
          <img
            src={photoUrl}
            alt={orgName ?? ""}
            className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200"
          />
          <span className="text-slate-400 text-2xl font-extralight">+</span>
        </>
      )}
      <img src="/goodtunes-logo-color.png" alt="GoodTunes" className="h-8 w-auto" />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text", autoFocus, disabled, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      className="w-full rounded-xl border border-slate-200 px-3.5 py-3 bg-white text-slate-900 text-sm
                 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]
                 focus:border-[var(--brand-blue)] disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
      data-testid={testId}
    />
  );
}

function PrimaryButton({
  onClick, disabled, loading, children, testId,
}: {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full rounded-xl bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)]
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                 px-4 py-3.5 text-sm font-semibold text-white"
      data-testid={testId}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function ArtistCard({
  artist,
  onClear,
}: {
  artist: SpotifyCandidate;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
      {artist.imageUrl ? (
        <img
          src={artist.imageUrl}
          alt=""
          className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-1 ring-white/80"
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center">
          <Music className="w-4 h-4 text-slate-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{artist.name}</div>
        {artist.followers != null && (
          <div className="text-xs text-slate-400">
            {artist.followers > 0
              ? `${artist.followers.toLocaleString()} followers`
              : "Spotify artist"}
          </div>
        )}
      </div>
      {onClear && (
        <IconButton
          variant="ghost"
          size="md"
          onClick={onClear}
          aria-label="Clear artist selection"
          data-testid="button-clear-artist"
        >
          <X className="w-4 h-4" />
        </IconButton>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JoinReferralLink() {
  const { code } = useParams<{ code: string }>();

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("info");

  // Step 1
  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [infoError, setInfoError] = useState<string | null>(null);

  // Step 2 (OTP)
  const [otpValue, setOtpValue] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResent, setOtpResent] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Step 3 (search)
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyCandidate[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifySearched, setSpotifySearched] = useState(false);
  const [spotifyError, setSpotifyError] = useState(false);

  // Steps 4–5 (artist selected + proof)
  const [selectedArtist, setSelectedArtist] = useState<SpotifyCandidate | null>(null);
  const [proofCode, setProofCode] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Query: referral branding ────────────────────────────────────────────────
  const brandingQuery = useQuery<ReferralInfo>({
    queryKey: ["/api/public/referral", code],
    queryFn: async () => {
      const r = await fetch(`/api/public/referral/${code}`);
      if (!r.ok) throw new Error("Invalid referral link");
      return r.json();
    },
    retry: false,
  });

  const branding = brandingQuery.data?.branding;

  // ── OTP auto-focus when step becomes otp ───────────────────────────────────
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 80);
    }
  }, [step]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const requestOtpMutation = useMutation({
    mutationFn: async (payload: { email: string; name: string }) => {
      const r = await apiRequest("POST", `/api/public/referral/${code}/request-otp`, payload);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to send code. Try again.");
      }
      const data = await r.json();
      if (data.devCode) {
        console.info("[referral-otp] dev OTP:", data.devCode);
      }
    },
    onSuccess: () => {
      setOtpValue("");
      setOtpError(null);
      setOtpResent(false);
      setStep("otp");
    },
    onError: (err: Error) => {
      setInfoError(err.message);
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (otp: string) => {
      const r = await apiRequest("POST", `/api/public/referral/${code}/verify-otp`, {
        email: applicantEmail.toLowerCase().trim(),
        otp,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? "Incorrect or expired code.");
      }
    },
    onSuccess: () => {
      setOtpError(null);
      setStep("spotify_search");
    },
    onError: (err: Error) => {
      setOtpError(err.message);
    },
  });

  const proofIssueMutation = useMutation({
    mutationFn: async (artist: SpotifyCandidate) => {
      const r = await apiRequest("POST", `/api/public/referral/${code}/proof-issue`, {
        email: applicantEmail.toLowerCase().trim(),
        proofKind: "spotify",
        proofChannel: artist.id,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to generate code.");
      }
      const data = await r.json();
      return data.proofCode as string;
    },
    onSuccess: (pCode) => {
      setProofCode(pCode);
      setProofError(null);
      setCodeCopied(false);
      setStep("spotify_verify");
    },
    onError: (err: Error) => {
      setProofError(err.message);
    },
  });

  const proofVerifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedArtist || !proofCode) throw new Error("Missing artist or code.");
      const r = await apiRequest("POST", `/api/public/referral/${code}/proof-verify`, {
        email: applicantEmail.toLowerCase().trim(),
        proofKind: "spotify",
        proofChannel: selectedArtist.id,
        proofCode,
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? "Verification failed.");
      return body;
    },
    onSuccess: () => {
      submitMutation.mutate();
    },
    onError: (err: Error) => {
      setProofError(err.message);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/public/referral/${code}/apply`, {
        applicantEmail: applicantEmail.toLowerCase().trim(),
        applicantName: applicantName.trim(),
        spotifyArtistId: selectedArtist?.id ?? null,
        spotifyArtistName: selectedArtist?.name ?? null,
        spotifyArtistUrl: selectedArtist?.spotifyUrl ?? null,
        spotifyPhotoUrl: selectedArtist?.imageUrl ?? null,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? "Submission failed.");
      }
    },
    onSuccess: () => {
      setStep("submitted");
    },
  });

  // ── Spotify search ──────────────────────────────────────────────────────────
  async function handleSpotifySearch() {
    if (!spotifyQuery.trim() || spotifyLoading) return;
    setSpotifyLoading(true);
    setSpotifySearched(false);
    setSpotifyError(false);
    const result = await searchSpotifyArtists(spotifyQuery);
    setSpotifyLoading(false);
    setSpotifySearched(true);
    if (!result.ok) {
      setSpotifyError(true);
      setSpotifyResults([]);
    } else {
      setSpotifyResults(result.candidates);
    }
  }

  function handleSelectArtist(artist: SpotifyCandidate) {
    setSelectedArtist(artist);
    setStep("spotify_selected");
  }

  function handleClearArtist() {
    setSelectedArtist(null);
    setProofCode(null);
    setProofError(null);
    setStep("spotify_search");
  }

  async function handleResendOtp() {
    setOtpResent(false);
    await requestOtpMutation.mutateAsync({ email: applicantEmail, name: applicantName });
    setOtpResent(true);
    setTimeout(() => setOtpResent(false), 4000);
  }

  function copyCode() {
    if (!proofCode) return;
    navigator.clipboard.writeText(proofCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    });
  }

  // ── Render: loading / error states ─────────────────────────────────────────

  if (brandingQuery.isLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </PageShell>
    );
  }

  if (brandingQuery.isError) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="text-3xl mb-3">🔗</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Link not found</h2>
          <p className="text-sm text-slate-500">
            This referral link may be invalid or expired. Ask your referrer for a new link.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Step renderers ──────────────────────────────────────────────────────────

  function renderInfo() {
    const emailValid = z.string().email().safeParse(applicantEmail.trim()).success;
    const canSubmit = applicantName.trim().length > 0 && emailValid;

    return (
      <Card>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Tell us about you</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          GoodTunes® helps artists get their vinyl with&nbsp;$0 out of pocket. Help&nbsp;us learn a bit about you.
        </p>

        <div className="space-y-4">
          <div>
            <FieldLabel>Your name</FieldLabel>
            <TextInput
              value={applicantName}
              onChange={(v) => { setApplicantName(v); setInfoError(null); }}
              placeholder="Full name"
              autoFocus
              testId="input-applicant-name"
            />
          </div>

          <div>
            <FieldLabel>Email address</FieldLabel>
            <TextInput
              value={applicantEmail}
              onChange={(v) => { setApplicantEmail(v); setInfoError(null); }}
              placeholder="you@example.com"
              type="email"
              testId="input-applicant-email"
            />
          </div>

          {infoError && (
            <p className="text-xs text-rose-500 -mt-1" data-testid="error-info">{infoError}</p>
          )}

          <PrimaryButton
            onClick={() => {
              setInfoError(null);
              requestOtpMutation.mutate({ email: applicantEmail, name: applicantName });
            }}
            disabled={!canSubmit}
            loading={requestOtpMutation.isPending}
            testId="button-get-otp"
          >
            {requestOtpMutation.isPending ? "Sending…" : "Get Confirmation Code"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  function renderOtp() {
    const canVerify = otpValue.length === 6;

    return (
      <Card>
        <button
          type="button"
          onClick={() => setStep("info")}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-500 mb-5 transition-colors"
          data-testid="button-back-to-info"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <h2 className="text-xl font-bold text-slate-900 mb-1">Check your email</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          We sent a 6-digit code to <span className="font-medium text-slate-700">{applicantEmail}</span>.
          Enter it below to continue.
        </p>

        <div className="space-y-4">
          <div>
            <FieldLabel>Confirmation code</FieldLabel>
            <input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpValue}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpValue(v);
                setOtpError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canVerify) {
                  verifyOtpMutation.mutate(otpValue);
                }
              }}
              placeholder="123456"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-3 bg-white text-slate-900
                         text-2xl font-bold tracking-[0.4em] text-center
                         placeholder:text-slate-400 placeholder:font-normal placeholder:tracking-normal
                         focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]
                         focus:border-[var(--brand-blue)] transition-colors"
              data-testid="input-otp"
            />
          </div>

          {otpError && (
            <p className="text-xs text-rose-500" data-testid="error-otp">{otpError}</p>
          )}

          <PrimaryButton
            onClick={() => verifyOtpMutation.mutate(otpValue)}
            disabled={!canVerify}
            loading={verifyOtpMutation.isPending}
            testId="button-verify-otp"
          >
            {verifyOtpMutation.isPending ? "Verifying…" : "Verify"}
          </PrimaryButton>

          <p className="text-center text-xs text-slate-400">
            Didn't get it?{" "}
            {otpResent ? (
              <span className="text-emerald-600 font-medium">Sent!</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={requestOtpMutation.isPending}
                className="underline hover:text-slate-500 transition-colors disabled:opacity-40"
                data-testid="button-resend-otp"
              >
                Resend code
              </button>
            )}
          </p>
        </div>
      </Card>
    );
  }

  function renderSpotifySearch() {
    const exactMatchName = spotifyQuery.trim().toLowerCase();

    return (
      <Card>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Confirm your account</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Search for your artist profile on Spotify to confirm your identity.
        </p>

        <div className="space-y-4">
          <div>
            <FieldLabel>Artist profile</FieldLabel>
            <div className="flex gap-2">
              <input
                type="text"
                value={spotifyQuery}
                onChange={(e) => setSpotifyQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSpotifySearch(); }}
                placeholder="Search by artist name…"
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-3 bg-white text-slate-900
                           text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2
                           focus:ring-[var(--brand-blue)] focus:border-[var(--brand-blue)] transition-colors"
                data-testid="input-spotify-search"
              />
              <button
                type="button"
                onClick={handleSpotifySearch}
                disabled={!spotifyQuery.trim() || spotifyLoading}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-500
                           hover:bg-slate-50 disabled:opacity-40 transition-colors"
                data-testid="button-spotify-search"
              >
                {spotifyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {spotifyResults.length > 0 && (
            <ul
              className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden"
              data-testid="list-spotify-results"
            >
              {spotifyResults.map((a) => {
                const isExact = a.name.toLowerCase() === exactMatchName;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectArtist(a)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                      data-testid={`option-spotify-${a.id}`}
                    >
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-100" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center">
                          <Music className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 truncate">{a.name}</span>
                          {isExact && (
                            <span className="text-xs font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 border border-emerald-200 flex-shrink-0">
                              Exact match
                            </span>
                          )}
                        </div>
                        {a.followers != null && (
                          <div className="text-xs text-slate-400">
                            {a.followers > 0 ? `${a.followers.toLocaleString()} followers` : "Spotify artist"}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {spotifySearched && !spotifyLoading && spotifyError && (
            <p className="text-xs text-slate-400 text-center" data-testid="text-spotify-error">
              Search unavailable right now. You can skip this step below.
            </p>
          )}
          {spotifySearched && !spotifyLoading && !spotifyError && spotifyResults.length === 0 && (
            <p className="text-xs text-slate-400 text-center" data-testid="text-spotify-no-results">
              No results found. Try a different spelling, or skip this step below.
            </p>
          )}

          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-500 py-2 transition-colors"
              data-testid="button-no-spotify"
            >
              {submitMutation.isPending ? (
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <Loader2 className="w-3 h-3 animate-spin" /> Submitting…
                </span>
              ) : (
                "I'm not on any streaming platform →"
              )}
            </button>
          </div>

          {submitMutation.isError && (
            <p className="text-xs text-rose-500 text-center" data-testid="error-submit">
              {(submitMutation.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}
        </div>
      </Card>
    );
  }

  function renderSpotifySelected() {
    if (!selectedArtist) return null;

    return (
      <Card>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Confirm your account</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Search for your artist profile on Spotify to confirm your identity.
        </p>

        <div className="space-y-5">
          <div>
            <FieldLabel>Artist profile</FieldLabel>
            <ArtistCard artist={selectedArtist} onClear={handleClearArtist} />
          </div>

          <p className="text-sm text-slate-500 leading-relaxed">
            GoodTunes® will generate a short code. Add it to your <strong className="text-slate-700">Spotify bio</strong> to verify account ownership.
          </p>

          {proofError && (
            <p className="text-xs text-rose-500" data-testid="error-proof-issue">{proofError}</p>
          )}

          <PrimaryButton
            onClick={() => proofIssueMutation.mutate(selectedArtist)}
            loading={proofIssueMutation.isPending}
            testId="button-get-proof-code"
          >
            {proofIssueMutation.isPending ? "Generating…" : "Get Confirmation Code"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  function renderSpotifyVerify() {
    if (!selectedArtist || !proofCode) return null;

    return (
      <Card>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Confirm your account</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Search for your artist profile on Spotify to confirm your identity.
        </p>

        <div className="space-y-5">
          <div>
            <FieldLabel>Artist profile</FieldLabel>
            <ArtistCard artist={selectedArtist} onClear={handleClearArtist} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs text-slate-400 text-center mb-2">Your verification code</div>
            <div className="flex items-center justify-center gap-2">
              <span
                className="font-mono text-2xl font-bold text-slate-900 tracking-wider"
                data-testid="text-proof-code"
              >
                {proofCode}
              </span>
              <IconButton
                variant="ghost"
                size="md"
                onClick={copyCode}
                aria-label="Copy code"
                data-testid="button-copy-code"
              >
                {codeCopied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </IconButton>
            </div>
          </div>

          <p className="text-sm text-slate-500 leading-relaxed text-center">
            Add the code <span className="font-mono font-bold text-slate-700">{proofCode}</span> to your Spotify bio. Then come back here and click <strong className="text-slate-700">"Verify"</strong>.
          </p>

          {(proofError || submitMutation.isError) && (
            <p className="text-xs text-rose-500 text-center" data-testid="error-proof-verify">
              {proofError ?? (submitMutation.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <PrimaryButton
            onClick={() => proofVerifyMutation.mutate()}
            loading={proofVerifyMutation.isPending || submitMutation.isPending}
            testId="button-verify-proof"
          >
            {(proofVerifyMutation.isPending || submitMutation.isPending) ? "Verifying…" : "Verify"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  function renderSubmitted() {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You're on the list!</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Thanks{applicantName ? `, ${applicantName.split(" ")[0]}` : ""}! Your application is under review. We'll be in touch at{" "}
            <span className="font-medium text-slate-700">{applicantEmail}</span>{" "}
            once you've been approved.
          </p>
          {selectedArtist && (
            <p className="text-xs text-slate-400 mt-4">
              Spotify profile: <span className="text-slate-500">{selectedArtist.name}</span>
            </p>
          )}
        </div>
      </Card>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <LogoHeader photoUrl={branding?.photoUrl ?? null} orgName={branding?.orgName ?? branding?.name ?? null} />

      {step === "info" && renderInfo()}
      {step === "otp" && renderOtp()}
      {step === "spotify_search" && renderSpotifySearch()}
      {step === "spotify_selected" && renderSpotifySelected()}
      {step === "spotify_verify" && renderSpotifyVerify()}
      {step === "submitted" && renderSubmitted()}

      <p className="text-center text-xs text-slate-400 mt-6 leading-relaxed px-2">
        By applying you agree to GoodTunes' terms of service and privacy policy.
        Your application will be reviewed — you won't have access until you receive your invite email.
      </p>
    </PageShell>
  );
}
