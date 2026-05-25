import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  sendErrorReport,
  type ErrorReportResult,
  type FriendlyErrorContext,
  type FriendlyErrorInfo,
} from "@/lib/errorReport";

type Variant = "page" | "inline";

interface Props {
  headline?: string;
  explanation?: string;
  context: FriendlyErrorContext;
  error?: FriendlyErrorInfo | null;
  knownEmail?: string | null;
  onRetry?: () => void;
  onReload?: () => void;
  variant?: Variant;
  testIdPrefix?: string;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const BRAND_BG = "var(--brand-bg)";
const BRAND_BLUE = "var(--brand-blue)";
const BRAND_MINT = "var(--brand-mint)";
const BRAND_PINK = "var(--brand-pink)";

/**
 * Task #284 — Reusable, calm, brand-styled error card with a one-tap
 * "Send this to GoodTunes" action. Shared by the global React error
 * boundary, the dedicated /error landing (OAuth callback failures
 * bounce there), and any inline failure surface (e.g. signup verify).
 *
 * - When the viewer is signed in (or we already have an email), the
 *   primary action sends immediately and confirms the reply address.
 * - Otherwise it expands into an email mini-form so the user can be
 *   notified when we ship a fix.
 * - Technical detail is tucked behind a "Show details" disclosure.
 * - If our /api/error-reports send fails, we fall back to a `mailto:`
 *   link with the same payload pre-filled.
 */
export function FriendlyError({
  headline = "Something went wrong",
  explanation = "We're sorry — that didn't work. You can try again, or send the details to GoodTunes so we can look at it.",
  context,
  error,
  knownEmail,
  onRetry,
  onReload,
  variant = "page",
  testIdPrefix = "friendly-error",
}: Props) {
  const { user } = useAuth();
  const presumedEmail = knownEmail ?? user?.email ?? null;

  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ErrorReportResult | null>(null);
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  const summary = useMemo(() => {
    if (context.source === "oauth")
      return `Sign-in with ${context.provider ?? "an external provider"} failed${context.step ? ` (${context.step})` : ""}.`;
    if (context.source === "signup-verify") return "A fan couldn't finish creating their account.";
    if (context.source === "global-boundary") return "The app hit an unhandled error.";
    return "GoodTunes hit an error.";
  }, [context.source, context.provider, context.step]);

  const doSend = async (emailOverride?: string | null) => {
    setSending(true);
    setResult(null);
    const r = await sendErrorReport({
      summary,
      context,
      error: error ?? null,
      reporterEmail: (emailOverride ?? presumedEmail) || null,
    });
    setSending(false);
    setResult(r);
  };

  const handlePrimary = () => {
    if (presumedEmail) {
      doSend(presumedEmail);
      return;
    }
    setEmailFormVisible(true);
  };

  const handleSendWithTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(emailInput)) return;
    doSend(emailInput.trim());
  };

  const isPage = variant === "page";

  const techDetail = useMemo(() => {
    const bits: string[] = [];
    if (error?.name || error?.message) bits.push(`${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`);
    if (context.serverBody) bits.push(`Server response:\n${context.serverBody}`);
    if (error?.stack) bits.push(`Stack:\n${error.stack}`);
    return bits.join("\n\n");
  }, [error, context.serverBody]);

  const replyAddress = result && result.ok ? result.replyTo : null;

  const body = (
    <div className={isPage ? "max-w-[440px] mx-auto pt-10" : "w-full"}>
      <h1 className="text-xl font-bold mb-1" data-testid={`${testIdPrefix}-headline`}>{headline}</h1>
      <p className="text-white/70 text-sm mb-4" data-testid={`${testIdPrefix}-explanation`}>{explanation}</p>

      {result && result.ok && (
        <div
          className="rounded-xl border p-4 mb-4 text-sm text-white"
          style={{ background: "color-mix(in srgb, var(--brand-mint) 10%, transparent)", borderColor: "color-mix(in srgb, var(--brand-mint) 30%, transparent)" }}
          data-testid={`${testIdPrefix}-sent-confirmation`}
        >
          Thanks — we've got it.
          {replyAddress
            ? <> We'll be in touch at <strong className="font-semibold" style={{ color: BRAND_MINT }}>{replyAddress}</strong> as soon as we've fixed it.</>
            : <> We'll take a look and follow up if we need anything else.</>}
        </div>
      )}

      {result && !result.ok && (
        <div
          className="rounded-xl border p-4 mb-4 text-sm text-white"
          style={{ background: "color-mix(in srgb, var(--brand-pink) 10%, transparent)", borderColor: "color-mix(in srgb, var(--brand-pink) 30%, transparent)" }}
          data-testid={`${testIdPrefix}-send-failed`}
        >
          We couldn't send that from here ({result.reason}). Open your mail app instead?
          <div className="mt-2">
            <a
              href={result.mailto}
              className="inline-block h-9 px-3 rounded-lg text-white font-semibold text-sm leading-9"
              style={{ background: BRAND_BLUE }}
              data-testid={`${testIdPrefix}-mailto-fallback`}
            >
              Email admin@goodtunes.music
            </a>
          </div>
        </div>
      )}

      {!result?.ok && (
        <>
          {!emailFormVisible && (
            <div className="flex flex-col gap-2 mb-3">
              <button
                type="button"
                onClick={handlePrimary}
                disabled={sending}
                className="h-11 rounded-lg text-white font-semibold text-sm active:opacity-70 disabled:opacity-50"
                style={{ background: BRAND_BLUE }}
                data-testid={`${testIdPrefix}-send`}
              >
                {sending ? "Sending…" : "Send this to GoodTunes"}
              </button>
              {presumedEmail && (
                <p className="text-white/55 text-xs">
                  We'll reply to <strong className="text-white/80">{presumedEmail}</strong> as soon as we've fixed it.
                </p>
              )}
            </div>
          )}

          {emailFormVisible && (
            <form onSubmit={handleSendWithTyped} className="flex flex-col gap-2 mb-3">
              <label className="text-white/70 text-xs" htmlFor={`${testIdPrefix}-email`}>
                So we can let you know when it's fixed:
              </label>
              <input
                id={`${testIdPrefix}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-lg bg-white/5 border border-white/15 px-3 text-white text-sm placeholder-white/30"
                data-testid={`${testIdPrefix}-email-input`}
              />
              <button
                type="submit"
                disabled={sending || !isValidEmail(emailInput)}
                className="h-11 rounded-lg text-white font-semibold text-sm active:opacity-70 disabled:opacity-50"
                style={{ background: BRAND_BLUE }}
                data-testid={`${testIdPrefix}-send-with-email`}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </>
      )}

      {(onRetry || onReload) && (
        <div className="flex gap-2 mb-4">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 h-11 rounded-lg bg-white/10 text-white font-semibold text-sm active:opacity-70"
              data-testid={`${testIdPrefix}-retry`}
            >
              Try again
            </button>
          )}
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="flex-1 h-11 rounded-lg bg-white/10 text-white font-semibold text-sm active:opacity-70"
              data-testid={`${testIdPrefix}-reload`}
            >
              Reload
            </button>
          )}
        </div>
      )}

      {techDetail && (
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="w-full px-4 h-10 text-left text-white/70 text-xs flex items-center justify-between active:opacity-70"
            data-testid={`${testIdPrefix}-toggle-details`}
          >
            <span>{showTechnical ? "Hide" : "Show"} technical details</span>
            <span className="text-white/40 text-xs">{showTechnical ? "▾" : "▸"}</span>
          </button>
          {showTechnical && (
            <pre
              className="px-4 pb-3 text-white/60 text-xs font-mono whitespace-pre-wrap break-all max-h-[40vh] overflow-auto"
              data-testid={`${testIdPrefix}-technical`}
            >
              {techDetail}
            </pre>
          )}
        </div>
      )}
    </div>
  );

  if (!isPage) {
    return <div className="w-full text-white" data-testid={testIdPrefix}>{body}</div>;
  }
  return (
    <main
      className="min-h-screen w-full text-white p-5 overflow-auto"
      style={{ background: BRAND_BG }}
      data-testid={testIdPrefix}
    >
      {body}
    </main>
  );
}
