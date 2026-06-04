// Apple sends the user's real name ONLY in the `user` field of the
// form_post callback body, and ONLY on the very first authorization — never
// in the id_token and never on later sign-ins. This folds firstName +
// lastName into `identity.name` so we mint the account with the fan's actual
// name instead of guessing from the email local-part. It's a no-op for
// Google, for Apple sign-ins without a `user` body (every sign-in after the
// first), and for malformed bodies. Extracted from handleProviderCallback so
// the parse can be unit-tested. Shape: { name: { firstName, lastName }, … }.

export type IdentityWithName = { name?: string | null };

export function applyAppleFirstAuthName<T extends IdentityWithName>(
  identity: T,
  provider: "google" | "apple",
  body: any,
): T {
  if (provider !== "apple" || !body?.user) return identity;
  try {
    const appleUser = typeof body.user === "string" ? JSON.parse(body.user) : body.user;
    const first = String(appleUser?.name?.firstName ?? "").trim();
    const last = String(appleUser?.name?.lastName ?? "").trim();
    const full = [first, last].filter(Boolean).join(" ").trim();
    if (full) identity.name = full;
  } catch (err: any) {
    console.warn(`[oauth] apple first-auth name parse failed: ${err?.message}`);
  }
  return identity;
}
