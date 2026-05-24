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

type SendResult = { ok: true } | { ok: false; reason: string };

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "RESEND_API_KEY not set" };
  try {
    const replyTo = getReplyTo();
    const body: Record<string, unknown> = { from: getFromAddress(), to, subject, html, text };
    if (replyTo) body.reply_to = replyTo;
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { ok: false, reason: `resend ${r.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `resend fetch threw: ${(e as Error).message}` };
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
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes admin</div>
      <h1 style="font-size: 28px; margin: 12px 0 24px; font-weight: 700;">Your sign-in code</h1>
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 20px 24px; background: #f4f4f7; border-radius: 12px; text-align: center; font-family: 'SF Mono', Menlo, Consolas, monospace;">${code}</div>
      <p style="font-size: 15px; color: #444; margin-top: 24px; line-height: 1.5;">Enter this code in the GoodTunes admin sign-in screen. It expires in <strong>${ttlMinutes} minutes</strong>.</p>
      <p style="font-size: 13px; color: #888; margin-top: 32px; line-height: 1.5;">If you didn't try to sign in, you can ignore this email — your password is still safe.</p>
    </div>
  `;
  return sendViaResend(toEmail, subject, html, text);
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
      <div style="font-size: 14px; color: #319ED8; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">Welcome to GoodTunes</div>
      <h1 style="font-size: 28px; margin: 12px 0 24px; font-weight: 700;">Your sign-in code</h1>
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 20px 24px; background: #f4f4f7; border-radius: 12px; text-align: center; font-family: 'SF Mono', Menlo, Consolas, monospace; color: #00062B;">${code}</div>
      <p style="font-size: 15px; color: #444; margin-top: 24px; line-height: 1.5;">Pop this code back into the sign-in screen to finish creating your account. It expires in <strong>${ttlMinutes} minutes</strong>.</p>
      <p style="font-size: 13px; color: #888; margin-top: 32px; line-height: 1.5;">If you didn't ask to sign in, you can safely ignore this email — no account will be created.</p>
    </div>
  `;
  return sendViaResend(toEmail, subject, html, text);
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
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes admin</div>
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
  return sendViaResend(toEmail, subject, html, text);
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
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes admin</div>
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
  return sendViaResend(toEmail, subject, html, text);
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
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes admin</div>
      <h1 style="font-size: 24px; margin: 12px 0 16px; font-weight: 700;">Your password was just reset</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">Your GoodTunes admin password was reset on <strong>${opts.whenIso}</strong>${locText ? ` <span style="color:#888;">${locText}</span>` : ""}.</p>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">If this was you, you can ignore this email — just sign in with your new password.</p>
      <div style="margin: 24px 0; padding: 16px 20px; background: #fff4f6; border-left: 4px solid #FF5470; border-radius: 6px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1a1a1a;"><strong>Wasn't you?</strong> Contact us right away at <a href="mailto:${opts.contactEmail}" style="color: #319ED8; text-decoration: none;">${opts.contactEmail}</a> so we can lock the account.</p>
      </div>
    </div>
  `;
  return sendViaResend(toEmail, subject, html, text);
}

// Task #271 — Customer "Forgot password?" reset link. Fan-tone copy on
// the dark GoodTunes brand palette (mirrors the dark player chrome the
// /reset-password page renders in). Same neutral 200 + non-enumerating
// contract as the admin variant — caller logs failures, never leaks.
export async function sendCustomerPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
  ttlMinutes: number,
): Promise<SendResult> {
  const subject = `Reset your GoodTunes password`;
  const text = [
    `Someone (hopefully you) asked to reset the password for your GoodTunes account.`,
    ``,
    `Open this link to choose a new password (expires in ${ttlMinutes} minutes):`,
    resetUrl,
    ``,
    `If you didn't request this, you can ignore this email — your password is unchanged.`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #00062B; color: #ffffff; border-radius: 16px;">
      <div style="font-size: 14px; color: #4AFFCA; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">GoodTunes</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700; color: #ffffff;">Reset your password</h1>
      <p style="font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.75);">Someone (hopefully you) asked to reset the password for your GoodTunes account.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #319ED8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 600; font-size: 15px;">Choose a new password</a>
      </p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.5;">Or paste this URL into your browser:<br /><span style="color: #4AFFCA; word-break: break-all;">${resetUrl}</span></p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.55); margin-top: 24px;">This link expires in <strong style="color: #ffffff;">${ttlMinutes} minutes</strong> and can only be used once.</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 16px;">If you didn't request this, you can ignore this email — your password is unchanged.</p>
    </div>
  `;
  return sendViaResend(toEmail, subject, html, text);
}

// Send an admin-invite link. The link points at the public /invite/:token
// page where the recipient sets a username + password; on submit we
// provision their users row with the role + scope baked into the invite.
export async function sendAdminInviteEmail(
  toEmail: string,
  acceptUrl: string,
  inviterName: string,
  roleLabel: string,
  ttlDays: number,
): Promise<SendResult> {
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
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes</div>
      <h1 style="font-size: 28px; margin: 12px 0 16px; font-weight: 700;">You're invited</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #333;"><strong>${inviterName}</strong> invited you to join GoodTunes as a <strong>${roleLabel}</strong>.</p>
      <p style="margin: 28px 0;">
        <a href="${acceptUrl}" style="display: inline-block; background: #319ED8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">Accept invitation</a>
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.5;">Or paste this URL into your browser:<br /><span style="color: #319ED8; word-break: break-all;">${acceptUrl}</span></p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">This link expires in <strong>${ttlDays} days</strong>. If you weren't expecting this email, you can ignore it.</p>
    </div>
  `;
  return sendViaResend(toEmail, subject, html, text);
}
