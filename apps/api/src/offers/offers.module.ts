import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminOffersController } from "./admin-offers.controller";
import { CommissionOverrideService } from "./commission-override.service";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OrganizerOffersController } from "./organizer-offers.controller";
import { OrganizerOffersService } from "./organizer-offers.service";
import { OffersCronController } from "./offers-cron.controller";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerOffersController, AdminOffersController, OffersCronController],
  providers: [
    OfferSettingsService,
    WalletService,
    WithdrawalsService,
    EventStatsService,
    EventSettlementService,
    OrganizerOffersService,
    CommissionOverrideService
  ],
  exports: [OfferSettingsService, WalletService, EventStatsService, EventSettlementService]
})
export class OffersModule {}
