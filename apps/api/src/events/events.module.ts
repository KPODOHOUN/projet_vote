import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VotesModule } from "../votes/votes.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { OffersModule } from "../offers/offers.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [
    AuthModule,
    VotesModule,
    NotificationsCoreModule,
    OffersModule
  ],
  controllers: [EventsController],
  providers: [EventsService]
})
export class EventsModule { }
