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
import { OrganizerSecretsModule } from "./organizer-secrets/organizer-secrets.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { PlatformControlModule } from "./platform-control/platform-control.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PartnersModule } from "./partners/partners.module";
import { PayoutsModule } from "./payouts/payouts.module";
import { AccountModule } from "./account/account.module";
import { SearchModule } from "./search/search.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { UploadsModule } from "./uploads/uploads.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { TicketsModule } from "./tickets/tickets.module";
import { DisplayPartnersModule } from "./display-partners/display-partners.module";
import { ChatModule } from "./chat/chat.module";

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

// In production on a multi-instance runtime (Cloud Run), an in-memory throttler
// store means per-endpoint limits are enforced per instance and reset on every
// cold start — materially weaker abuse protection on a paid-vote platform.
// We do NOT hard-fail boot (single-instance deploys are legitimate) but we emit
// a loud, structured warning so it is visible in the log pipeline.
if (env.NODE_ENV === "production" && !env.API_REDIS_URL) {
  process.stdout.write(
    `${JSON.stringify({
      level: "warn",
      msg: "throttler.in_memory_store",
      detail:
        "API_REDIS_URL is unset in production — rate limits are per-instance and reset on cold start. Configure Redis for a shared store.",
      timestamp: new Date().toISOString()
    })}\n`
  );
}
const throttleProviders =
  process.env.API_DISABLE_THROTTLE === "1"
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
    OrganizerSecretsModule,
    MaintenanceModule,
    ObservabilityModule,
    PrivacyModule,
    PlatformControlModule,
    PartnersModule,
    InvitationsModule,
    PayoutsModule,
    AccountModule,
    SearchModule,
    NotificationsModule,
    UploadsModule,
    AnalyticsModule,
    SubscriptionsModule,
    TicketsModule,
    DisplayPartnersModule,
    ChatModule
  ],
  controllers: [HealthController],
  providers: throttleProviders
})
export class AppModule {}
