import "server-only";

import type { WaitlistDelivery } from "@/lib/types";

/**
 * The one place this console sends email from.
 *
 * ## The provider is a seam, and it simulates when unconfigured
 *
 * Deliberately the same shape as `sendSms()` in tho's `process-notifications`
 * worker: one function, an HTTP provider behind two env vars, and a logged
 * simulation when they are absent. That is what lets the whole path — queue,
 * claim, send, mark, retry — be exercised end to end before anyone has bought
 * an email plan, which is the state this project is in today.
 *
 * **A simulated send is reported as sent.** That is the right call for a
 * pipeline you are trying to verify, and the wrong one to be surprised by, so
 * `isEmailConfigured()` exists and the send dialog says so on screen. Nothing
 * silently pretends.
 *
 * ## Why fetch and not an SDK
 *
 * Every provider worth using takes a JSON POST. Defaulting `EMAIL_API_URL` to
 * Resend's endpoint means the common case is one env var, and any other
 * provider is a URL change rather than a dependency and a rewrite.
 */

export type EmailResult = { ok: true } | { ok: false; error: string };

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";

/** True when a real provider is wired up. The UI surfaces this, honestly. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Escape text destined for an HTML email body.
 *
 * The subject and message are typed by an admin, but "typed by a trusted user"
 * is not the same as "safe to interpolate into markup" — an unescaped `<` from
 * a copy-paste breaks the layout of an email that has already been sent to
 * everybody, and there is no editing it afterwards.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A URL is only allowed into an href if it is http(s). Mirrors the RPC. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function storeButton(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#141312;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;margin:0 8px 10px 0;">${escapeHtml(label)}</a>`;
}

/**
 * The launch announcement, built from one campaign row.
 *
 * Three things the brief asks for and this renders: the announcement itself
 * (the operator's message), the store links when they exist, and the
 * thank-you. The thank-you is ours rather than the operator's — it is the same
 * sentence every time and should not be something anyone can forget to type.
 *
 * Inline styles and a table-free single column on purpose: email clients strip
 * `<style>` blocks and disagree about everything else.
 */
export function renderLaunchEmail(delivery: WaitlistDelivery): {
  subject: string;
  html: string;
  text: string;
} {
  const ios = safeUrl(delivery.ios_url);
  const android = safeUrl(delivery.android_url);

  const paragraphs = delivery.message
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3f3f3f;">${escapeHtml(
          block,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const buttons =
    ios || android
      ? `<div style="margin:28px 0 8px;">${[
          ios ? storeButton(ios, "Download on the App Store") : "",
          android ? storeButton(android, "Get it on Google Play") : "",
        ].join("")}</div>`
      : "";

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f6f3ee;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#e00b41;font-weight:600;">Bhutan Salons</p>
    <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;color:#141312;font-weight:600;">${escapeHtml(
      delivery.subject,
    )}</h1>
    ${paragraphs}
    ${buttons}
    <p style="margin:28px 0 0;font-size:16px;line-height:1.6;color:#3f3f3f;">Thank you for joining the waitlist and waiting with us — it genuinely helped.</p>
    <hr style="border:none;border-top:1px solid #e6ded2;margin:32px 0 16px;" />
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6a6a6a;">
      You are receiving this because you asked us to tell you when the Tho app launched.
      It is the only email we send from the waitlist.
    </p>
  </div>
</body></html>`;

  const text = [
    delivery.subject,
    "",
    delivery.message,
    "",
    ios ? `App Store: ${ios}` : "",
    android ? `Google Play: ${android}` : "",
    "",
    "Thank you for joining the waitlist and waiting with us — it genuinely helped.",
    "",
    "You are receiving this because you asked us to tell you when the Tho app launched.",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  return { subject: delivery.subject, html, text };
}

/**
 * Send one email.
 *
 * Never throws: a provider that times out or returns HTML instead of JSON must
 * become a `failed` delivery with a readable reason, not an exception that
 * takes down the whole batch and loses the rows already sent.
 */
export async function sendEmail(delivery: WaitlistDelivery): Promise<EmailResult> {
  const { subject, html, text } = renderLaunchEmail(delivery);
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  const endpoint = process.env.EMAIL_API_URL || DEFAULT_ENDPOINT;

  if (!apiKey || !from) {
    console.log(
      `[simulate email] to=${delivery.email} subject="${subject}" (EMAIL_API_KEY/EMAIL_FROM unset)`,
    );
    return { ok: true };
  }

  // A provider that hangs would hold the server action open until the platform
  // kills it, and the delivery would be stranded in 'sending'.
  const abort = AbortSignal.timeout(15_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: abort,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [delivery.email],
        subject,
        html,
        text,
      }),
    });

    if (response.ok) return { ok: true };

    // Keep the provider's own words — an operator looking at one bounced
    // address needs the real reason, not our paraphrase of it.
    const body = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `${response.status} ${response.statusText}${body ? ` — ${body}` : ""}` };
  } catch (error) {
    return { ok: false, error: describeFetchError(error) };
  }
}

/**
 * Turn a thrown fetch into something an operator can act on.
 *
 * Node's fetch reports every transport failure as the bare string
 * **"fetch failed"** and hides the real reason on `error.cause` — measured
 * against an unreachable provider, where the stored error read "fetch failed"
 * and said nothing about the connection being refused. Since this text is what
 * the console shows beside a bounced address, unwrapping the cause is the
 * difference between a usable log and a shrug.
 */
function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  if (error.name === "TimeoutError") return "provider did not respond within 15s";

  const cause = error.cause;
  if (cause instanceof Error) {
    // `code` is where undici puts ECONNREFUSED / ENOTFOUND / CERT_HAS_EXPIRED.
    const code = (cause as NodeJS.ErrnoException).code;
    return code ? `${error.message}: ${code} — ${cause.message}` : `${error.message}: ${cause.message}`;
  }

  return error.message;
}
