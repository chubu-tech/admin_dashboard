import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ReviewWizard } from "@/components/review-wizard";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SalonDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_salon_detail", { p_business: id });
  const name = (data as SalonDetail | null)?.salon?.name;
  return { title: name ? `Review ${name}` : "Review salon" };
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_salon_detail", {
    p_business: id,
  });

  if (error?.code === "P0002" || (!error && !data)) notFound();
  if (error) {
    return (
      <Card>
        <CardContent className="text-destructive pt-6 text-sm">
          Could not load this salon: {error.message}
        </CardContent>
      </Card>
    );
  }

  const detail = data as SalonDetail;

  return (
    <>
      <Link
        href={`/approvals/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to {detail.salon.name}
      </Link>

      <PageHeader
        title={`Review ${detail.salon.name}`}
        description="Check the details, set the week, then approve or reject."
      >
        <StatusBadge status={detail.salon.status} />
      </PageHeader>

      <ReviewWizard detail={detail} />
    </>
  );
}
