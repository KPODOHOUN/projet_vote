import { BadRequestException, ConflictException } from "@nestjs/common";
import { EventStatus } from "@prisma/client";

/**
 * Cycle de vie d'un concours — règles uniques, appliquées par l'API.
 *
 *   DRAFT ──(contrat signé)──▶ ACTIVE ──(clôture)──▶ CLOSED ──▶ ARCHIVED
 *     └──────────────────────────────────────────────────────▶ ARCHIVED
 *
 * - La mise en ligne (DRAFT → ACTIVE) passe UNIQUEMENT par la signature du
 *   contrat du concours (ContractsService), jamais par une simple mise à jour.
 * - La clôture (ACTIVE → CLOSED) passe par EventSettlementService.closeEvent
 *   (manuelle ou automatique à la date de fin).
 * - Un concours publié ne revient jamais en brouillon.
 */
export type EventTransitionVia = "update" | "contract" | "close";

const ALLOWED: Record<EventTransitionVia, ReadonlyArray<[EventStatus, EventStatus]>> = {
  update: [
    [EventStatus.DRAFT, EventStatus.ARCHIVED],
    [EventStatus.CLOSED, EventStatus.ARCHIVED]
  ],
  contract: [[EventStatus.DRAFT, EventStatus.ACTIVE]],
  close: [[EventStatus.ACTIVE, EventStatus.CLOSED]]
};

export function assertEventTransition(from: EventStatus, to: EventStatus, via: EventTransitionVia): void {
  if (from === to) return;
  if (ALLOWED[via].some(([a, b]) => a === from && b === to)) return;
  if (to === EventStatus.ACTIVE) {
    throw new ConflictException(
      from === EventStatus.DRAFT
        ? "Pour mettre ce concours en ligne, lisez et signez son contrat."
        : "Un concours clôturé ou archivé ne peut pas revenir en ligne."
    );
  }
  if (to === EventStatus.CLOSED) {
    throw new ConflictException("Utilisez « Clôturer le concours » pour le terminer.");
  }
  if (to === EventStatus.DRAFT) {
    throw new ConflictException("Un concours publié ne peut pas revenir en brouillon.");
  }
  throw new ConflictException("Ce changement de statut n'est pas autorisé.");
}

/**
 * Le vote est ouvert : concours en ligne et dans sa période. Vérifié au vote ET
 * au lancement du paiement — un vote préparé avant la fin ne se paie plus après.
 */
export function assertVotingOpen(event: { status: EventStatus; startsAt: Date; endsAt: Date }, now = new Date()): void {
  if (event.status !== EventStatus.ACTIVE) {
    throw new BadRequestException("Cet événement n'est pas ouvert au vote.");
  }
  if (now < event.startsAt || now > event.endsAt) {
    throw new BadRequestException("Le vote est fermé pour cet événement (hors période).");
  }
}

/** Conditions pour publier (générer puis signer le contrat). Liste vide = prêt. */
export function missingPublicationRequirements(event: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  voteUnitPriceCfa: number | null;
  candidateCount: number;
}): string[] {
  const missing: string[] = [];
  if (!event.title.trim()) missing.push("le nom du concours");
  if (!event.voteUnitPriceCfa || event.voteUnitPriceCfa <= 0) missing.push("le prix du vote");
  if (event.candidateCount < 1) missing.push("au moins un candidat");
  if (event.endsAt.getTime() <= event.startsAt.getTime()) missing.push("une date de fin après la date de début");
  if (event.endsAt.getTime() <= Date.now()) missing.push("une date de fin dans le futur");
  return missing;
}
