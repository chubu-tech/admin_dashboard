"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, PauseCircle, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSalon, setSalonStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { SalonStatus } from "@/lib/types";

/**
 * Status actions for one salon. Which buttons exist is driven by the same rule
 * the database enforces (`admin_set_salon_status`): only an approved salon can
 * be suspended, only a suspended one reactivated.
 *
 * Edit is the exception — it shows at every status, because `admin_update_salon`
 * touches no status field. Correcting a pending application and deciding it are
 * separate acts.
 */
export function SalonActions({
  salonId,
  salonName,
  status,
  showReview = true,
  compactEdit = false,
  redirectAfterDelete,
}: {
  salonId: string;
  salonName: string;
  status: SalonStatus;
  showReview?: boolean;
  /** Icon-only Edit, for the narrow table rows on /salons. */
  compactEdit?: boolean;
  redirectAfterDelete?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showReview && (status === "pending" || status === "rejected") && (
        <Button asChild>
          <Link href={`/approvals/${salonId}/review`}>
            {status === "pending" ? "Start review" : "Review again"}
          </Link>
        </Button>
      )}

      <Button
        asChild
        variant="outline"
        size={compactEdit ? "icon" : "default"}
        title={compactEdit ? `Edit ${salonName}` : undefined}
      >
        <Link
          href={`/approvals/${salonId}/edit`}
          aria-label={compactEdit ? `Edit ${salonName}` : undefined}
        >
          <Pencil className="size-4" aria-hidden />
          {!compactEdit && "Edit"}
        </Link>
      </Button>

      {status === "approved" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => setSalonStatus(salonId, "suspended"),
              `${salonName} suspended.`,
            )
          }
        >
          <PauseCircle className="size-4" aria-hidden />
          Suspend
        </Button>
      )}

      {status === "suspended" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => setSalonStatus(salonId, "approved"),
              `${salonName} reactivated.`,
            )
          }
        >
          <PlayCircle className="size-4" aria-hidden />
          Reactivate
        </Button>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Delete ${salonName}`}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {salonName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The salon is archived and disappears from the app. Its bookings
              and reviews are kept. This cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteSalon(salonId);
                  if (result.ok) {
                    toast.success(`${salonName} deleted.`);
                    if (redirectAfterDelete) router.push(redirectAfterDelete);
                    else router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Delete salon
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pending && (
        <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
      )}
    </div>
  );
}
