import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  EventStatus,
  UserRole,
  WalletLedgerKind
} from "@prisma/client";
import { createHash } from "crypto";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutJobLockService } from "../payouts/payout-job-lock.service";
import { EventStatsService } from "./event-stats.service";
import { WalletService } from "./wallet.service";
import {
  HELD_RELEASE_DELAY_HOURS_KEY,
  DEFAULT_HELD_RELEASE_DELAY_HOURS,
  parseIntSetting
} from "../common/platform-settings";

const RELEASE_HELD_LOCK_NAME = "settlement-release-held";
const RELEASE_HELD_LOCK_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class EventSettlementService {
  private readonly logger = new Logger(EventSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly eventStats: EventStatsService,
    private readonly jobLock: PayoutJobLockService
  ) {}

  /**
   * Manual close: set closedAt + CLOSED. For ESCROW, apply retention % on the
   * event's pending credits and release the remainder to available.
   */
  /**
   * Clôture d'un concours (manuelle ou automatique). Aucune retenue ici : la
   * commission a été prélevée à chaque paiement et la réserve de ce concours se
   * libère après le délai réglé (releaseMaturedHeld).
   */
  async closeEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      select: { id: true, status: true, closedAt: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    if (event.closedAt || event.status === EventStatus.CLOSED) {
      throw new ConflictException("Cet événement est déjà clôturé.");
    }
    if (event.status === EventStatus.ARCHIVED) {
      throw new ConflictException("Impossible de clôturer un événement archivé.");
    }
    if (event.status !== EventStatus.ACTIVE) {
      throw new ConflictException("Seul un concours en ligne peut être clôturé.");
    }

    const now = new Date();
    const closed = await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.event.updateMany({
        where: { id: event.id, closedAt: null, status: EventStatus.ACTIVE },
        data: { status: EventStatus.CLOSED, closedAt: now }
      });
      if (claimed.count === 0) {
        throw new ConflictException("Cet événement a déjà été clôturé.");
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "event.closed",
          targetType: "Event",
          targetId: event.id,
          metadata: { closedAt: now.toISOString() }
        }
      });
      return tx.event.findUniqueOrThrow({ where: { id: event.id } });
    });

    const stats = await this.eventStats.getEventStats(event.id, user.tenantId);
    return { event: closed, stats };
  }

  /**
   * Clôture automatique des concours en ligne dont la date de fin est passée.
   */
  async closeExpiredEvents(limit = 100): Promise<{
    selected: number;
    closed: number;
    skipped: number;
    failed: number;
    failures: Array<{ eventId: string; reason: string }>;
  }> {
    const now = new Date();
    const expired = await this.prisma.client.event.findMany({
      where: {
        status: EventStatus.ACTIVE,
        closedAt: null,
        endsAt: { lte: now }
      },
      select: { id: true, tenantId: true },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(limit, 1), 500)
    });

    let closed = 0;
    let skipped = 0;
    const failures: Array<{ eventId: string; reason: string }> = [];
    for (const ev of expired) {
      try {
        await this.closeEvent(
          {
            userId: "system:event:auto-close",
            tenantId: ev.tenantId,
            role: UserRole.PLATFORM_ADMIN,
            email: "system:auto-close@votezpro.africa"
          },
          ev.id
        );
        closed += 1;
      } catch (error) {
        if (error instanceof ConflictException || error instanceof NotFoundException) {
          skipped += 1;
          continue;
        }
        failures.push({
          eventId: ev.id,
          reason: error instanceof Error ? error.message : "Erreur inconnue"
        });
      }
    }
    return {
      selected: expired.length,
      closed,
      skipped,
      failed: failures.length,
      failures
    };
  }

  /**
   * Libère heldCfa → withdrawableCfa pour les events Escrow clôturés depuis
   * plus de `held_release_delay_hours` (défaut 48h, business plan §4 Phase D).
   * Ne touche jamais un event dont le held a déjà été entièrement libéré :
   * on somme les entrées HELD_ALLOCATION vs HELD_RELEASE déjà écrites pour cet
   * event et on ne libère que le reliquat.
   *
   * Contrairement à closeEvent, il n'y a pas de claim atomique par event ici :
   * le reliquat est calculé à partir du ledger puis libéré, ce qui n'est sûr
   * que si une seule exécution tourne à la fois. Deux ticks cron qui se
   * chevauchent (ou un rejeu signé dans la fenêtre de skew) liraient le même
   * état et libéreraient deux fois. On sérialise donc via le mutex persistant
   * PayoutJobLockService (même patron que PayoutsService.processPeriod) :
   * une seconde exécution concurrente ne fait rien au lieu de doubler.
   */
  async releaseMaturedHeld(limit = 100): Promise<{
    selected: number;
    released: number;
    skipped: number;
    failed: number;
    failures: Array<{ eventId: string; reason: string }>;
  }> {
    const owner = `pid-${process.pid}-${createHash("sha256")
      .update(`${process.hrtime.bigint()}`)
      .digest("hex")
      .slice(0, 12)}`;
    const got = await this.jobLock.acquire(
      RELEASE_HELD_LOCK_NAME,
      owner,
      RELEASE_HELD_LOCK_TTL_MS
    );
    if (!got) {
      this.logger.warn("releaseMaturedHeld: lock occupé, exécution ignorée");
      return { selected: 0, released: 0, skipped: 0, failed: 0, failures: [] };
    }

    try {
      return await this.runReleaseMaturedHeld(limit);
    } finally {
      await this.jobLock.release(RELEASE_HELD_LOCK_NAME, owner);
    }
  }

  private async runReleaseMaturedHeld(limit: number): Promise<{
    selected: number;
    released: number;
    skipped: number;
    failed: number;
    failures: Array<{ eventId: string; reason: string }>;
  }> {
    const delaySetting = await this.prisma.client.platformSetting.findUnique({
      where: { key: HELD_RELEASE_DELAY_HOURS_KEY }
    });
    const delayHours = parseIntSetting(delaySetting?.value, DEFAULT_HELD_RELEASE_DELAY_HOURS);
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    // Un concours clôturé puis archivé garde sa réserve à libérer : on se fie à
    // closedAt, pas au seul statut CLOSED.
    const matured = await this.prisma.client.event.findMany({
      where: {
        status: { in: [EventStatus.CLOSED, EventStatus.ARCHIVED] },
        closedAt: { not: null, lte: cutoff }
      },
      select: { id: true, tenantId: true },
      orderBy: [{ closedAt: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(limit, 1), 500)
    });

    let released = 0;
    let skipped = 0;
    const failures: Array<{ eventId: string; reason: string }> = [];
    for (const ev of matured) {
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const wallet = await this.wallet.getOrCreateWallet(ev.tenantId, tx);
          const entries = await tx.walletLedgerEntry.findMany({
            where: { walletId: wallet.id, eventId: ev.id }
          });
          let allocated = 0;
          let alreadyReleased = 0;
          for (const e of entries) {
            if (e.kind === WalletLedgerKind.HELD_ALLOCATION) allocated += e.amountCfa;
            else if (e.kind === WalletLedgerKind.HELD_RELEASE) alreadyReleased += e.amountCfa;
          }
          const toRelease = Math.max(0, allocated - alreadyReleased);
          if (toRelease === 0) {
            skipped += 1;
            return;
          }
          await this.wallet.releaseHeldToWithdrawable(
            {
              tenantId: ev.tenantId,
              amountCfa: toRelease,
              eventId: ev.id,
              note: "Libération held → withdrawable (48h post-clôture)"
            },
            tx
          );
          released += 1;
        });
      } catch (error) {
        failures.push({
          eventId: ev.id,
          reason: error instanceof Error ? error.message : "Erreur inconnue"
        });
      }
    }
    return {
      selected: matured.length,
      released,
      skipped,
      failed: failures.length,
      failures
    };
  }
}
