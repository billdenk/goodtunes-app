// Task #538 — Reusable phone verification sheet.
//
// One component used by gifting, partner payout settings, and (when the
// recovery flow ships) account recovery. Caller passes the `reason` so
// the copy matches the moment ("Verify your phone to send a gift",
// "…to manage payouts"). On success the caller's `onVerified` fires;
// the caller is responsible for retrying the gated action.
//
// Two-step UI inside one sheet:
//   1) Phone-entry → POST /api/auth/phone/start
//   2) 6-digit code → POST /api/auth/phone/verify
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type PhoneVerifyReason = "gifting" | "payouts" | "recovery";

const REASON_COPY: Record<PhoneVerifyReason, { title: string; subtitle: string }> = {
  gifting: {
    title: "Verify your phone to send a gift",
    subtitle: "We'll text a 6-digit code so the recipient never gets a message from a wrong stranger.",
  },
  payouts: {
    title: "Verify your phone to manage payouts",
    subtitle: "We'll text a 6-digit code so withdrawals can't be changed without confirming it's you.",
  },
  recovery: {
    title: "Verify your phone for account recovery",
    subtitle: "We'll text a 6-digit code so you can recover this account if you ever lose access to your email.",
  },
};

type Props = {
  open: boolean;
  reason: PhoneVerifyReason;
  onClose: () => void;
  onVerified: (phoneE164: string) => void;
  initialPhone?: string;
};

export function PhoneVerifySheet({ open, reason, onClose, onVerified, initialPhone }: Props) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const { toast } = useToast();
  const copy = REASON_COPY[reason];

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setCode("");
      setError(null);
      setDevCode(null);
      setMaskedPhone(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiRequest("POST", "/api/auth/phone/start", { phone });
      const j = await r.json();
      if (j.alreadyVerified) {
        onVerified(phone);
        return;
      }
      setMaskedPhone(j.phoneMasked ?? null);
      setDevCode(j.devCode ?? null);
      setStep("code");
      toast({ title: "Code sent", description: `Check ${j.phoneMasked ?? phone}.` });
    } catch (e: any) {
      const msg = e?.body?.message || e?.message || "Couldn't send code";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiRequest("POST", "/api/auth/phone/verify", { code });
      const j = await r.json();
      toast({ title: "Phone verified", description: "You're all set." });
      onVerified(j.phoneE164 ?? phone);
    } catch (e: any) {
      const msg = e?.body?.message || e?.message || "Couldn't verify code";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      data-testid="sheet-phone-verify"
    >
      <div
        className="w-full sm:max-w-md bg-[color:var(--brand-bg)] sm:rounded-2xl rounded-t-2xl border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-white text-lg font-semibold" data-testid="text-phone-verify-title">{copy.title}</h2>
        <p className="text-white/60 text-sm mt-1">{copy.subtitle}</p>

        {step === "phone" ? (
          <>
            <label className="block text-white/70 text-xs mt-5 mb-1.5">Phone number</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (202) 555-1234"
              className="w-full h-11 px-3 rounded-md bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-[color:var(--brand-blue)]"
              data-testid="input-phone"
              autoFocus
            />
            {error && <p className="text-[color:var(--brand-pink)] text-sm mt-3" data-testid="text-phone-error">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-md bg-white/10 text-white font-medium"
                data-testid="button-phone-cancel"
              >Cancel</button>
              <button
                type="button"
                disabled={busy || !phone.trim()}
                onClick={sendCode}
                className="flex-1 h-11 rounded-md bg-[color:var(--brand-blue)] text-white font-semibold disabled:opacity-40"
                data-testid="button-phone-send"
              >{busy ? "Sending…" : "Send code"}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-white/70 text-xs mt-5">
              We sent a 6-digit code to <span className="text-white font-medium">{maskedPhone ?? phone}</span>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="123456"
              className="w-full h-11 px-3 mt-2 rounded-md bg-white/10 border border-white/15 text-white text-center text-lg tracking-[0.4em] placeholder:text-white/20 focus:outline-none focus:border-[color:var(--brand-blue)]"
              data-testid="input-phone-code"
              autoFocus
            />
            {devCode && (
              <p className="text-white/40 text-xs mt-2" data-testid="text-phone-devcode">
                Dev code (server logs only in production): <span className="text-white/70 font-mono">{devCode}</span>
              </p>
            )}
            {error && <p className="text-[color:var(--brand-pink)] text-sm mt-3" data-testid="text-phone-error">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => { setStep("phone"); setCode(""); setError(null); }}
                className="flex-1 h-11 rounded-md bg-white/10 text-white font-medium"
                data-testid="button-phone-back"
              >Back</button>
              <button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={verify}
                className="flex-1 h-11 rounded-md bg-[color:var(--brand-blue)] text-white font-semibold disabled:opacity-40"
                data-testid="button-phone-verify"
              >{busy ? "Verifying…" : "Verify"}</button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={sendCode}
              className="mt-3 text-white/55 text-xs underline underline-offset-2"
              data-testid="button-phone-resend"
            >Resend code</button>
          </>
        )}
      </div>
    </div>
  );
}
