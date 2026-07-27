import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Persisted distributed mutex (anti-double-spend layer 5). Unlike a Postgres
 * advisory lock it is observable and survives connection churn. A held lock that
 * has passed its expiry is considered stale and may be taken over, so a crashed
 * worker never wedges the payout pipeline forever.
 */
@Injectable()
export class PayoutJobLockService {
  constructor(private readonly prisma: PrismaService) {}

  async acquire(name: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(Date.now() + ttlMs);
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.payoutJobLock.findUnique({ where: { name } });
      if (existing && existing.expiresAt > now) {
        return false;
      }
      if (existing) {
        await tx.payoutJobLock.update({
          where: { name },
          data: { acquiredAt: now, acquiredBy: owner, expiresAt }
        });
      } else {
        await tx.payoutJobLock.create({
          data: { name, acquiredAt: now, acquiredBy: owner, expiresAt }
        });
      }
      return true;
    });
  }

  async release(name: string, owner: string): Promise<void> {
    await this.prisma.client.payoutJobLock.deleteMany({ where: { name, acquiredBy: owner } });
  }
}
