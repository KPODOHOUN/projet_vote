import { Module } from "@nestjs/common";
import { AlertWebhookService } from "./alert-webhook.service";

@Module({
  providers: [AlertWebhookService],
  exports: [AlertWebhookService]
})
export class AlertsModule {}
