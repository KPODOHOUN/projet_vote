import { Injectable, Logger } from "@nestjs/common";
import { env } from "../config/env";

export type MailPayload = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** Best-effort : ne lève jamais. Retourne false si l'e-mail n'a pas été envoyé. */
  async send(payload: MailPayload): Promise<boolean> {
    const recipients = [...new Set(payload.to.map((e) => e.trim()).filter(Boolean))];
    if (recipients.length === 0) return false;

    if (!env.MAIL_RESEND_API_KEY) {
      this.logger.warn(
        `[mail:dev] ${payload.subject} → ${recipients.join(", ")} (MAIL_RESEND_API_KEY absent)`
      );
      return false;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.MAIL_RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: recipients,
          subject: payload.subject,
          html: payload.html,
          ...(payload.text ? { text: payload.text } : {})
        })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.error(`Resend ${response.status}: ${body.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `mail send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
}
