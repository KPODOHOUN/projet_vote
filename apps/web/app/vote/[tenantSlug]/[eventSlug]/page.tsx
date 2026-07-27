import { redirect } from "next/navigation";
import { publicEventPath } from "../../../../lib/site";

type LegacyVoteRedirectProps = {
  params: Promise<{ tenantSlug: string; eventSlug: string }>;
};

export default async function LegacyVoteRedirect({ params }: LegacyVoteRedirectProps) {
  const { eventSlug } = await params;
  redirect(publicEventPath(eventSlug));
}
