// Transactional email via Resend.
//
// Kept deliberately tiny: one function per template, fetch-based (no SDK
// dependency), and a no-op fallback when RESEND_API_KEY is missing so dev
// boxes still boot. The existing console.log in non-prod stays in place
// so an admin can grab the code from the workflow log without an inbox.
//
// Free Resend tier requires either:
//   - sending FROM `onboarding@resend.dev` and TO the email the Resend
//     account was registered with, OR
//   - a verified sending domain (e.g. mail.goodtunes.music).
// We default to the first; once a domain is verified in Resend, set:
//   - MAIL_FROM       e.g. `GoodTunes <invites@goodtunes.music>`
//   - MAIL_REPLY_TO   e.g. `bill@gogoods.com` so replies route to a human
// in Secrets and no redeploy is required. MAIL_REPLY_TO is optional —
// if unset, recipients reply directly to MAIL_FROM.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getFromAddress(): string {
  return process.env.MAIL_FROM || "GoodTunes <onboarding@resend.dev>";
}

function getReplyTo(): string | null {
  const v = (process.env.MAIL_REPLY_TO || "").trim();
  return v.length > 0 ? v : null;
}

// --- Branded email header logo -------------------------------------------
// Email clients strip SVG and won't load relative paths, so we render the
// GoodTunes WORDMARK as an absolutely-addressed PNG. The files live in
// client/public/ (served at the app root); PUBLIC_ORIGIN matches the rest
// of the server's absolute-link construction. To host the logo somewhere
// republish-independent (e.g. object storage) without a code change, set
// MAIL_LOGO_URL (color, light backgrounds) and/or MAIL_LOGO_URL_WHITE
// (white, dark navy backgrounds) to a full https URL.
const MAIL_LOGO_W = 96;
const MAIL_LOGO_H = 58;
function mailAssetBase(): string {
  return (process.env.PUBLIC_ORIGIN || "https://admin.goodtunes.music").replace(/\/+$/, "");
}
function emailLogoImg(variant: "color" | "white"): string {
  const fallback = `${mailAssetBase()}/goodtunes-logo-${variant === "white" ? "white" : "color"}.png`;
  const override = (variant === "white" ? process.env.MAIL_LOGO_URL_WHITE : process.env.MAIL_LOGO_URL) || "";
  const src = override.trim() || fallback;
  return `<img src="${src}" alt="GoodTunes" width="${MAIL_LOGO_W}" height="${MAIL_LOGO_H}" style="display:block;width:${MAIL_LOGO_W}px;height:${MAIL_LOGO_H}px;border:0;outline:none;text-decoration:none;margin:0 0 18px;" />`;
}

type SendResult = { ok: true } | { ok: false; reason: string };

// Synthetic recipient guard — Task #380.
//
// History: between May 23–24 2026, an ad-hoc QA pass for the customer
// forgot-password endpoint sent live Resend mail to `reset-test-N@example.com`
// addresses. Every one of those messages bounced and Resend records the
// bounces against our sending domain's reputation forever, which silently
// dragged Workspace deliverability down for real recipients (Bill's
// `bill@gogoods.com` reset mail was being quarantined as a result).
//
// Defense in depth: regardless of where the mail-send call originates
// from (route handler, script, future test harness), if the recipient
// domain is one of the IANA-reserved synthetic domains, we drop the
// send here without touching Resend. The caller still gets a SendResult
// so its control flow is unchanged.
const SYNTHETIC_RECIPIENT_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test",
  "invalid",
  "localhost",
]);
function recipientDomain(to: string): string {
  const at = to.lastIndexOf("@");
  return at < 0 ? "(no-domain)" : to.slice(at + 1).trim().toLowerCase();
}
function isSyntheticRecipient(to: string): boolean {
  const domain = recipientDomain(to);
  if (SYNTHETIC_RECIPIENT_DOMAINS.has(domain)) return true;
  // RFC 2606 reserved TLDs + the common .example second-level sink.
  return (
    domain.endsWith(".test") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".example") ||
    domain.endsWith(".localhost")
  );
}

// Ring buffer of recent mail-send failures so an operator can spot a
// stuck queue without trawling logs. Bounded to keep memory honest in
// long-running prod processes. `getRecentMailFailures()` is exported
// for use by an admin debug surface if one wants to render it.
export type MailFailure = {
  ts: string;
  template: string;
  recipientDomain: string;
  reason: string;
};
const recentMailFailures: MailFailure[] = [];
const MAX_RECENT_FAILURES = 50;
function pushFailure(f: MailFailure): void {
  recentMailFailures.push(f);
  if (recentMailFailures.length > MAX_RECENT_FAILURES) recentMailFailures.shift();
}
export function getRecentMailFailures(): MailFailure[] {
  return [...recentMailFailures];
}

function logFailure(template: string, to: string, reason: string): void {
  const domain = recipientDomain(to);
  // Structured single-line log so `rg '[mail-failure]'` works in prod
  // log search and any field can be parsed back out. Recipient address
  // is intentionally truncated to domain only — the full local-part is
  // PII we don't need in operator logs.
  console.warn(
    `[mail-failure] template=${template} recipient_domain=${domain} reason=${JSON.stringify(reason)}`,
  );
  pushFailure({ ts: new Date().toISOString(), template, recipientDomain: domain, reason });
}

async function sendViaResend(
  templateName: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  replyToOverride?: string | null,
): Promise<SendResult> {
  if (isSyntheticRecipient(to)) {
    // Don't even call Resend — bounces from synthetic domains permanently
    // damage sender reputation. Distinct log line so we can spot a test
    // path that's still trying to send to a sink.
    console.log(
      `[mail-skip] template=${templateName} recipient_domain=${recipientDomain(to)} reason=synthetic-recipient`,
    );
    return { ok: false, reason: "synthetic recipient (skipped)" };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const reason = "RESEND_API_KEY not set";
    // Don't push to the failure buffer — this is an expected dev state,
    // not a deliverability incident worth flagging in an operator UI.
    return { ok: false, reason };
  }
  try {
    const replyTo = (replyToOverride && replyToOverride.trim().length > 0) ? replyToOverride.trim() : getReplyTo();
    const body: Record<string, unknown> = { from: getFromAddress(), to, subject, html, text };
    if (replyTo) body.reply_to = replyTo;
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const reason = `resend ${r.status}: ${body.slice(0, 200)}`;
      logFailure(templateName, to, reason);
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (e) {
    const reason = `resend fetch threw: ${(e as Error).message}`;
    logFailure(templateName, to, reason);
    return { ok: false, reason };
  }
}

// Send an admin login code. Returns ok/reason — caller logs the reason
// to the server console but never leaks it to the client, so an admin
// can't probe whether the email channel is misconfigured by triggering
// the resend endpoint.
export async function sendAdminOtpEmail(toEmail: string, code: string, ttlMinutes: number): Promise<SendResult> {
  const subject = `Your GoodTunes admin code: ${code}`;
  const text = [
    `Your GoodTunes admin sign-in code is ${code}.`,
    ``,
    `It expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't try to sign in, you can ignore this email — your password is still safe.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Admin</div>
      <h1 style="font-size: 28px; margin: 12px 0 24px; font-weight: 700;">Your sign-in code</h1>
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 20px 24px; background: #f4f4f7; border-radius: 12px; text-align: center; font-family: 'SF Mono', Menlo, Consolas, monospace;">${code}</div>
      <p style="font-size: 15px; color: #444; margin-top: 24px; line-height: 1.5;">Enter this code in the GoodTunes admin sign-in screen. It expires in <strong>${ttlMinutes} minutes</strong>.</p>
      <p style="font-size: 13px; color: #888; margin-top: 32px; line-height: 1.5;">If you didn't try to sign in, you can ignore this email — your password is still safe.</p>
    </div>
  `;
  return sendViaResend("admin-otp", toEmail, subject, html, text);
}

// Send a customer signup code. Fan-facing copy ("Welcome to GoodTunes")
// distinct from the admin OTP template — same Resend transport, same
// ok/reason contract so the caller decides whether to fall back to a
// dev console log + devCode echo.
export async function sendCustomerSignupCodeEmail(toEmail: string, code: string, ttlMinutes: number): Promise<SendResult> {
  const subject = `Welcome to GoodTunes — your sign-in code: ${code}`;
  const text = [
    `Welcome to GoodTunes!`,
    ``,
    `Your sign-in code is ${code}.`,
    ``,
    `Enter it on the sign-in screen to finish creating your account. It expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't ask to sign in, you can safely ignore this email.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #319ED8; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">Welcome</div>
      <h1 style="font-size: 28px; margin: 12px 0 24px; font-weight: 700;">Your sign-in code</h1>
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 20px 24px; background: #f4f4f7; border-radius: 12px; text-align: center; font-family: 'SF Mono', Menlo, Consolas, monospace; color: #00062B;">${code}</div>
      <p style="font-size: 15px; color: #444; margin-top: 24px; line-height: 1.5;">Pop this code back into the sign-in screen to finish creating your account. It expires in <strong>${ttlMinutes} minutes</strong>.</p>
      <p style="font-size: 13px; color: #888; margin-top: 32px; line-height: 1.5;">If you didn't ask to sign in, you can safely ignore this email — no account will be created.</p>
    </div>
  `;
  return sendViaResend("customer-signup-code", toEmail, subject, html, text);
}

// Task #400 — One-time welcome-back mail for the ~1,850 imported
// gogoods.com fans. The link below carries a single-use 30-day token
// that signs the recipient straight in (no password) and drops them
// into the 3-screen onboarding (pick handle → confirm name → tour
// their library). Sent at most once per address — we stamp
// `welcomeEmailSentAt` on success so a future retry batch can target
// only the un-mailed remainder.
import { WELCOME_BACK_WHATS_NEW } from "@shared/welcomeBack";

export async function sendWelcomeBackEmail(toEmail: string, displayName: string | null, signInUrl: string): Promise<SendResult> {
  const friendly = (displayName ?? "").trim() || "there";
  const subject = `${friendly}, your GoodTunes player is ready — your gogoods library is inside`;
  const bullets = WELCOME_BACK_WHATS_NEW;

  const text = [
    `Hi ${friendly},`,
    ``,
    `Welcome back. Your gogoods.com purchases just moved into the new GoodTunes player — every album you ever bought is waiting, ready to stream.`,
    ``,
    `Tap to open your library (no password — this link signs you in):`,
    signInUrl,
    ``,
    `While you were away:`,
    ...bullets.map((b) => `  • ${b.title} ${b.body}`),
    ``,
    `On your first tap-in we'll ask you to pick a @handle, confirm the name to show on your profile, and then drop you straight into your library.`,
    ``,
    `The link is good for 30 days and works once. After that, sign in at https://my.goodtunes.fm with this email and tap "Email me a sign-in code".`,
    ``,
    `— The GoodTunes team`,
  ].join("\n");

  const bulletsHtml = bullets
    .map(
      (b) => `
      <li style="margin: 0 0 10px; padding: 0; line-height: 1.5;">
        <strong style="color: #1a1a1a;">${escapeHtml(b.title)}</strong>
        <span style="color: #4a4a4a;"> ${escapeHtml(b.body)}</span>
      </li>`,
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #319ED8; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">Welcome back</div>
      <h1 style="font-size: 26px; margin: 12px 0 16px; font-weight: 700; line-height: 1.2;">Hi ${escapeHtml(friendly)}, your player is ready.</h1>
      <p style="font-size: 15px; color: #333; line-height: 1.55; margin: 0 0 20px;">
        Your gogoods.com purchases just moved into the new <strong>GoodTunes</strong> player — every album you ever bought is waiting, ready to stream.
      </p>
      <p style="margin: 28px 0;">
        <a href="${signInUrl}" style="display: inline-block; background: linear-gradient(135deg, #1D5E8F, #319ED8); color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 15px;">Open my GoodTunes player</a>
      </p>
      <h2 style="font-size: 14px; color: #319ED8; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; margin: 32px 0 12px;">While you were away</h2>
      <ul style="list-style: disc; padding-left: 18px; margin: 0 0 24px; font-size: 14px;">
        ${bulletsHtml}
      </ul>
      <p style="font-size: 14px; color: #333; line-height: 1.55; margin: 0 0 16px;">
        On your first tap-in we'll ask you to pick a <strong>@handle</strong>, confirm the name to show on your profile, and then drop you straight into your library.
      </p>
      <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0 0 6px;">
        This link signs you in — no password needed. It's good for 30 days and works once.
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.55; margin: 24px 0 0;">
        After that, sign in at <a href="https://my.goodtunes.fm" style="color: #319ED8;">my.goodtunes.fm</a> with this email and tap "Email me a sign-in code".
      </p>
    </div>
  `;
  return sendViaResend("customer-welcome-back", toEmail, subject, html, text);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Generic operational-alert email used by server/opsAlert.ts. Plain,
// unbranded, monospace body so on-call reads the signal fast. All
// throttling/dedup lives in opsAlert.ts; this only handles delivery and
// reuses the same Resend transport (synthetic-recipient guard + failure
// ring buffer) as every other template.
export async function sendOpsAlertEmail(
  toEmail: string,
  subject: string,
  bodyText: string,
): Promise<SendResult> {
  const html = `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <div style="font-size: 13px; color: #FF5470; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700;">GoodTunes ops alert</div>
      <h1 style="font-size: 18px; margin: 10px 0 16px; font-weight: 700; line-height: 1.3;">${escapeHtml(subject)}</h1>
      <pre style="white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; background: #f4f4f7; padding: 16px; border-radius: 8px; color: #1a1a1a; margin: 0;">${escapeHtml(bodyText)}</pre>
    </div>
  `;
  return sendViaResend("ops-alert", toEmail, subject, html, bodyText);
}

// Task #256 — Notify super-admins that a customer landed on the admin
// shell and is asking to be promoted. One email per (customer, day) is
// enforced by the caller via admin_access_requests.last_notified_at;
// this function only handles delivery.
export async function sendAdminAccessRequestEmail(
  toEmail: string,
  requester: { displayName: string; email: string; customerId: string },
  adminOrigin: string,
): Promise<SendResult> {
  const linkUrl = `${adminOrigin}/admin/customers/${requester.customerId}`;
  const subject = `${requester.displayName} is asking for GoodTunes admin access`;
  const text = [
    `${requester.displayName} <${requester.email}> tried to open the GoodTunes admin shell while signed in as a fan.`,
    ``,
    `If you want to give them access, open their customer profile and use "Make admin…":`,
    linkUrl,
    ``,
    `Otherwise you can ignore this email — they cannot reach the admin shell without being promoted.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Admin</div>
      <h1 style="font-size: 22px; margin: 12px 0 12px; font-weight: 700;">Access requested</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">
        <strong>${requester.displayName}</strong> &lt;${requester.email}&gt; tried to open the admin shell while signed in as a fan.
      </p>
      <p style="margin: 24px 0;">
        <a href="${linkUrl}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">Open their profile</a>
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.5;">If you want to grant access, use the &ldquo;Make admin&hellip;&rdquo; action on their row. Otherwise you can ignore this email — they cannot reach the admin shell without being promoted.</p>
    </div>
  `;
  return sendViaResend("admin-access-request", toEmail, subject, html, text);
}

// Task #269 — Admin "Forgot password?" reset link. Always called from
// a neutral 200 endpoint, so the caller can't use mail-send failure to
// probe account existence. Mirror the OTP template visually so the
// fan-vs-admin email separation stays clean.
export async function sendAdminPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
  ttlMinutes: number,
): Promise<SendResult> {
  const subject = `Reset your GoodTunes admin password`;
  const text = [
    `Someone (hopefully you) asked to reset the password for your GoodTunes admin account.`,
    ``,
    `Open this link to choose a new password (expires in ${ttlMinutes} minutes):`,
    resetUrl,
    ``,
    `You'll still need your authenticator code (or email code) to sign in after resetting.`,
    ``,
    `If you didn't request this, you can ignore this email — your password is unchanged.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Admin</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700;">Reset your password</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">Someone (hopefully you) asked to reset the password for your GoodTunes admin account.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">Choose a new password</a>
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.5;">Or paste this URL into your browser:<br /><span style="color: #319ED8; word-break: break-all;">${resetUrl}</span></p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">This link expires in <strong>${ttlMinutes} minutes</strong> and can only be used once. You'll still need your authenticator code (or email code) to sign in after resetting.</p>
      <p style="font-size: 13px; color: #888; margin-top: 16px;">If you didn't request this, you can ignore this email — your password is unchanged.</p>
    </div>
  `;
  return sendViaResend("admin-password-reset", toEmail, subject, html, text);
}

// Task #272 — Confirmation email sent AFTER a successful admin password
// reset. Best-effort: callers ignore failures so the reset itself
// always lands. Mirrors the bank-style "this wasn't me" pattern so an
// admin can spot a phished reset link.
export async function sendAdminPasswordResetConfirmationEmail(
  toEmail: string,
  opts: { whenIso: string; country?: string | null; region?: string | null; contactEmail: string },
): Promise<SendResult> {
  const subject = `Your GoodTunes admin password was just reset`;
  const locBits = [opts.region, opts.country].filter((x) => x && String(x).trim().length > 0);
  const locText = locBits.length > 0 ? ` (near ${locBits.join(", ")})` : "";
  const text = [
    `Your GoodTunes admin password was just reset at ${opts.whenIso}${locText}.`,
    ``,
    `If this was you, no further action is needed — sign in with your new password.`,
    ``,
    `If this WASN'T you, contact us right away at ${opts.contactEmail} so we can lock the account.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Admin</div>
      <h1 style="font-size: 24px; margin: 12px 0 16px; font-weight: 700;">Your password was just reset</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">Your GoodTunes admin password was reset on <strong>${opts.whenIso}</strong>${locText ? ` <span style="color:#888;">${locText}</span>` : ""}.</p>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">If this was you, you can ignore this email — just sign in with your new password.</p>
      <div style="margin: 24px 0; padding: 16px 20px; background: #fff4f6; border-left: 4px solid #FF5470; border-radius: 6px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1a1a1a;"><strong>Wasn't you?</strong> Contact us right away at <a href="mailto:${opts.contactEmail}" style="color: #319ED8; text-decoration: none;">${opts.contactEmail}</a> so we can lock the account.</p>
      </div>
    </div>
  `;
  return sendViaResend("admin-password-reset-confirmation", toEmail, subject, html, text);
}

// Task #271 — Customer "Forgot password?" reset link. Fan-tone copy on
// the dark GoodTunes brand palette (mirrors the dark player chrome the
// /reset-password page renders in). Same neutral 200 + non-enumerating
// contract as the admin variant — caller logs failures, never leaks.
export async function sendCustomerPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
  ttlMinutes: number,
  // Task #873 — a passwordless fan opting in to set a password for the
  // first time gets honest "set" copy instead of "reset". Same token +
  // /reset-password page; only the wording changes.
  firstTime = false,
): Promise<SendResult> {
  const subject = firstTime ? `Set your GoodTunes password` : `Reset your GoodTunes password`;
  const lead = firstTime
    ? `You asked to set a password for your GoodTunes account.`
    : `Someone (hopefully you) asked to reset the password for your GoodTunes account.`;
  const heading = firstTime ? `Set your password` : `Reset your password`;
  const cta = firstTime ? `Choose a password` : `Choose a new password`;
  const text = [
    lead,
    ``,
    `Open this link to choose a password (expires in ${ttlMinutes} minutes):`,
    resetUrl,
    ``,
    `If you didn't request this, you can ignore this email — your account is unchanged.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #00062B; color: #ffffff; border-radius: 16px;">
      ${emailLogoImg("white")}
      <div style="font-size: 14px; color: #4AFFCA; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">Account</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700; color: #ffffff;">${heading}</h1>
      <p style="font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.75);">${lead}</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #319ED8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 600; font-size: 15px;">${cta}</a>
      </p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.5;">Or paste this URL into your browser:<br /><span style="color: #4AFFCA; word-break: break-all;">${resetUrl}</span></p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.55); margin-top: 24px;">This link expires in <strong style="color: #ffffff;">${ttlMinutes} minutes</strong> and can only be used once.</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 16px;">If you didn't request this, you can ignore this email — your password is unchanged.</p>
    </div>
  `;
  return sendViaResend("customer-password-reset", toEmail, subject, html, text);
}

// Task #937 — Branded order receipt. Fired once, best-effort, when an
// order materializes from a paid Stripe session (see server/commerce.ts
// dispatchOrderReceipt). Shows the order summary (format, qty, add-ons,
// total), the GoodDeed number(s), a "Play on the web" button that deep-
// links into the now-unlocked album, and Apple/Google app-download
// buttons. The two app buttons are config-driven (IOS_APP_STORE_URL /
// ANDROID_PLAY_STORE_URL) and only render when their env var is set —
// no dead buttons before the apps ship. Brand chrome matches the dark
// fan-facing templates above (#00062B field, #4AFFCA eyebrow, #319ED8
// primary CTA).
export type OrderReceiptLine = {
  label: string;
  quantity: number;
  amountCents: number;
};
export type OrderReceiptData = {
  albumTitle: string;
  albumArtist: string;
  artworkUrl: string | null;
  lines: OrderReceiptLine[];
  totalCents: number;
  currency: string;
  goodDeedNumbers: number[];
  webPlayUrl: string;
  appleUrl: string | null;
  googleUrl: string | null;
};

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const cur = (currency || "usd").toUpperCase();
  return cur === "USD" ? `$${amount}` : `${amount} ${cur}`;
}

export async function sendOrderReceiptEmail(
  toEmail: string,
  data: OrderReceiptData,
): Promise<SendResult> {
  const {
    albumTitle,
    albumArtist,
    artworkUrl,
    lines,
    totalCents,
    currency,
    goodDeedNumbers,
    webPlayUrl,
    appleUrl,
    googleUrl,
  } = data;

  const subject = `Your GoodTunes order — ${albumTitle}`;
  const gdLabel = goodDeedNumbers.length === 1 ? "GoodDeed number" : "GoodDeed numbers";
  const gdText = goodDeedNumbers.map((n) => `#${n}`).join(", ");

  const text = [
    `You're in. Your album is unlocked and your record is on its way.`,
    ``,
    `${albumTitle} — ${albumArtist}`,
    ...(goodDeedNumbers.length > 0 ? [``, `${gdLabel}: ${gdText}`] : []),
    ``,
    `Order summary`,
    ...lines.map(
      (l) => `  ${l.label}${l.quantity > 1 ? ` ×${l.quantity}` : ""}  ${formatMoney(l.amountCents, currency)}`,
    ),
    `  Total  ${formatMoney(totalCents, currency)}`,
    ``,
    `Play on the web: ${webPlayUrl}`,
    ...(appleUrl ? [`Download on the App Store: ${appleUrl}`] : []),
    ...(googleUrl ? [`Get it on Google Play: ${googleUrl}`] : []),
    ``,
    `— The GoodTunes team`,
  ].join("\n");

  const artworkHtml = artworkUrl
    ? `<img src="${escapeHtml(artworkUrl)}" alt="" width="56" height="56" style="width:56px;height:56px;border-radius:10px;object-fit:cover;display:block;" />`
    : "";

  const goodDeedHtml =
    goodDeedNumbers.length > 0
      ? `
      <div style="margin: 24px 0; padding: 16px 18px; background: rgba(74,255,202,0.08); border: 1px solid rgba(74,255,202,0.25); border-radius: 12px;">
        <div style="font-size: 12px; color: #4AFFCA; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700;">${escapeHtml(gdLabel)}</div>
        <div style="font-size: 24px; font-weight: 800; color: #ffffff; margin-top: 4px;">${escapeHtml(gdText)}</div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 6px;">Numbered for life. Refundable up until shipping.</div>
      </div>`
      : "";

  const linesHtml = lines
    .map(
      (l) => `
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: rgba(255,255,255,0.85);">${escapeHtml(l.label)}${l.quantity > 1 ? ` <span style="color: rgba(255,255,255,0.5);">×${l.quantity}</span>` : ""}</td>
          <td style="padding: 6px 0; font-size: 14px; color: rgba(255,255,255,0.85); text-align: right; white-space: nowrap;">${escapeHtml(formatMoney(l.amountCents, currency))}</td>
        </tr>`,
    )
    .join("");

  const appButton = (href: string, label: string) => `
    <a href="${escapeHtml(href)}" style="display: inline-block; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #ffffff; text-decoration: none; padding: 11px 18px; border-radius: 999px; font-weight: 600; font-size: 14px; margin: 6px 8px 6px 0;">${escapeHtml(label)}</a>`;

  const appButtonsHtml =
    appleUrl || googleUrl
      ? `
      <p style="font-size: 13px; color: rgba(255,255,255,0.55); margin: 28px 0 8px;">Or take it with you:</p>
      <p style="margin: 0;">
        ${appleUrl ? appButton(appleUrl, "Download on the App Store") : ""}
        ${googleUrl ? appButton(googleUrl, "Get it on Google Play") : ""}
      </p>`
      : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #00062B; color: #ffffff; border-radius: 16px;">
      ${emailLogoImg("white")}
      <div style="font-size: 14px; color: #4AFFCA; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">Receipt</div>
      <h1 style="font-size: 28px; margin: 12px 0 8px; font-weight: 700; color: #ffffff;">You're in.</h1>
      <p style="font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.75); margin: 0 0 20px;">Your album is unlocked and your record is on its way.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 0 0 4px;">
        <tr>
          <td style="width: 56px; vertical-align: middle;">${artworkHtml}</td>
          <td style="vertical-align: middle; padding-left: ${artworkUrl ? "14px" : "0"};">
            <div style="font-size: 16px; font-weight: 700; color: #ffffff;">${escapeHtml(albumTitle)}</div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.6);">${escapeHtml(albumArtist)}</div>
          </td>
        </tr>
      </table>
      ${goodDeedHtml}
      <div style="font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700; margin: 24px 0 6px;">Order summary</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        ${linesHtml}
        <tr><td colspan="2" style="border-top: 1px solid rgba(255,255,255,0.15); padding: 0;"></td></tr>
        <tr>
          <td style="padding: 8px 0 0; font-size: 15px; font-weight: 700; color: #ffffff;">Total</td>
          <td style="padding: 8px 0 0; font-size: 15px; font-weight: 700; color: #ffffff; text-align: right;">${escapeHtml(formatMoney(totalCents, currency))}</td>
        </tr>
      </table>
      <p style="margin: 28px 0 0;">
        <a href="${escapeHtml(webPlayUrl)}" style="display: inline-block; background: #319ED8; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 999px; font-weight: 600; font-size: 15px;">Play on the web</a>
      </p>
      ${appButtonsHtml}
      <p style="font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 28px;">Manage your order and certificate anytime from "Your orders" in the player.</p>
    </div>
  `;
  return sendViaResend("order-receipt", toEmail, subject, html, text);
}

// Task #284 — Tap-to-report error capture from the friendly error card.
// The reporter's email (when we know who they are, OR what they typed
// into the inline email field) is wired up as reply_to so a quick
// "we've shipped a fix" reply goes straight back to the user.
export type ErrorReportPayload = {
  summary: string;
  source: string;
  provider?: string | null;
  step?: string | null;
  route?: string | null;
  userAgent?: string | null;
  viewport?: string | null;
  timestamp: string;
  identity?: { kind?: string | null; id?: string | null; email?: string | null } | null;
  reporterEmail?: string | null;
  error?: { name?: string | null; message?: string | null; stack?: string | null } | null;
  serverBody?: string | null;
};

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export async function sendErrorReportEmail(
  toEmail: string,
  payload: ErrorReportPayload,
): Promise<SendResult> {
  const errName = payload.error?.name || "Error";
  const errMsg = payload.error?.message || "(no message)";
  const subjectBits = [payload.source];
  if (payload.provider) subjectBits.push(payload.provider);
  if (payload.step) subjectBits.push(payload.step);
  const subject = `[GoodTunes error] ${subjectBits.join(" / ")} — ${errMsg.slice(0, 80)}`;

  const idLine = payload.identity?.email
    ? `${payload.identity.email}${payload.identity.kind ? ` (${payload.identity.kind})` : ""}${payload.identity.id ? ` id=${payload.identity.id}` : ""}`
    : (payload.reporterEmail || "(unknown user)");

  const lines = [
    payload.summary,
    "",
    `When: ${payload.timestamp}`,
    `Who:  ${idLine}`,
    `Where: ${payload.route ?? "(unknown route)"}`,
    payload.provider ? `Provider: ${payload.provider}${payload.step ? ` / step ${payload.step}` : ""}` : null,
    payload.userAgent ? `UA: ${payload.userAgent}` : null,
    payload.viewport ? `Viewport: ${payload.viewport}` : null,
    "",
    `Error: ${errName}: ${errMsg}`,
    payload.error?.stack ? `\nStack:\n${payload.error.stack}` : null,
    payload.serverBody ? `\nServer response body:\n${payload.serverBody}` : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  const rowsHtml = [
    ["When", payload.timestamp],
    ["Who", idLine],
    ["Where", payload.route ?? "(unknown route)"],
    payload.provider ? ["Provider", `${payload.provider}${payload.step ? ` / step ${payload.step}` : ""}`] : null,
    payload.userAgent ? ["User agent", payload.userAgent] : null,
    payload.viewport ? ["Viewport", payload.viewport] : null,
  ].filter(Boolean) as [string, string][];

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 28px 24px; color: #1a1a1a;">
      <div style="font-size: 13px; color: #FF5470; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700;">GoodTunes — Tap-to-report</div>
      <h1 style="font-size: 20px; margin: 8px 0 16px; font-weight: 700;">${esc(subject.replace(/^\[GoodTunes error\] /, ""))}</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #333;">${esc(payload.summary)}</p>
      <table style="margin-top: 16px; font-size: 13px; border-collapse: collapse;">
        ${rowsHtml.map(([k, v]) => `<tr><td style="color:#666;padding:4px 12px 4px 0;vertical-align:top;">${esc(k)}</td><td style="color:#111;padding:4px 0;word-break:break-all;">${esc(v)}</td></tr>`).join("")}
      </table>
      <div style="margin-top: 18px; padding: 14px 16px; background: #fff4f6; border-left: 4px solid #FF5470; border-radius: 6px;">
        <div style="font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; color: #1a1a1a; word-break: break-all;">${esc(errName)}: ${esc(errMsg)}</div>
      </div>
      ${payload.error?.stack ? `<pre style="margin-top: 14px; padding: 12px; background: #f4f4f7; border-radius: 6px; font-size: 11px; line-height: 1.4; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${esc(payload.error.stack)}</pre>` : ""}
      ${payload.serverBody ? `<div style="margin-top: 14px; font-size: 12px; color: #666;">Server response body</div><pre style="padding: 12px; background: #f4f4f7; border-radius: 6px; font-size: 11px; line-height: 1.4; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${esc(payload.serverBody)}</pre>` : ""}
      <p style="margin-top: 24px; font-size: 12px; color: #888;">Reply to this email to follow up with ${esc(payload.reporterEmail || payload.identity?.email || "the reporter")}.</p>
    </div>
  `;

  const replyTo = payload.reporterEmail || payload.identity?.email || null;
  return sendViaResend("error-report", toEmail, subject, html, text, replyTo);
}

// Build the admin-invite email (subject/text/html). Split out from the
// sender so the exact HTML artists/presses receive can be previewed
// without sending. The link points at the public /invite/:token page
// where the recipient sets a username + password; on submit we provision
// their users row with the role + scope baked into the invite.
export function buildAdminInviteEmail(opts: {
  acceptUrl: string;
  inviterName: string;
  roleLabel: string;
  ttlDays: number;
}): { subject: string; text: string; html: string } {
  const { acceptUrl, inviterName, roleLabel, ttlDays } = opts;
  const subject = `${inviterName} invited you to GoodTunes`;
  const text = [
    `${inviterName} invited you to join GoodTunes as a ${roleLabel}.`,
    ``,
    `Accept the invite (expires in ${ttlDays} days):`,
    acceptUrl,
    ``,
    `If you weren't expecting this email, you can ignore it.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Invitation</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700;">You're invited</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #333;"><strong>${inviterName}</strong> invited you to join GoodTunes as a <strong>${roleLabel}</strong>.</p>
      <p style="margin: 28px 0;">
        <a href="${acceptUrl}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">Accept invitation</a>
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.5;">Or paste this URL into your browser:<br /><span style="color: #319ED8; word-break: break-all;">${acceptUrl}</span></p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">This link expires in <strong>${ttlDays} days</strong>. If you weren't expecting this email, you can ignore it.</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendAdminInviteEmail(
  toEmail: string,
  acceptUrl: string,
  inviterName: string,
  roleLabel: string,
  ttlDays: number,
): Promise<SendResult> {
  const { subject, text, html } = buildAdminInviteEmail({ acceptUrl, inviterName, roleLabel, ttlDays });
  return sendViaResend("admin-invite", toEmail, subject, html, text);
}

// Press portal — masters-prep threshold crossed; ask the artist to
// approve the early-start cut. Sent fire-and-forget from the pipeline
// auto-trigger sweep, so we use the same ok/reason contract as every
// other template and never throw upward.
// Task #543 — Daily digest to Bill summarising still-HELD payout
// earmarks. Sent by the in-process tick from server/index.ts and also
// callable on demand from the release queue. Plain-text body keeps the
// list scannable on phone.
export async function sendPayoutDigestToBill(
  toEmail: string,
  count: number,
  totalCents: number,
  lines: string[],
): Promise<SendResult> {
  const dollars = (totalCents / 100).toFixed(2);
  const subject = `GoodTunes payouts to release: ${count} held ($${dollars})`;
  const text = [
    `${count} held payout earmark(s) totalling $${dollars} are waiting for your release.`,
    ``,
    ...lines,
    ``,
    `Release / Hold-longer / Reject from /admin/payouts-release.`,
  ].join("\n");
  const html = [
    `<p>${count} held payout earmark(s) totalling <strong>$${dollars}</strong> are waiting for your release.</p>`,
    `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;">${lines.map((l) => l.replace(/</g, "&lt;")).join("\n")}</pre>`,
    `<p>Release, Hold-longer, or Reject from <a href="https://admin.goodtunes.music/admin/payouts-release">/admin/payouts-release</a>.</p>`,
  ].join("\n");
  return sendViaResend("payout-digest", toEmail, subject, html, text);
}

export async function sendMastersReadyEmail(
  toEmail: string,
  artistName: string,
  albumTitle: string,
  pressName: string,
  approveUrl: string,
): Promise<SendResult> {
  const subject = `${pressName} can start cutting ${albumTitle} early — approve?`;
  const text = [
    `Hi ${artistName},`,
    ``,
    `${pressName} has earmarked enough revenue from ${albumTitle} to cover the masters-prep cost and start cutting now.`,
    ``,
    `If you approve, the press will begin work immediately so finished units land at fulfillment sooner.`,
    ``,
    `Approve here: ${approveUrl}`,
    ``,
    `If you'd rather wait for preorder close, you can ignore this email.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Press update</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700;">Start cutting early?</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #333;"><strong>${escapeHtml(pressName)}</strong> has earmarked enough revenue from <strong>${escapeHtml(albumTitle)}</strong> to cover the masters-prep cost. Approve to let them begin cutting now.</p>
      <p style="margin: 28px 0;">
        <a href="${approveUrl}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">Approve early start</a>
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.5;">If you'd rather wait for preorder close, you can ignore this email.</p>
    </div>
  `;
  return sendViaResend("press-masters-ready", toEmail, subject, html, text);
}

// Task #534 — Generic partner-notification send. The dispatcher in
// server/partnerNotifications.ts composes the subject/html/text per
// event and fans out to N recipients; this is the thin transport so
// the synthetic-recipient guard, RESEND_API_KEY check, and failure
// buffer all stay in one place.
export async function sendPartnerNotificationEmail(
  toEmail: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  return sendViaResend("partner-notification", toEmail, subject, html, text);
}

// Press portal — fulfillment heads-up. Sent when an album enters Locked
// (or when locked qty drifts >5%) so the routed fulfillment partner can
// prep dock space and reserve packing-slot capacity for the run.
export async function sendFulfillmentHeadsUpEmail(
  toEmail: string,
  partnerName: string,
  albumTitle: string,
  pressName: string,
  quantity: number,
  isUpdate: boolean,
  opts?: { shipByLabel?: string | null; pipelineUrl?: string | null },
): Promise<SendResult> {
  const verb = isUpdate ? "Updated quantity" : "Incoming run";
  const shipByLabel = opts?.shipByLabel ?? null;
  const pipelineUrl = opts?.pipelineUrl ?? null;
  const subject = shipByLabel
    ? `${verb}: ${quantity} units of ${albumTitle} from ${pressName} — ship by ${shipByLabel}`
    : `${verb}: ${quantity} units of ${albumTitle} from ${pressName}`;
  const shipLine = shipByLabel
    ? `Target ship-by date: ${shipByLabel}.`
    : `Expected ship date and tracking will follow from the press directly.`;
  const text = [
    `Hi ${partnerName},`,
    ``,
    `${isUpdate ? "The expected quantity changed:" : "Heads-up — a run is on the way:"}`,
    ``,
    `${quantity} units of ${albumTitle}, pressed by ${pressName}.`,
    ``,
    shipLine,
    ...(pipelineUrl ? [``, `View the pipeline: ${pipelineUrl}`] : []),
  ].join("\n");
  const ctaHtml = pipelineUrl
    ? `<p style="margin: 20px 0 8px;"><a href="${escapeHtml(pipelineUrl)}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 11px 20px; border-radius: 8px;">View the pipeline</a></p>`
    : "";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      ${emailLogoImg("color")}
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">Fulfillment</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700;">${verb}</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #333;"><strong>${quantity}</strong> units of <strong>${escapeHtml(albumTitle)}</strong>, pressed by <strong>${escapeHtml(pressName)}</strong>.</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">${escapeHtml(shipLine)}</p>
      ${ctaHtml}
    </div>
  `;
  return sendViaResend("press-fulfillment-heads-up", toEmail, subject, html, text);
}
