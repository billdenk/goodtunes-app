import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PlacesBanner } from "@/components/admin/AddressAutocompleteField";

type PasswordStatus = { hasPassword: boolean };

type FactorPref = {
  factorPref: "email" | "totp";
  email: string;
  totpEnrolled: boolean;
  recoveryCodesRemaining: number;
};

type EnrollData = { qr: string; secret: string; recoveryCodes: string[] };

// Admin-only Security panel (Task #57). Shows the active second factor,
// lets the admin switch between email-OTP (default) and authenticator
// app (opt-in), and surfaces enrollment + recovery-code count.
//
// Switching TO 'totp' walks the admin through the same QR/secret
// enrollment flow we already use at first login. Switching back to
// 'email' is one click — the row in admin_totp stays put so the admin
// can flip back without re-enrolling.
//
// Lives inside the standard admin shell (AdminFrame + AdminPageHeader)
// so it matches Albums / People / Labels chrome. No sidebar entry —
// reached via the user menu — so the frame is rendered with
// `active="none"` to leave every sidebar row un-highlighted.
export default function AdminSecurity() {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useQuery<FactorPref>({ queryKey: ["/api/auth/factor-preference"] });
  const { data: pwStatus } = useQuery<PasswordStatus>({ queryKey: ["/api/auth/password/status"] });

  // ─── Change password (Task #261) ─────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPwError, setCurrentPwError] = useState<string | null>(null);
  const hasPassword = pwStatus?.hasPassword !== false;
  const newPwTooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmitPassword =
    hasPassword &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  const changePassword = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/password/change", {
        currentPassword,
        newPassword,
      });
      // 204 No Content — nothing to parse.
      return res.status === 204 ? null : res.json().catch(() => null);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPwError(null);
      toast({ title: "Password updated" });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Couldn't change password";
      // apiRequest throws errors shaped like "401: { ...json... }" or
      // "401: Current password is incorrect". Sniff the status prefix so
      // a bad current password becomes an inline field error instead of
      // a toast.
      if (/^401[:\s]/.test(msg) || /current password is incorrect/i.test(msg)) {
        setCurrentPwError("Current password is incorrect");
      } else {
        setCurrentPwError(null);
        toast({ title: msg, variant: "destructive" });
      }
    },
  });

  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  // Monotonic attempt token. Increments on every start/cancel, so a
  // late `start` response from a cancelled attempt is ignored instead
  // of repopulating the QR after the admin clicked Cancel.
  const enrollAttemptRef = useRef(0);

  const cancelEnroll = () => {
    enrollAttemptRef.current += 1;
    setEnrolling(false);
    setEnrollData(null);
    setEnrollCode("");
    setEnrollError(null);
  };
  // Codes returned by the regenerate flow. Held in state so the admin
  // can copy them; the server only returns them once.
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);

  const switchPref = useMutation({
    mutationFn: async (factor: "email" | "totp") => {
      const res = await apiRequest("POST", "/api/auth/factor-preference", { factor });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/factor-preference"] });
      toast({ title: "Preference saved" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Couldn't switch factor", variant: "destructive" }),
  });

  const startEnroll = useMutation({
    mutationFn: async () => {
      const attempt = ++enrollAttemptRef.current;
      const res = await apiRequest("POST", "/api/auth/totp/enroll/start");
      const json = await res.json();
      return { json, attempt };
    },
    onSuccess: ({ json, attempt }) => {
      // Ignore stale responses from a cancelled attempt.
      if (attempt !== enrollAttemptRef.current) return;
      setEnrollData({ qr: json.qr, secret: json.secret, recoveryCodes: json.recoveryCodes });
    },
    onError: (e: any, _v, ctx) => {
      // Don't toast for cancelled attempts.
      toast({ title: e?.message ?? "Couldn't start enrollment", variant: "destructive" });
    },
  });

  // Single entrypoint — guards against double-fire from the radio
  // onChange + the wrapper label click both firing in the same tick.
  const beginEnrollment = () => {
    if (enrolling || startEnroll.isPending) return;
    setEnrolling(true);
    startEnroll.mutate();
  };

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/totp/recovery-codes/regenerate");
      return res.json();
    },
    onSuccess: (j) => {
      setRegeneratedCodes(j.recoveryCodes);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/factor-preference"] });
      toast({ title: "New recovery codes generated", description: "Old codes no longer work." });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Couldn't regenerate codes", variant: "destructive" }),
  });

  const confirmEnroll = useMutation({
    mutationFn: async () => {
      const verifyRes = await apiRequest("POST", "/api/auth/totp/enroll/verify", { code: enrollCode.trim() });
      await verifyRes.json().catch(() => null);
      // Chain the preference switch inline so "linked + selected" is
      // deterministic. If this step fails the whole confirm flips to
      // onError and the admin sees a single coherent failure instead
      // of "linked but not selected".
      const prefRes = await apiRequest("POST", "/api/auth/factor-preference", { factor: "totp" });
      return prefRes.json().catch(() => null);
    },
    onSuccess: () => {
      setEnrollCode("");
      setEnrollError(null);
      setEnrolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/factor-preference"] });
      toast({ title: "Authenticator linked" });
      // Keep enrollData around briefly so the admin can copy recovery
      // codes; the factor-preference query refetch repaints the row.
    },
    onError: (e: any) => setEnrollError(e?.message ?? "Code didn't match"),
  });

  const header = (
    <AdminPageHeader
      title="Security"
      subtitle="Choose how you confirm admin sign-ins and manage your recovery codes."
      testId="text-security-title"
    />
  );

  if (isError) {
    return (
      <AdminFrame active="none">
        <div className="space-y-5">
          {header}
          <Card className="p-5">
            <p className="text-[13px] text-rose-600" data-testid="text-security-error">
              Couldn't load security settings{error instanceof Error && error.message ? `: ${error.message}` : "."}
            </p>
          </Card>
        </div>
      </AdminFrame>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminFrame active="none">
        <div className="space-y-5">
          {header}
          <p className="text-sm text-slate-500" data-testid="text-security-loading">Loading…</p>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="none">
      <div className="space-y-5">
        {header}

        {/* Quiet setup hint, relocated from the global admin header strip —
            renders only while GOOGLE_PLACES_API_KEY is unconfigured and is
            dismissible per-browser. */}
        <PlacesBanner />

        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Second factor</h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              Required every time you sign in to the admin. Email codes are the default — switch to an authenticator app for offline use or extra speed.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50" data-testid="option-factor-email">
              <input
                type="radio"
                checked={data.factorPref === "email"}
                onChange={() => switchPref.mutate("email")}
                className="mt-1"
                data-testid="input-factor-email"
              />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-slate-900">Email a code</div>
                <div className="text-[12.5px] text-slate-500">6-digit code sent to {data.email}, valid for 10 minutes.</div>
              </div>
            </label>

            <div className="rounded-md border border-slate-200 overflow-hidden" data-testid="option-factor-totp">
              <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  checked={data.totpEnrolled ? data.factorPref === "totp" : enrolling}
                  onChange={() => {
                    if (data.totpEnrolled) {
                      switchPref.mutate("totp");
                    } else {
                      beginEnrollment();
                    }
                  }}
                  className="mt-1"
                  data-testid="input-factor-totp"
                />
                <div className="flex-1">
                  <div className="text-[13.5px] font-medium text-slate-900">Authenticator app</div>
                  <div className="text-[12.5px] text-slate-500">
                    {data.totpEnrolled
                      ? `Linked. ${data.recoveryCodesRemaining} recovery code${data.recoveryCodesRemaining === 1 ? "" : "s"} remaining.`
                      : enrolling
                        ? "Scan the QR with Google Authenticator, 1Password, Authy, etc., then enter the 6-digit code to confirm."
                        : "Not set up. Select to add an authenticator."}
                  </div>
                </div>
              </label>

              {!data.totpEnrolled && enrolling && (
                <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                  {!enrollData ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12.5px] text-slate-500">
                        {startEnroll.isPending ? "Preparing your QR code…" : "Couldn't start enrollment."}
                      </p>
                      <Button
                        onClick={cancelEnroll}
                        variant="ghost"
                        size="sm"
                        data-testid="button-cancel-totp-enroll"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-w-sm mx-auto">
                      <img src={enrollData.qr} alt="2FA QR code" className="mx-auto w-40 h-40 border border-slate-200 rounded bg-white" />
                      <p className="text-[11px] text-slate-400 text-center break-all">
                        Manual: <span className="font-mono text-slate-700">{enrollData.secret}</span>
                      </p>
                      <input
                        type="text"
                        value={enrollCode}
                        onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123 456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="w-full text-center text-lg font-mono tracking-widest border border-slate-300 rounded-md h-10 px-3 text-slate-900 placeholder:text-slate-400 bg-white"
                        data-testid="input-totp-enroll-code"
                      />
                      {enrollError && <p className="text-sm text-red-600">{enrollError}</p>}
                      <div className="flex gap-2">
                        <Button
                          onClick={cancelEnroll}
                          variant="outline"
                          className="flex-1"
                          data-testid="button-cancel-totp-enroll"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => confirmEnroll.mutate()}
                          disabled={confirmEnroll.isPending || enrollCode.length !== 6}
                          className="flex-1"
                          data-testid="button-confirm-totp-enroll"
                        >
                          {confirmEnroll.isPending ? "Verifying…" : "Confirm & link"}
                        </Button>
                      </div>
                      <div className="mt-2 p-3 bg-white rounded-md border border-slate-200">
                        <p className="text-[13px] font-semibold mb-2 text-slate-900">Recovery codes</p>
                        <p className="text-[11.5px] text-slate-500 mb-2">Save these — each works once if you lose your authenticator. You won't see them again.</p>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[13px]">
                          {enrollData.recoveryCodes.map((c) => (
                            <div key={c} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900" data-testid={`text-recovery-${c}`}>{c}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {data.totpEnrolled && (
          <Card className="p-5 space-y-3" data-testid="card-recovery-codes">
            <h2 className="text-[15px] font-semibold text-slate-900">Recovery codes</h2>
            <p className="text-[12.5px] text-slate-500">
              {data.recoveryCodesRemaining} code{data.recoveryCodesRemaining === 1 ? "" : "s"} remaining. Regenerate if you've lost the printed list or used most of them — old codes stop working immediately.
            </p>
            {!regeneratedCodes ? (
              <Button
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                variant="outline"
                data-testid="button-regenerate-recovery-codes"
              >
                {regenerate.isPending ? "Generating…" : "Regenerate recovery codes"}
              </Button>
            ) : (
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <p className="text-[11.5px] text-slate-500 mb-2">Save these — you won't see them again.</p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[13px]">
                  {regeneratedCodes.map((c) => (
                    <div key={c} className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-900" data-testid={`text-new-recovery-${c}`}>{c}</div>
                  ))}
                </div>
                <Button
                  onClick={() => setRegeneratedCodes(null)}
                  variant="ghost"
                  className="mt-3"
                  data-testid="button-dismiss-recovery-codes"
                >
                  I've saved them
                </Button>
              </div>
            )}
          </Card>
        )}

        <Card className="p-5 space-y-4" data-testid="card-change-password">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Change password</h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              {hasPassword
                ? "Use your current password to set a new one. Must be at least 8 characters."
                : "You sign in via Google or Apple, so there's no password on this account to change."}
            </p>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmitPassword || changePassword.isPending) return;
              changePassword.mutate();
            }}
          >
            <div>
              <label className="text-[12px] font-medium text-slate-700 block mb-1" htmlFor="current-password">
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (currentPwError) setCurrentPwError(null);
                }}
                disabled={!hasPassword || changePassword.isPending}
                className="w-full h-9 border border-slate-300 rounded-md px-3 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8] disabled:bg-slate-50 disabled:text-slate-400"
                data-testid="input-current-password"
              />
              {currentPwError && (
                <p className="text-[12px] text-rose-600 mt-1" data-testid="text-current-password-error">
                  {currentPwError}
                </p>
              )}
            </div>

            <div>
              <label className="text-[12px] font-medium text-slate-700 block mb-1" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={!hasPassword || changePassword.isPending}
                className="w-full h-9 border border-slate-300 rounded-md px-3 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8] disabled:bg-slate-50 disabled:text-slate-400"
                data-testid="input-new-password"
              />
              {newPwTooShort && (
                <p className="text-[12px] text-rose-600 mt-1" data-testid="text-new-password-error">
                  Must be at least 8 characters.
                </p>
              )}
            </div>

            <div>
              <label className="text-[12px] font-medium text-slate-700 block mb-1" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!hasPassword || changePassword.isPending}
                className="w-full h-9 border border-slate-300 rounded-md px-3 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8] disabled:bg-slate-50 disabled:text-slate-400"
                data-testid="input-confirm-password"
              />
              {mismatch && (
                <p className="text-[12px] text-rose-600 mt-1" data-testid="text-confirm-password-error">
                  Passwords don't match.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!canSubmitPassword || changePassword.isPending}
              data-testid="button-save-password"
            >
              {changePassword.isPending ? "Saving…" : "Save new password"}
            </Button>
          </form>
        </Card>
      </div>
    </AdminFrame>
  );
}
