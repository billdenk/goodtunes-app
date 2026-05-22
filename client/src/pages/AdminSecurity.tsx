import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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

  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
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
      const res = await apiRequest("POST", "/api/auth/totp/enroll/start");
      return res.json();
    },
    onSuccess: (j) => setEnrollData({ qr: j.qr, secret: j.secret, recoveryCodes: j.recoveryCodes }),
    onError: (e: any) => toast({ title: e?.message ?? "Couldn't start enrollment", variant: "destructive" }),
  });

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
      const res = await apiRequest("POST", "/api/auth/totp/enroll/verify", { code: enrollCode.trim() });
      return res.json();
    },
    onSuccess: () => {
      setEnrollCode("");
      setEnrollError(null);
      // After enrolling, flip the preference to TOTP — that's the whole
      // point of the admin walking through this flow.
      switchPref.mutate("totp");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/factor-preference"] });
      toast({ title: "Authenticator linked" });
      // Keep enrollData visible so the admin can copy recovery codes;
      // they only show this once.
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

            <label className={`flex items-start gap-3 p-3 rounded-md border border-slate-200 ${data.totpEnrolled ? "cursor-pointer hover:bg-slate-50" : "opacity-60"}`} data-testid="option-factor-totp">
              <input
                type="radio"
                checked={data.factorPref === "totp"}
                onChange={() => data.totpEnrolled && switchPref.mutate("totp")}
                disabled={!data.totpEnrolled}
                className="mt-1"
                data-testid="input-factor-totp"
              />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-slate-900">Authenticator app</div>
                <div className="text-[12.5px] text-slate-500">
                  {data.totpEnrolled
                    ? `Linked. ${data.recoveryCodesRemaining} recovery code${data.recoveryCodesRemaining === 1 ? "" : "s"} remaining.`
                    : "Not set up. Use the button below to add an authenticator."}
                </div>
              </div>
            </label>
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

        {!data.totpEnrolled && (
          <Card className="p-5 space-y-3">
            <h2 className="text-[15px] font-semibold text-slate-900">Add an authenticator app</h2>
            <p className="text-[12.5px] text-slate-500">Scan the QR with Google Authenticator, 1Password, Authy, etc., then enter the 6-digit code to confirm.</p>
            {!enrollData ? (
              <Button onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending} data-testid="button-start-totp-enroll">
                {startEnroll.isPending ? "Preparing…" : "Set up authenticator"}
              </Button>
            ) : (
              <div className="space-y-3 max-w-sm">
                <img src={enrollData.qr} alt="2FA QR code" className="mx-auto w-40 h-40 border border-slate-200 rounded" />
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
                  className="w-full text-center text-lg font-mono tracking-widest border border-slate-300 rounded-md h-10 px-3 text-slate-900 placeholder:text-slate-400"
                  data-testid="input-totp-enroll-code"
                />
                {enrollError && <p className="text-sm text-red-600">{enrollError}</p>}
                <Button
                  onClick={() => confirmEnroll.mutate()}
                  disabled={confirmEnroll.isPending || enrollCode.length !== 6}
                  className="w-full"
                  data-testid="button-confirm-totp-enroll"
                >
                  {confirmEnroll.isPending ? "Verifying…" : "Confirm & link"}
                </Button>
                <div className="mt-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                  <p className="text-[13px] font-semibold mb-2 text-slate-900">Recovery codes</p>
                  <p className="text-[11.5px] text-slate-500 mb-2">Save these — each works once if you lose your authenticator. You won't see them again.</p>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[13px]">
                    {enrollData.recoveryCodes.map((c) => (
                      <div key={c} className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-900" data-testid={`text-recovery-${c}`}>{c}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </AdminFrame>
  );
}
