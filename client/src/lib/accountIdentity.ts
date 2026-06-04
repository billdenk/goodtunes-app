// Pure derivation for the Account profile header. The profile leads with
// the fan's full name — real name first, falling back to display name —
// and NEVER the email. Initials follow the same source so a "Bill Denk"
// account shows "BD", not a single "B". Extracted from Account.tsx so the
// rules (real-name preference, two-letter initials, @handle-only-with-name,
// email never used) can be unit-tested without standing up the page.

export type AccountIdentityUser = {
  realName?: string | null;
  displayName?: string | null;
  handle?: string | null;
  username?: string | null;
  email?: string | null;
} | null | undefined;

export type AccountIdentity = {
  /** Full name (real name preferred, then display name), trimmed. */
  fullName: string;
  /** @-style handle (handle preferred, then username), no leading @. */
  handle: string;
  /** Up to two uppercase initials from the name, else the handle, else "?". */
  initials: string;
  /** The primary identity line: name, else @handle, else "Your account". */
  nameLine: string;
  /** Secondary handle line is shown only when BOTH a name and a handle exist. */
  showHandleLine: boolean;
};

export function deriveAccountIdentity(user: AccountIdentityUser): AccountIdentity {
  const fullName = (user?.realName || "").trim() || (user?.displayName || "").trim();
  const handle = user?.handle || user?.username || "";
  const initials = fullName
    ? fullName
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : handle
      ? handle.slice(0, 2).toUpperCase()
      : "?";
  const nameLine = fullName || (handle ? `@${handle}` : "Your account");
  const showHandleLine = Boolean(fullName && handle);
  return { fullName, handle, initials, nameLine, showHandleLine };
}
