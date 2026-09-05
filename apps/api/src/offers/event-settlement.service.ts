import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  EventStatus,
  TenantOfferType,
  UserRole,
  WalletLedgerKind
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";
import { EventStatsService } from "./event-stats.service";
import { WalletService } from "./wallet.service";

@Injectable()
export class EventSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly offerSettings: OfferSettingsService,
    private readonly eventStats: EventStatsService
  ) {}

  /**
   * Manual close: set closedAt + CLOSED. For ESCROW, apply retention % on the
   * event's pending credits and release the remainder to available.
   */
  async closeEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      include: { tenant: { select: { offerType: true } } }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.closedAt || event.status === EventStatus.CLOSED) {
      throw new ConflictException("Cet évènement est déjà clôturé.");
    }
    if (event.status === EventStatus.ARCHIVED) {
      throw new ConflictException("Impossible de clôturer un évènement archivé.");
    }

    const settings = await this.offerSettings.getSettings();
    const now = new Date();

    const result = await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.event.updateMany({
        where: {
          id: event.id,
          closedAt: null,
          status: { notIn: [EventStatus.CLOSED, EventStatus.ARCHIVED] }
        },
        data: { status: EventStatus.CLOSED, closedAt: now }
      });
      if (claimed.count === 0) {
        throw new ConflictException("Cet évènement a déjà été clôturé.");
      }
      const closed = await tx.event.findUniqueOrThrow({ where: { id: event.id } });

      let retentionCfa = 0;
      let releasedCfa = 0;

      if (event.tenant.offerType === TenantOfferType.ESCROW) {
        const wallet = await this.wallet.getOrCreateWallet(user.tenantId, tx);
        const entries = await tx.walletLedgerEntry.findMany({
          where: { walletId: wallet.id, eventId: event.id }
        });

        let credited = 0;
        let alreadyDebited = 0;
        for (const e of entries) {
          if (
            e.kind === WalletLedgerKind.VOTE_CREDIT ||
            e.kind === WalletLedgerKind.TOPUP_CREDIT
          ) {
            credited += e.amountCfa;
          } else if (
            e.kind === WalletLedgerKind.RETENTION_DEBIT ||
            e.kind === WalletLedgerKind.WITHDRAWAL_DEBIT
          ) {
            alreadyDebited += e.amountCfa;
          } else if (e.kind === WalletLedgerKind.ADJUSTMENT && e.note?.includes("Libération")) {
            // Already released to available — treat as out of pending pool.
            alreadyDebited += e.amountCfa;
          }
        }

        const pendingForEvent = Math.max(0, credited - alreadyDebited);
        if (pendingForEvent > 0) {
          retentionCfa = Math.floor(
            (pendingForEvent * settings.offer2RetentionBps) / 10_000
          );
          const toRelease = pendingForEvent - retentionCfa;

          if (retentionCfa > 0) {
            await this.wallet.debit(
              {
                tenantId: user.tenantId,
                amountCfa: retentionCfa,
                kind: WalletLedgerKind.RETENTION_DEBIT,
                from: "held",
                eventId: event.id,
                note: `Retenue plateforme ${settings.offer2RetentionBps} bps`
              },
              tx
            );
          }

          if (toRelease > 0) {
            await this.wallet.releaseHeldToWithdrawable(
              {
                tenantId: user.tenantId,
                amountCfa: toRelease,
                eventId: event.id,
                note: "Libération pending → available après clôture"
              },
              tx
            );
            releasedCfa = toRelease;
          }
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "event.closed",
          targetType: "Event",
          targetId: event.id,
          metadata: {
            offerType: event.tenant.offerType,
            retentionCfa,
            releasedCfa,
            closedAt: now.toISOString()
          }
        }
      });

      return { event: closed, retentionCfa, releasedCfa };
    });

    const stats = await this.eventStats.getEventStats(event.id, user.tenantId);
    return { ...result, stats };
  }

  /**
   * Auto-close ACTIVE events past endsAt (Offer 2 retention applied via closeEvent logic).
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
}
