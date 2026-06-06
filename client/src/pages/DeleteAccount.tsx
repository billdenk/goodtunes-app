import { useEffect } from "react";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";

/**
 * Task #1496 — Public "Delete your account" page.
 *
 * Google Play's Data safety form requires a publicly reachable URL that
 * explains how a user can request account + data deletion. In-app deletion
 * already exists (Account → Privacy → Delete My Account); this page documents
 * those steps and what is removed vs. retained, and is linked from the store
 * listing. Intentionally public (no auth gate) and host-agnostic so it
 * resolves on goodtunes.music/delete-account.
 */
export default function DeleteAccount() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Delete Your Account — GoodTunes®";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div
      className="min-h-[100dvh] w-full px-5 py-12 sm:py-16"
      style={{ backgroundColor: "var(--brand-bg)" }}
      data-testid="page-delete-account"
    >
      <div className="mx-auto w-full max-w-[640px] text-fan-primary">
        <div className="mb-8 flex justify-center">
          <GoodTunesLogo size="md" variant="white" />
        </div>

        <h1
          className="text-center text-2xl font-semibold leading-tight"
          data-testid="text-delete-account-title"
        >
          Delete your GoodTunes account
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-fan-secondary">
          You can permanently delete your GoodTunes account and personal data at
          any time, directly from the app. Here's how it works and what happens
          to your data.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">How to delete your account</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-fan-secondary">
            <li data-testid="step-delete-1">
              <span className="font-semibold text-fan-primary">1.</span> Open the
              GoodTunes app and sign in to your account.
            </li>
            <li data-testid="step-delete-2">
              <span className="font-semibold text-fan-primary">2.</span> Go to{" "}
              <span className="font-semibold text-fan-primary">
                Account → Privacy
              </span>
              .
            </li>
            <li data-testid="step-delete-3">
              <span className="font-semibold text-fan-primary">3.</span> Tap{" "}
              <span className="font-semibold text-fan-primary">
                Delete My Account
              </span>{" "}
              and confirm. You'll be signed out and the account can't be used to
              sign back in.
            </li>
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">What gets deleted</h2>
          <p className="mt-3 text-sm leading-relaxed text-fan-secondary">
            Deleting your account permanently removes your personal data,
            including:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-relaxed text-fan-secondary">
            <li>Your profile and contact details (name, email)</li>
            <li>Your saved favorites and playlists</li>
            <li>Your library and listening history</li>
            <li>Connected sign-in identities (e.g. Google or Apple)</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">What we keep</h2>
          <p className="mt-3 text-sm leading-relaxed text-fan-secondary">
            Records of past purchases and orders are retained for legal,
            tax, and accounting requirements. These records are no longer linked
            to your personal profile after deletion. This step can't be undone.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Need help?</h2>
          <p className="mt-3 text-sm leading-relaxed text-fan-secondary">
            If you can't access the app or need assistance deleting your
            account, email us at{" "}
            <a
              href="mailto:support@goodtunes.music?subject=Delete%20my%20account"
              className="font-semibold underline"
              style={{ color: "var(--brand-blue)" }}
              data-testid="link-delete-account-support"
            >
              support@goodtunes.music
            </a>{" "}
            and we'll process your request.
          </p>
        </section>

        <p className="mt-12 text-center text-xs text-fan-secondary/70">
          © {new Date().getFullYear()} GoodTunes®
        </p>
      </div>
    </div>
  );
}
