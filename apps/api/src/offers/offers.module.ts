import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ObservabilityModule } from "../observability/observability.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { AdminOffersController } from "./admin-offers.controller";
import { CommissionOverrideService } from "./commission-override.service";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OrganizerOffersController } from "./organizer-offers.controller";
import { OrganizerOffersService } from "./organizer-offers.service";
import { OffersCronController } from "./offers-cron.controller";
import { PayoutJobLockService } from "../payouts/payout-job-lock.service";
import { PayoutDestinationService } from "../payouts/payout-destination.service";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

@Module({
  imports: [AuthModule, ObservabilityModule, NotificationsCoreModule],
  controllers: [OrganizerOffersController, AdminOffersController, OffersCronController],
  providers: [
    OfferSettingsService,
    WalletService,
    WithdrawalsService,
    EventStatsService,
    EventSettlementService,
    OrganizerOffersService,
    CommissionOverrideService,
    // Mutex persistant réutilisé par EventSettlementService.releaseMaturedHeld
    // (ne dépend que de PrismaService — pas besoin d'importer PayoutsModule).
    PayoutJobLockService,
    PayoutDestinationService
  ],
  exports: [OfferSettingsService, WalletService, EventStatsService, EventSettlementService]
})
export class OffersModule {}
