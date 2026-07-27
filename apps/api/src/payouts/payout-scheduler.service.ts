import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../config/env";
import { PayoutsService } from "./payouts.service";

/**
 * Automated payout scheduler. Runs daily at midnight UTC:
 * 1. Opens a PayoutPeriod for the previous calendar day
 * 2. Processes it (computes balances, pushes disbursements through PSP)
 *
 * Only active when API_PAYMENT_DEMO_MODE=true (safe for dev/demo).
 * In production, payouts remain admin-triggered.
 */
@Injectable()
export class PayoutSchedulerService {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(private readonly payouts: PayoutsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDailyPayout() {
    if (!env.API_PAYMENT_DEMO_MODE) {
      this.logger.log("Payout cron désactivé (hors mode démo)");
      return;
    }

    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const label = `Auto ${from.toISOString().slice(0, 10)}`;

    try {
      const period = await this.payouts.openPeriod({ label, from, to });
      this.logger.log(`Période créée : ${period.id} (${label})`);

      const result = await this.payouts.processPeriod(period.id);
      this.logger.log(
        `Période traitée : ${period.id} — ${result.payouts.length} versement(s) émis`
      );
    } catch (error) {
      this.logger.error(
        `Erreur lors du traitement automatique de la période ${label}`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
