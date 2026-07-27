import { Injectable, Logger } from "@nestjs/common";
import { env } from "../config/env";

@Injectable()
export class AlertWebhookService {
  private readonly logger = new Logger(AlertWebhookService.name);

  /** POST JSON vers Slack / Discord / webhook générique. Best-effort. */
  async post(payload: Record<string, unknown>): Promise<void> {
    const url = env.PLATFORM_ALERT_WEBHOOK_URL;
    if (!url) {
      this.logger.debug("[webhook] PLATFORM_ALERT_WEBHOOK_URL absent, skip");
      return;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.error(`webhook ${response.status}: ${body.slice(0, 300)}`);
      }
    } catch (error) {
      this.logger.error(
        `webhook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
