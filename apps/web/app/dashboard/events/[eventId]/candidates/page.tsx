import { Suspense } from "react";
import EventCandidatesPage from "./candidates-page";

export default function EventCandidatesRoutePage() {
  return (
    <Suspense fallback={null}>
      <EventCandidatesPage />
    </Suspense>
  );
}
