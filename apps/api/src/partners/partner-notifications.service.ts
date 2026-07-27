import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AlertWebhookService } from "../alerts/alert-webhook.service";
import { env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

type PartnerRequestContext = {
  requestId: string;
  eventId: string;
  eventTitle: string;
  tenantId: string;
  tenantName: string;
  reason: string;
  estimatedRevenueCfa: number;
  requesterEmail?: string;
};

@Injectable()
export class PartnerNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly webhooks: AlertWebhookService
  ) {}

  notifyRequestCreated(ctx: PartnerRequestContext): void {
    void this.notifications.createForPlatformAdmins("PARTNER_REQUEST_RECEIVED", {
      requestId: ctx.requestId,
      eventId: ctx.eventId,
      eventTitle: ctx.eventTitle,
      tenantName: ctx.tenantName,
      estimatedRevenueCfa: ctx.estimatedRevenueCfa
    });
    void this.sendAdminEmails(ctx);
    void this.webhooks.post({
      text: [
        "🤝 *Nouvelle demande formule partenaire*",
        `Évènement : ${ctx.eventTitle}`,
        `Organisateur : ${ctx.tenantName}`,
        `Recettes prévues : ${ctx.estimatedRevenueCfa.toLocaleString("fr-FR")} FCFA`,
        `Motif : ${ctx.reason.slice(0, 300)}`,
        `Traiter : ${env.APP_PUBLIC_URL}/dashboard/admin/partners`
      ].join("\n")
    });
  }

  notifyRequestApproved(tenantId: string, eventId: string, eventTitle: string): void {
    void this.notifications.create(tenantId, "PARTNER_REQUEST_APPROVED", {
      eventId,
      title: eventTitle
    });
    void this.notifyOrganizerOwnersByEmail(
      tenantId,
      `Formule partenaire approuvée — ${eventTitle}`,
      `<p>Bonne nouvelle : votre demande de formule partenaire pour <strong>${escapeHtml(eventTitle)}</strong> a été approuvée.</p>
       <p>Votre évènement est en ligne. Les votants peuvent désormais voter.</p>
       <p><a href="${env.APP_PUBLIC_URL}/dashboard/events/${eventId}/candidates">Ouvrir mon évènement</a></p>`
    );
  }

  notifyRequestRejected(tenantId: string, eventId: string, eventTitle: string): void {
    void this.notifications.create(tenantId, "PARTNER_REQUEST_REJECTED", {
      eventId,
      title: eventTitle
    });
    void this.notifyOrganizerOwnersByEmail(
      tenantId,
      `Formule partenaire non retenue — ${eventTitle}`,
      `<p>Votre demande de formule partenaire pour <strong>${escapeHtml(eventTitle)}</strong> n'a pas été retenue.</p>
       <p>Vous pouvez mettre votre évènement en ligne en réglant le forfait via Mobile Money.</p>
       <p><a href="${env.APP_PUBLIC_URL}/dashboard/events/${eventId}/candidates">Retour à la mise en ligne</a></p>`
    );
  }

  private async sendAdminEmails(ctx: PartnerRequestContext): Promise<void> {
    const admins = await this.prisma.client.user.findMany({
      where: { role: { in: [UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN] } },
      select: { email: true }
    });
    const extra = env.MAIL_ADMIN_EXTRA_RECIPIENTS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
    const recipients = [...new Set([...admins.map((a) => a.email), ...extra])];
    if (recipients.length === 0) return;

    const adminUrl = `${env.APP_PUBLIC_URL}/dashboard/admin/partners`;
    const revenue = ctx.estimatedRevenueCfa.toLocaleString("fr-FR");
    await this.mail.send({
      to: recipients,
      subject: `[SHADOMA] Demande partenaire — ${ctx.eventTitle}`,
      html: `<p>Une nouvelle demande de <strong>formule partenaire</strong> est en attente.</p>
        <ul>
          <li><strong>Évènement :</strong> ${escapeHtml(ctx.eventTitle)}</li>
          <li><strong>Organisateur :</strong> ${escapeHtml(ctx.tenantName)}</li>
          <li><strong>Recettes prévues :</strong> ${revenue} FCFA</li>
          <li><strong>Motif :</strong> ${escapeHtml(ctx.reason)}</li>
          ${ctx.requesterEmail ? `<li><strong>Demandeur :</strong> ${escapeHtml(ctx.requesterEmail)}</li>` : ""}
        </ul>
        <p>Délai de traitement : 24 à 72 h.</p>
        <p><a href="${adminUrl}">Traiter sur SHADOMA Votes</a></p>`,
      text: `Demande partenaire — ${ctx.eventTitle} (${ctx.tenantName}). Recettes prévues : ${revenue} FCFA. Motif : ${ctx.reason}. Traiter : ${adminUrl}`
    });
  }

  private async notifyOrganizerOwnersByEmail(
    tenantId: string,
    subject: string,
    html: string
  ): Promise<void> {
    const owners = await this.prisma.client.user.findMany({
      where: { tenantId, role: UserRole.ORGANIZER_OWNER },
      select: { email: true }
    });
    const emails = owners.map((o) => o.email);
    if (emails.length === 0) return;
    await this.mail.send({ to: emails, subject: `[SHADOMA] ${subject}`, html });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
