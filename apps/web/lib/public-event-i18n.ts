import type { Locale } from "./i18n";

const messages = {
  fr: {
    liveResults: "Résultats en direct",
    closesOn: "Clôture le",
    closedOn: "Fermé le",
    voteClosed: "Le vote n'est pas ouvert",
    seeLiveResults: "résultats en direct",
    noCandidates: "Aucun candidat",
    noCandidatesDesc: "Aucun candidat inscrit pour le moment.",
    featured: "En vedette",
    viewProfileVote: "Voir le profil et voter",
    votes: "votes",
    backToVote: "Retour au vote",
    resultsTitle: "Résultats en direct",
    totalVotes: "Votes payés comptabilisés",
    totalAmount: "Montant total encaissé",
    candidateNotFound: "Candidat introuvable",
    voteFor: "Voter pour",
    voteNotFound: "Évènement introuvable",
    votePaused: "Ce vote n'est pas ouvert pour le moment."
  },
  en: {
    liveResults: "Live results",
    closesOn: "Closes on",
    closedOn: "Closed on",
    voteClosed: "Voting is not open",
    seeLiveResults: "live results",
    noCandidates: "No candidates",
    noCandidatesDesc: "No candidates registered yet.",
    featured: "Featured",
    viewProfileVote: "View profile & vote",
    votes: "votes",
    backToVote: "Back to vote",
    resultsTitle: "Live results",
    totalVotes: "Paid votes counted",
    totalAmount: "Total amount collected",
    candidateNotFound: "Candidate not found",
    voteFor: "Vote for",
    voteNotFound: "Event not found",
    votePaused: "This vote is not open right now."
  }
} as const;

export type PublicEventMessageKey = keyof typeof messages.fr;

export function publicEventMessage(locale: Locale, key: PublicEventMessageKey): string {
  return messages[locale][key];
}

export function publicEventDateLocale(locale: Locale): string {
  return locale === "en" ? "en-GB" : "fr-FR";
}
