import { Module } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule, ThrottlerModuleOptions } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { Redis } from "ioredis";
import { APP_GUARD } from "@nestjs/core";
import { env } from "./config/env";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { HealthController } from "./health.controller";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { VotesModule } from "./votes/votes.module";
import { AdminModule } from "./admin/admin.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { PlatformControlModule } from "./platform-control/platform-control.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PayoutsModule } from "./payouts/payouts.module";
import { AccountModule } from "./account/account.module";
import { SearchModule } from "./search/search.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { UploadsModule } from "./uploads/uploads.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { TicketsModule } from "./tickets/tickets.module";
import { DisplayPartnersModule } from "./display-partners/display-partners.module";
import { ChatModule } from "./chat/chat.module";
import { OffersModule } from "./offers/offers.module";
import { ContractsModule } from "./contracts/contracts.module";

// Shared Redis store when API_REDIS_URL is configured (limits hold across all
// instances), else the default per-instance in-memory store. The login lockout
// (DB-backed) is the primary brute-force control; this rate limit is layered
// defence-in-depth.
const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [{ ttl: 60_000, limit: 120 }],
  ...(env.API_REDIS_URL
    ? { storage: new ThrottlerStorageRedisService(new Redis(env.API_REDIS_URL)) }
    : {})
};

// En production sans Redis, env.ts exige API_SINGLE_INSTANCE=true : un store
// en mémoire sur plusieurs instances compterait les limites par instance.
const throttleProviders =
  env.API_DISABLE_THROTTLE
    ? []
    : [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard
        }
      ];

@Module({
  imports: [
    ThrottlerModule.forRoot(throttlerOptions),
    PrismaModule,
    AuthModule,
    EventsModule,
    VotesModule,
    PaymentsModule,
    AdminModule,
    MaintenanceModule,
    ObservabilityModule,
    PrivacyModule,
    PlatformControlModule,
    InvitationsModule,
    PayoutsModule,
    AccountModule,
    SearchModule,
    NotificationsModule,
    UploadsModule,
    AnalyticsModule,
    TicketsModule,
    DisplayPartnersModule,
    ChatModule,
    OffersModule,
    ContractsModule
  ],
  controllers: [HealthController],
  providers: throttleProviders
})
export class AppModule {}
