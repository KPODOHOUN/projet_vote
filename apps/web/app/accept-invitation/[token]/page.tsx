import type { Metadata } from "next";
import { AcceptInvitationClient } from "./AcceptInvitationClient";
import { AuthSimpleLayout } from "../../../components/auth-simple-layout";
import { Card } from "../../../components/ui";

export const metadata: Metadata = {
  title: "Rejoindre l'organisation · SHADOMA Votes",
  robots: { index: false, follow: false }
};

type PageProps = { params: Promise<{ token: string }> };

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <AcceptInvitationClient token={token} />
      </Card>
    </AuthSimpleLayout>
  );
}
