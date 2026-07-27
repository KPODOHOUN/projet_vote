import type { Metadata } from "next";
import { AcceptInvitationClient } from "./AcceptInvitationClient";

export const metadata: Metadata = {
  title: "Rejoindre l'organisation · SHADOMA Votes",
  robots: { index: false, follow: false }
};

type PageProps = { params: Promise<{ token: string }> };

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <section className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-card py-8 px-4 shadow-xl sm:rounded-2xl border border-border sm:px-10">
          <AcceptInvitationClient token={token} />
        </div>
      </section>
    </main>
  );
}
