import { useEffect, useMemo, useState } from "react";
import { FriendlyError } from "@/components/FriendlyError";

/**
 * Task #284 — Dedicated /error landing. OAuth callback failures
 * redirect here with ?source=oauth&provider=…&step=…&message=…&detail=…
 * instead of dumping plain text from a 502. Anything else that needs a
 * full-page friendly error (route-level fatal toasts, future surfaces)
 * can navigate here with the same query shape.
 */
export default function ErrorPage() {
  const params = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const source = params.get("source") || "app";
  const provider = params.get("provider");
  const step = params.get("step");
  const message = params.get("message") || "Something went wrong.";
  const detail = params.get("detail");

  const [explanation, headline] = useMemo(() => {
    if (source === "oauth") {
      const p = provider === "apple" ? "Apple" : provider === "google" ? "Google" : "the provider";
      return [
        `We couldn't finish signing you in with ${p}. You can try again, or send this to GoodTunes so we can investigate.`,
        `Sign-in with ${p} hit a snag`,
      ];
    }
    return [message, "Something went wrong"];
  }, [source, provider, message]);

  // Clear the noisy query string so a refresh from this page doesn't
  // re-trigger any host-based redirect with the same params still in
  // the bar. Keep the params in component state via useMemo above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search) {
      window.history.replaceState({}, "", "/error");
    }
  }, []);

  return (
    <FriendlyError
      headline={headline}
      explanation={explanation}
      context={{
        source,
        provider,
        step,
        serverBody: detail,
      }}
      error={{ name: source === "oauth" ? "OAuthError" : "AppError", message: detail || message }}
      onRetry={() => {
        if (source === "oauth") {
          window.location.href = "/login";
        } else {
          window.history.back();
        }
      }}
      onReload={() => window.location.reload()}
      testIdPrefix="error-page"
    />
  );
}
