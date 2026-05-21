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
// We default to the first; flip MAIL_FROM in Secrets when a domain is
// verified.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getFromAddress(): string {
  return process.env.MAIL_FROM || "GoodTunes <onboarding@resend.dev>";
}

type SendResult = { ok: true } | { ok: false; reason: string };

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "RESEND_API_KEY not set" };
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: getFromAddress(), to, subject, html, text }),
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
