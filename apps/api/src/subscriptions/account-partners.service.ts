import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import {
  AccountPartnerRequestStatus,
  AccountPlanStatus,
  AccountPlanType,
  UserRole
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { isPlatformOperator } from '../auth/platform-roles';
import { z } from 'zod';
import { env } from '../config/env';
import { COMMISSION_BPS_KEY, parseIntSetting } from '../common/platform-settings';

export const PARTNER_DEFAULT_COMMISSION_BPS_KEY = "partner_default_commission_bps";
export const DEFAULT_PARTNER_COMMISSION_BPS = 2000;

export const RequestPartnershipSchema = z.object({
  durationMonths: z.number().int().min(3).max(36),
  reason: z.string().trim().min(20).max(1000),
  signedFullName: z.string().trim().min(3).max(100),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter les conditions du contrat partenaire.' })
  })
});

export const ApprovePartnershipSchema = z.object({
  commissionBps: z.number().int().min(0).max(10000).optional(),
  note: z.string().max(500).optional()
});

export const RejectPartnershipSchema = z.object({
  note: z.string().min(3).max(500)
});

export const ListRequestsQuerySchema = z.object({
  status: z.nativeEnum(AccountPartnerRequestStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class AccountPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mailService: MailService
  ) {}

  private assertPlatformAdmin(user: AuthUser) {
    if (!isPlatformOperator(user.role)) {
      throw new ForbiddenException("Accès réservé aux administrateurs de la plateforme.");
    }
  }

  private async notifyOwnerByEmail(tenantId: string, subject: string, html: string): Promise<void> {
    const owners = await this.prisma.client.user.findMany({
      where: { tenantId, role: UserRole.ORGANIZER_OWNER },
      select: { email: true }
    });
    const emails = owners.map((o) => o.email);
    if (emails.length === 0) return;
    await this.mailService.send({ to: emails, subject: `[SHADOMA] ${subject}`, html });
  }

  private async notifyAdminsByEmail(subject: string, html: string): Promise<void> {
    const admins = await this.prisma.client.user.findMany({
      where: { role: { in: [UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN] } },
      select: { email: true }
    });
    const extra = env.MAIL_ADMIN_EXTRA_RECIPIENTS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
    const recipients = [...new Set([...admins.map((a) => a.email), ...extra])];
    if (recipients.length === 0) return;
    await this.mailService.send({ to: recipients, subject: `[SHADOMA] ${subject}`, html });
  }

  generateContractHtml(tenant: { displayName: string; slug: string }, durationMonths: number): string {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const displayName = escapeHtml(tenant.displayName);

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap');
  body { font-family: 'Inter', system-ui, sans-serif; color: #1e1e2e; margin: 0; padding: 0; background: #f8f9fc; }
  .contract { max-width: 800px; margin: 40px auto; background: #fff; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 32px 40px; color: white; }
  .header h1 { font-family: 'Playfair Display', serif; font-size: 24px; margin: 0 0 4px 0; font-weight: 700; }
  .header .subtitle { font-size: 13px; opacity: 0.85; font-weight: 500; }
  .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 12px; }
  .body { padding: 40px; }
  .parties { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; margin-bottom: 32px; padding: 20px; background: #f1f5f9; border-radius: 12px; }
  .party { text-align: center; }
  .party .name { font-weight: 700; font-size: 14px; color: #1e1e2e; margin-bottom: 2px; }
  .party .role { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .vs { font-size: 18px; font-weight: 800; color: #6366F1; }
  .section { margin-bottom: 28px; }
  .section h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6366F1; margin: 0 0 8px 0; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  .section p { font-size: 14px; line-height: 1.7; color: #334155; margin: 0; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
  .info-item { padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .info-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 600; }
  .info-item .value { font-size: 15px; font-weight: 700; color: #1e1e2e; margin-top: 2px; }
  .signature { margin-top: 40px; padding-top: 32px; border-top: 2px solid #e2e8f0; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .signature-box { padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fafafa; }
  .signature-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
  .signature-box .value { font-size: 13px; font-weight: 600; color: #1e1e2e; }
  .foot { padding: 24px 40px; background: #f8f9fc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="contract">
  <div class="header">
    <h1>Contrat de Partenariat</h1>
    <p class="subtitle">SHADOMA Votes — Plateforme de vote</p>
    <span class="badge">Version v1.0</span>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party">
        <div class="name">SHADOMA PLATFORM</div>
        <div class="role">Fournisseur de la plateforme</div>
      </div>
      <div class="vs">VS</div>
      <div class="party">
        <div class="name">${displayName}</div>
        <div class="role">Organisateur partenaire</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="label">Date d'effet</div>
        <div class="value">${fmtDate(now)}</div>
      </div>
      <div class="info-item">
        <div class="label">Date d'expiration</div>
        <div class="value">${fmtDate(expiresAt)}</div>
      </div>
      <div class="info-item">
        <div class="label">Durée</div>
        <div class="value">${durationMonths} mois</div>
      </div>
      <div class="info-item">
        <div class="label">Slug organisateur</div>
        <div class="value">${escapeHtml(tenant.slug)}</div>
      </div>
    </div>

    <div class="section">
      <h2>1. Objet</h2>
      <p>Le présent contrat définit les conditions du statut de <strong>Partenaire</strong> accordé à l'organisateur "${displayName}" (slug: ${escapeHtml(tenant.slug)}) sur la plateforme SHADOMA Votes. Ce statut permet à l'organisateur de bénéficier de conditions préférentielles et d'un accompagnement prioritaire.</p>
    </div>

    <div class="section">
      <h2>2. Durée</h2>
      <p>Le partenariat est conclu pour une durée de <strong>${durationMonths} mois</strong> à compter de sa validation par l'équipe d'administration. Il prendra fin le <strong>${fmtDate(expiresAt)}</strong>, sauf reconduction expresse.</p>
    </div>

    <div class="section">
      <h2>3. Commission</h2>
      <p>La plateforme prélève une commission sur chaque vote payé encaissé. Le taux par défaut est de <strong>20%</strong> (2000 points de base), sauf mention d'un taux négocié différent dans la décision d'approbation. Les sommes restantes sont reversées à l'organisateur lors des cycles de payout.</p>
    </div>

    <div class="section">
      <h2>4. Obligations du Partenaire</h2>
      <p>L'organisateur s'engage à respecter les règles d'éthique et d'intégrité de la plateforme. Il garantit la transparence des résultats et s'interdit toute forme de manipulation des votes. Tout manquement peut entraîner la suspension immédiate du partenariat.</p>
    </div>

    <div class="section">
      <h2>5. Résiliation</h2>
      <p>Chaque partie peut résilier le présent contrat par notification écrite. La plateforme se réserve le droit de suspendre ou résilier le partenariat à tout moment en cas de non-respect des obligations contractuelles. En cas de résiliation, les concours en cours restent accessibles aux votes jusqu'à leur date de fin programmée.</p>
    </div>

    <div class="section">
      <h2>6. Confidentialité et Données</h2>
      <p>Les parties s'engagent à traiter les données personnelles collectées dans le cadre des votes conformément au Règlement Général sur la Protection des Données (RGPD) et à la réglementation locale applicable.</p>
    </div>

    <div class="signature">
      <div class="signature-box">
        <div class="label">Pour SHADOMA PLATFORM</div>
        <div class="value" style="margin-top: 24px; color: #94a3b8; font-style: italic;">Signature électronique enregistrée</div>
      </div>
      <div class="signature-box">
        <div class="label">Pour l'organisateur</div>
        <div class="value" style="margin-top: 24px; font-size: 16px;">À signer sur la plateforme</div>
      </div>
    </div>
  </div>
  <div class="foot">
    Contrat généré automatiquement le ${fmtDate(now)} · SHADOMA Votes · Document non contractuel avant signature
  </div>
</div>
</body>
</html>`;
  }

  getContractTemplate(tenant: { id: string; displayName: string; slug: string }) {
    const generatedAt = new Date().toISOString();
    const version = 'v1.0';
    const html = this.generateContractHtml(tenant, 12);

    return {
      version,
      title: 'Contrat de Partenariat SHADOMA Votes',
      html,
      tenantName: tenant.displayName,
      generatedAt
    };
  }

  async requestAccountPartnership(user: AuthUser, payload: unknown) {
    if (user.role !== UserRole.ORGANIZER_OWNER) {
      throw new ForbiddenException("Seul le propriétaire du compte (Owner) peut demander un partenariat.");
    }

    const input = RequestPartnershipSchema.parse(payload);

    const pending = await this.prisma.client.accountPartnerRequest.findFirst({
      where: {
        tenantId: user.tenantId,
        status: AccountPartnerRequestStatus.PENDING
      }
    });
    if (pending) {
      throw new ConflictException("Une demande de partenariat est déjà en cours d'examen pour ce compte.");
    }

    const activePartner = await this.prisma.client.accountSubscription.findFirst({
      where: {
        tenantId: user.tenantId,
        planType: AccountPlanType.PARTNER,
        status: AccountPlanStatus.ACTIVE,
        expiresAt: { gt: new Date() }
      }
    });
    if (activePartner) {
      throw new ConflictException("Ce compte bénéficie déjà d'un partenariat actif.");
    }

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant introuvable.");
    }

    const contract = this.getContractTemplate(tenant);
    const now = new Date();

    const request = await this.prisma.client.accountPartnerRequest.create({
      data: {
        tenantId: user.tenantId,
        status: AccountPartnerRequestStatus.PENDING,
        durationMonths: input.durationMonths,
        requestedByUserId: user.userId,
        reason: input.reason,
        contractVersion: contract.version,
        contractAcceptedAt: now,
        signedFullName: input.signedFullName,
        signedAt: now
      }
    });

    // Notify admins
    await this.notifications.createForPlatformAdmins("ACCOUNT_PARTNER_REQUEST_RECEIVED", {
      requestId: request.id,
      tenantName: tenant.displayName,
      durationMonths: input.durationMonths
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'account_partner.requested',
        targetType: 'AccountPartnerRequest',
        targetId: request.id,
        metadata: { durationMonths: input.durationMonths, signedFullName: input.signedFullName }
      }
    });

    return request;
  }

  async getMyPartnerRequests(user: AuthUser) {
    return this.prisma.client.accountPartnerRequest.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getContract(user: AuthUser, requestId: string) {
    const request = await this.prisma.client.accountPartnerRequest.findUnique({
      where: { id: requestId },
      include: { tenant: { select: { displayName: true, slug: true } } }
    });
    if (!request) {
      throw new NotFoundException("Demande de partenariat introuvable.");
    }
    if (request.tenantId !== user.tenantId && !isPlatformOperator(user.role)) {
      throw new ForbiddenException("Accès non autorisé.");
    }
    const contractHtml = this.generateContractHtml(request.tenant, request.durationMonths);

    const contractHtmlWithSignature = contractHtml.replace(
      'À signer sur la plateforme',
      request.signedFullName
        ? `<strong>${escapeHtml(request.signedFullName)}</strong><br><span style="font-size:11px;color:#94a3b8;">Signé le ${request.signedAt ? new Date(request.signedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>`
        : 'Non signé'
    );

    return {
      id: request.id,
      status: request.status,
      version: request.contractVersion,
      html: contractHtmlWithSignature,
      signedFullName: request.signedFullName,
      signedAt: request.signedAt,
      durationMonths: request.durationMonths,
      createdAt: request.createdAt
    };
  }

  async approvePartnership(admin: AuthUser, requestId: string, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = ApprovePartnershipSchema.parse(payload);

    const request = await this.prisma.client.accountPartnerRequest.findUnique({
      where: { id: requestId },
      include: { tenant: true }
    });
    if (!request) {
      throw new NotFoundException("Demande de partenariat introuvable.");
    }
    if (request.status !== AccountPartnerRequestStatus.PENDING) {
      throw new ConflictException("Cette demande n'est plus en attente.");
    }

    let commissionBps = input.commissionBps;
    if (commissionBps === undefined) {
      const defaultSetting = await this.prisma.client.platformSetting.findUnique({
        where: { key: PARTNER_DEFAULT_COMMISSION_BPS_KEY }
      });
      commissionBps = parseIntSetting(defaultSetting?.value, DEFAULT_PARTNER_COMMISSION_BPS);
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + request.durationMonths);

    const subscription = await this.prisma.client.$transaction(async (trx) => {
      await trx.accountPartnerRequest.update({
        where: { id: requestId },
        data: {
          status: AccountPartnerRequestStatus.APPROVED,
          decidedByUserId: admin.userId,
          decidedAt: now,
          decisionNote: input.note ?? null,
          negotiatedCommissionBps: commissionBps
        }
      });

      await trx.tenant.update({
        where: { id: request.tenantId },
        data: { isPartner: true, partnerCommissionBps: commissionBps }
      });

      return trx.accountSubscription.create({
        data: {
          tenantId: request.tenantId,
          planType: AccountPlanType.PARTNER,
          status: AccountPlanStatus.ACTIVE,
          startsAt: now,
          expiresAt,
          durationMonths: request.durationMonths,
          priceCfa: null,
          frozenCommissionBps: commissionBps,
          partnerCommissionBps: commissionBps,
          accountPartnerRequestId: request.id
        }
      });
    });

    // Notify organizers
    await this.notifications.create(request.tenantId, "ACCOUNT_PARTNER_REQUEST_APPROVED", {
      requestId: request.id,
      durationMonths: request.durationMonths,
      commissionBps
    });

    // Send email to organizer owners
    await this.notifyOwnerByEmail(
      request.tenantId,
      "Partenariat approuvé — Bienvenue dans le programme Partenaire",
      `<p>Félicitations ! Votre demande de partenariat a été <strong>approuvée</strong>.</p>
       <ul>
         <li><strong>Durée :</strong> ${request.durationMonths} mois</li>
         <li><strong>Commission :</strong> ${commissionBps / 100}%</li>
         <li><strong>Expire le :</strong> ${expiresAt.toLocaleDateString("fr-FR")}</li>
       </ul>
       <p>Vous avez désormais accès à tous les avantages du statut Partenaire.</p>
       <p><a href="${env.APP_PUBLIC_URL}/dashboard/subscription">Voir mon abonnement</a></p>`
    );

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: 'account_partner.approved',
        targetType: 'AccountPartnerRequest',
        targetId: request.id,
        metadata: { durationMonths: request.durationMonths, commissionBps }
      }
    });

    return subscription;
  }

  async rejectPartnership(admin: AuthUser, requestId: string, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = RejectPartnershipSchema.parse(payload);

    const request = await this.prisma.client.accountPartnerRequest.findUnique({
      where: { id: requestId }
    });
    if (!request) {
      throw new NotFoundException("Demande de partenariat introuvable.");
    }
    if (request.status !== AccountPartnerRequestStatus.PENDING) {
      throw new ConflictException("Cette demande n'est plus en attente.");
    }

    const now = new Date();
    await this.prisma.client.accountPartnerRequest.update({
      where: { id: requestId },
      data: {
        status: AccountPartnerRequestStatus.REJECTED,
        decidedByUserId: admin.userId,
        decidedAt: now,
        decisionNote: input.note
      }
    });

    await this.notifications.create(request.tenantId, "ACCOUNT_PARTNER_REQUEST_REJECTED", {
      requestId: request.id,
      note: input.note
    });

    // Send email to organizer owners
    await this.notifyOwnerByEmail(
      request.tenantId,
      "Demande de partenariat — Réponse de notre équipe",
      `<p>Votre demande de partenariat n'a pas été retenue.</p>
       <p><strong>Motif :</strong> ${escapeHtml(input.note)}</p>
       <p>Vous pouvez souscrire à une formule Standard pour continuer à utiliser la plateforme.</p>
       <p><a href="${env.APP_PUBLIC_URL}/dashboard/subscription">Voir les formules disponibles</a></p>`
    );

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: 'account_partner.rejected',
        targetType: 'AccountPartnerRequest',
        targetId: request.id,
        metadata: { reason: input.note }
      }
    });

    return { success: true };
  }

  async listPendingRequests(admin: AuthUser) {
    this.assertPlatformAdmin(admin);
    return this.prisma.client.accountPartnerRequest.findMany({
      where: { status: AccountPartnerRequestStatus.PENDING },
      include: { tenant: { select: { displayName: true, slug: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listAllRequests(admin: AuthUser, query: unknown) {
    this.assertPlatformAdmin(admin);
    const input = ListRequestsQuerySchema.parse(query);
    return this.prisma.client.accountPartnerRequest.findMany({
      where: input.status ? { status: input.status } : {},
      include: { tenant: { select: { displayName: true, slug: true } } },
      take: input.limit,
      orderBy: { createdAt: 'desc' }
    });
  }

  async countPendingRequests() {
    return this.prisma.client.accountPartnerRequest.count({
      where: { status: AccountPartnerRequestStatus.PENDING }
    });
  }
}
