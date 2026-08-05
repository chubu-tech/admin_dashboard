"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  drainWaitlistCampaign,
  retryWaitlistFailures,
  sendWaitlistLaunch,
} from "@/app/actions";
import { Field, FieldError } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SendResult } from "@/lib/types";

const DEFAULT_SUBJECT = "Tho is here — book your chair from your phone";
const DEFAULT_MESSAGE = `Tho is live on the App Store and Google Play today.

Book a chair at salons across Thimphu, Paro and Phuentsholing, or scan the QR at the door to join the walk-in queue and watch the line move from wherever you are.

It is free for customers — no booking fee, nothing to pay at the door.`;

/**
 * Compose and send the launch announcement.
 *
 * Prefilled rather than blank: the email has to go out once, correctly, to
 * everybody, and a blank box at that moment invites something written in a
 * hurry. Every word stays editable.
 *
 * The send is batched server-side (25 per press), so this reports what one
 * press did and offers the next. That is honest about a bulk send being
 * resumable work rather than a single atomic event — and it is why the count
 * of what is left comes back from the database rather than being guessed here.
 */
export function SendLaunchDialog({
  recipientCount,
  notifiedCount,
  emailConfigured,
}: {
  /** People who have not been sent a launch email yet. */
  recipientCount: number;
  /** People a previous campaign already reached. */
  notifiedCount: number;
  /** False when no provider is wired up — sends are simulated. */
  emailConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [iosUrl, setIosUrl] = useState("");
  const [androidUrl, setAndroidUrl] = useState("");
  const [includeNotified, setIncludeNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const targets = includeNotified ? recipientCount + notifiedCount : recipientCount;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError("Give the email a subject line.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Write a short message for the announcement.");
      return;
    }
    for (const [label, url] of [
      ["App Store", iosUrl],
      ["Google Play", androidUrl],
    ] as const) {
      if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
        setError(`The ${label} link must start with http:// or https://`);
        return;
      }
    }

    startTransition(async () => {
      const outcome = await sendWaitlistLaunch({
        subject,
        message,
        ios_url: iosUrl,
        android_url: androidUrl,
        include_notified: includeNotified,
      });

      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }

      setOpen(false);
      report(outcome.result, emailConfigured);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={recipientCount + notifiedCount === 0}>
          <Megaphone className="size-4" aria-hidden />
          Send launch announcement
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Send the launch announcement</DialogTitle>
            <DialogDescription>
              One email to everyone on the waitlist. It carries your message, the
              store links you paste below, and a thank-you.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!emailConfigured && (
              <p className="border-warning/40 bg-muted text-muted-foreground flex gap-2 rounded-md border p-3 text-sm">
                <TriangleAlert className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  No email provider is configured on this deployment, so sends are{" "}
                  <strong className="text-foreground">simulated</strong> — recipients
                  are recorded as sent but nothing leaves the server. Set{" "}
                  <code className="text-xs">EMAIL_API_KEY</code> and{" "}
                  <code className="text-xs">EMAIL_FROM</code> to send for real.
                </span>
              </p>
            )}

            <Field
              id="waitlist-subject"
              label="Subject"
              required
              value={subject}
              onChange={setSubject}
            />

            {/* `Field` renders an `<Input>`; the body needs a textarea, so this
                one is assembled from the same Label/Textarea primitives rather
                than by widening a shared component for a single caller. */}
            <div className="grid gap-2">
              <Label htmlFor="waitlist-message">
                Message<span className="text-destructive"> *</span>
              </Label>
              <Textarea
                id="waitlist-message"
                value={message}
                rows={7}
                maxLength={4000}
                onChange={(event) => setMessage(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Blank lines become paragraphs. The store buttons and the thank-you
                are added for you.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="waitlist-ios"
                label="App Store link"
                type="url"
                inputMode="url"
                placeholder="https://apps.apple.com/…"
                value={iosUrl}
                onChange={setIosUrl}
                hint="Leave blank until the listing is live."
              />
              <Field
                id="waitlist-android"
                label="Google Play link"
                type="url"
                inputMode="url"
                placeholder="https://play.google.com/…"
                value={androidUrl}
                onChange={setAndroidUrl}
                hint="Leave blank until the listing is live."
              />
            </div>

            {notifiedCount > 0 && (
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  checked={includeNotified}
                  onCheckedChange={(value) => setIncludeNotified(value === true)}
                  className="mt-0.5"
                />
                <span>
                  Also email the {notifiedCount}{" "}
                  {notifiedCount === 1 ? "person" : "people"} a previous
                  announcement already reached.
                  <span className="text-muted-foreground block">
                    Off by default — the usual second send is for people who joined
                    since.
                  </span>
                </span>
              </label>
            )}

            {error && <FieldError>{error}</FieldError>}

            <p className="text-muted-foreground text-sm">
              {targets === 0
                ? "Nobody to email yet."
                : `This will email ${targets} ${targets === 1 ? "person" : "people"}, 25 at a time.`}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || targets === 0}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Send remaining" — the next batch of a campaign that is partway through. */
export function SendRemainingButton({
  campaignId,
  remaining,
  emailConfigured,
}: {
  campaignId: string;
  remaining: number;
  emailConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await drainWaitlistCampaign(campaignId);
          if (!outcome.ok) {
            toast.error(outcome.error);
            return;
          }
          report(outcome.result, emailConfigured);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Send className="size-3.5" aria-hidden />
      )}
      Send remaining {remaining}
    </Button>
  );
}

/** Requeue and resend everything that failed on one campaign. */
export function RetryFailuresButton({
  campaignId,
  failed,
  emailConfigured,
}: {
  campaignId: string;
  failed: number;
  emailConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await retryWaitlistFailures(campaignId);
          if (!outcome.ok) {
            toast.error(outcome.error);
            return;
          }
          report(outcome.result, emailConfigured);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RotateCcw className="size-3.5" aria-hidden />
      )}
      Retry {failed} failed
    </Button>
  );
}

/**
 * One toast for every send path.
 *
 * Failures get their own toast rather than a clause in a success message: a
 * batch where 3 of 25 bounced is not a success with a footnote, and the row
 * that says which addresses is on the page behind it.
 */
function report(result: SendResult, emailConfigured: boolean) {
  const suffix = emailConfigured ? "" : " (simulated — no provider configured)";

  if (result.sent > 0) {
    toast.success(`Sent ${result.sent}${suffix}.`);
  }
  if (result.failed > 0) {
    toast.error(
      `${result.failed} failed. Open the campaign to see why, then retry them.`,
    );
  }
  if (result.remaining > 0) {
    toast.info(`${result.remaining} still queued — press "Send remaining" to continue.`);
  }
  if (result.sent === 0 && result.failed === 0 && result.remaining === 0) {
    toast.info("Nothing left to send.");
  }
}
