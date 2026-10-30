import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { env } from "../config/env";
import { EventSettlementService } from "../offers/event-settlement.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const EVERY_FIVE_MINUTES_MS = 5 * 60_000;

/**
 * Filet de sécurité interne du worker cron Cloudflare : mêmes balayages
 * (rapprochement des paiements, clôture des concours échus, libération des
 * réserves), toutes les 5 minutes, dans chaque instance de l'API. Sans lui, un
 * worker non déployé ou en panne laissait paiements et réservations en attente
 * sans que rien ne le signale. Chaque balayage est idempotent (CAS sur les
 * statuts, verrou persistant pour les réserves) : tourner en même temps que le
 * worker, ou sur plusieurs instances, ne double rien.
 * Désactivable par API_INTERNAL_SCHEDULER=false ; jamais actif en test.
 */
@Injectable()
export class InternalSchedulerService {
  private readonly logger = new Logger(InternalSchedulerService.name);
  private running = false;

  constructor(
    private readonly reconciliation: PaymentReconciliationService,
    private readonly settlement: EventSettlementService
  ) {}

  @Interval(EVERY_FIVE_MINUTES_MS)
  async sweep(): Promise<void> {
    if (!env.API_INTERNAL_SCHEDULER || env.NODE_ENV === "test" || this.running) return;
    this.running = true;
    try {
      await this.step("payments.reconcile", () => this.reconciliation.reconcilePending());
      await this.step("events.close_expired", () => this.settlement.closeExpiredEvents());
      await this.step("settlement.release_held", () => this.settlement.releaseMaturedHeld());
    } finally {
      this.running = false;
    }
  }

  /** Une étape en échec est journalisée et n'empêche pas les suivantes. */
  private async step(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error({ msg: "internal_scheduler.step_failed", step: name, err: error instanceof Error ? error.message : String(error) });
    }
  }
}
