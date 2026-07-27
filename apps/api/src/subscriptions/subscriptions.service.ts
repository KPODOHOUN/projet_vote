import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AccountPlanStatus, AccountPlanType, PaymentProvider, PaymentPurpose, PaymentStatus, UserRole } from '@prisma/client';
import { COMMISSION_BPS_KEY, parseIntSetting } from '../common/platform-settings';
import { AuthUser } from '../auth/auth.types';
import { PspRegistry } from '../payments/psp/psp.registry';
import { normalizePayinPhone, resolvePayinOperator } from '../common/mobile-operator';
import { PaymentVerifyService } from '../payments/payment-verify.service';
import { z } from 'zod';
import { env } from '../config/env';

export const InitSubscriptionSchema = z.object({
  durationMonths: z.number().int().positive(),
  payerPhone: z.string().min(8).max(20),
  operator: z.string().min(2).max(20).optional(),
  idempotencyKey: z.string().min(16)
});

export const UpdatePricingSchema = z.object({
  items: z.array(z.object({
    durationMonths: z.number().int().positive(),
    priceCfa: z.number().int().positive(),
    active: z.boolean()
  }))
});

@Injectable()
export class SubscriptionsService {
  private readonly lastPullAtByTx = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mailService: MailService,
    private readonly pspRegistry: PspRegistry,
    private readonly verifyService: PaymentVerifyService
  ) {}

  private shouldPullNow(transactionId: string): boolean {
    const now = Date.now();
    const last = this.lastPullAtByTx.get(transactionId) ?? 0;
    if (now - last < env.PSP_STATUS_PULL_MIN_INTERVAL_MS) {
      return false;
    }
    this.lastPullAtByTx.set(transactionId, now);
    return true;
  }

  async getAccountPlanStatus(tenantId: string) {
    const now = new Date();
    const subscription = await this.prisma.client.accountSubscription.findFirst({
      where: {
        tenantId,
        status: AccountPlanStatus.ACTIVE,
        expiresAt: { gt: now }
      },
      orderBy: { expiresAt: 'desc' }
    });

    if (!subscription) {
      return {
        hasPlan: false,
        planType: null,
        status: null,
        expiresAt: null,
        canCreateEvents: false,
        canReceiveVotes: false,
        frozenCommissionBps: null,
        daysRemaining: 0,
        subscription: null
      };
    }

    const daysRemaining = Math.max(0, Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      hasPlan: true,
      planType: subscription.planType,
      status: subscription.status,
      expiresAt: subscription.expiresAt,
      canCreateEvents: true,
      canReceiveVotes: true,
      frozenCommissionBps: subscription.frozenCommissionBps,
      daysRemaining,
      subscription
    };
  }

  async assertCanCreateEvent(tenantId: string) {
    const status = await this.getAccountPlanStatus(tenantId);
    if (!status.canCreateEvents) {
      throw new ForbiddenException("Abonnement requis pour créer un évènement. Souscrivez un plan Standard ou demandez un partenariat.");
    }
  }

  async assertCanReceiveVotes(tenantId: string, eventId: string) {
    const status = await this.getAccountPlanStatus(tenantId);
    if (status.canReceiveVotes) return;

    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId }
    }) as any;

    if (!event) throw new NotFoundException("Évènement introuvable.");

    const now = new Date();
    if (event.createdAt && event.endsAt && event.endsAt > now) {
      const pastSub = await this.prisma.client.accountSubscription.findFirst({
        where: {
          tenantId,
          planType: AccountPlanType.PARTNER,
          status: AccountPlanStatus.EXPIRED,
          startsAt: { lte: event.createdAt },
          expiresAt: { gte: event.createdAt }
        }
      });
      if (pastSub) return;
    }

    throw new ForbiddenException("L'abonnement de l'organisateur a expiré. Les votes sont suspendus.");
  }

  async listPricing() {
    return this.prisma.client.subscriptionPricing.findMany({
      where: { active: true },
      orderBy: { durationMonths: 'asc' }
    });
  }

  async initSubscriptionPayment(user: AuthUser, payload: unknown) {
    const data = InitSubscriptionSchema.parse(payload);

    const pricing = await this.prisma.client.subscriptionPricing.findUnique({
      where: { durationMonths: data.durationMonths }
    });
    if (!pricing || !pricing.active) {
      throw new NotFoundException("Tarif d'abonnement introuvable.");
    }

    const currentStatus = await this.getAccountPlanStatus(user.tenantId);
    if (currentStatus.hasPlan) {
      throw new ForbiddenException("Vous avez déjà un abonnement actif.");
    }

    const setting = await this.prisma.client.platformSetting.findUnique({
      where: { key: COMMISSION_BPS_KEY }
    });
    const frozenCommissionBps = parseIntSetting(setting?.value, 1000);

    const tx = await this.prisma.client.$transaction(async (prisma) => {
      return prisma.paymentTransaction.create({
        data: {
          tenantId: user.tenantId,
          eventId: '__subscription__',
          provider: PaymentProvider.FEEXPAY, // default initial choice, will resolve actual next
          amountCfa: pricing.priceCfa,
          currency: 'XOF',
          status: PaymentStatus.PENDING,
          purpose: PaymentPurpose.SUBSCRIPTION,
          idempotencyKey: data.idempotencyKey,
        }
      });
    });

    const phone = normalizePayinPhone(data.payerPhone);
    const resolvedOperator = resolvePayinOperator(data.operator, phone);

    const provider = await this.pspRegistry.resolveProvider({ tenantId: user.tenantId });
    await this.prisma.client.paymentTransaction.update({
      where: { id: tx.id },
      data: { provider }
    });

    if (env.API_PAYMENT_DEMO_MODE) {
      const demoRef = `demo_${tx.id}`;
      await this.prisma.client.paymentTransaction.update({
        where: { id: tx.id },
        data: { providerRef: demoRef }
      });
      await this.verifyService.applyDemoSuccess(tx.id);

      return {
        transactionId: tx.id,
        priceCfa: pricing.priceCfa,
        durationMonths: data.durationMonths,
        frozenCommissionBps,
        status: PaymentStatus.SUCCEEDED
      };
    }

    const gateway = this.pspRegistry.get(provider);
    const creds = await this.pspRegistry.resolvePlatformCredentials(provider);
    
    const payin = await (gateway as any).initPayin({ 
      amountCfa: pricing.priceCfa, 
      phoneNumber: phone, 
      operator: resolvedOperator, 
      customId: tx.id, 
      description: `Abonnement ${data.durationMonths} mois` 
    }, creds);

    await this.prisma.client.paymentTransaction.update({
      where: { id: tx.id },
      data: { providerRef: payin.reference }
    });

    return {
      transactionId: tx.id,
      priceCfa: pricing.priceCfa,
      durationMonths: data.durationMonths,
      frozenCommissionBps,
      status: PaymentStatus.PENDING
    };
  }

  async getSubscriptionPaymentStatus(user: AuthUser, transactionId: string) {
    const tx = await this.prisma.client.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: user.tenantId }
    });
    if (!tx) {
      throw new NotFoundException("Transaction introuvable.");
    }

    if (tx.status === PaymentStatus.PENDING && tx.providerRef) {
      if (env.API_PAYMENT_DEMO_MODE && tx.providerRef.startsWith("demo_")) {
        // Trigger verify flow directly (auto-approves in demo mode)
        await this.verifyService.verifyAndApplyByReference(tx.providerRef);
      } else if (this.shouldPullNow(tx.id)) {
        await this.verifyService.verifyAndApplyByReference(tx.providerRef);
      }
    }

    const fresh = await this.prisma.client.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: user.tenantId }
    });
    if (!fresh) {
      throw new NotFoundException("Transaction introuvable.");
    }

    const activeSub = await this.prisma.client.accountSubscription.findFirst({
      where: {
        tenantId: user.tenantId,
        paymentTransactionId: fresh.id
      }
    });

    return {
      transactionId: fresh.id,
      status: fresh.status,
      amountCfa: fresh.amountCfa,
      purpose: fresh.purpose,
      activatedSubscription: activeSub
    };
  }

  async getMySubscription(user: AuthUser) {
    const now = new Date();
    const current = await this.prisma.client.accountSubscription.findFirst({
      where: {
        tenantId: user.tenantId,
        status: AccountPlanStatus.ACTIVE,
        expiresAt: { gt: now }
      },
      orderBy: { expiresAt: 'desc' }
    });

    const past = await this.prisma.client.accountSubscription.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { status: AccountPlanStatus.EXPIRED },
          { status: AccountPlanStatus.CANCELLED },
          { expiresAt: { lte: now } }
        ]
      },
      orderBy: { expiresAt: 'desc' }
    });

    let progressData: { daysRemaining: number; totalDays: number; progressPercent: number } | null = null;
    if (current) {
      const totalDays = Math.ceil((current.expiresAt.getTime() - current.startsAt.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, Math.ceil((current.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const progressPercent = totalDays > 0 ? Math.min(100, Math.round(((totalDays - daysRemaining) / totalDays) * 100)) : 0;
      progressData = {
        daysRemaining,
        totalDays,
        progressPercent
      };
    }

    return { current, past, progress: progressData };
  }

  async processExpirations() {
    const now = new Date();
    const expired = await this.prisma.client.accountSubscription.findMany({
      where: {
        status: AccountPlanStatus.ACTIVE,
        expiresAt: { lte: now }
      }
    });

    for (const sub of expired) {
      await this.prisma.client.$transaction(async (trx) => {
        await trx.accountSubscription.update({
          where: { id: sub.id },
          data: { status: AccountPlanStatus.EXPIRED }
        });
        
        await this.notifications.create(sub.tenantId, "SUBSCRIPTION_EXPIRED", {
          planType: sub.planType,
          expiredAt: sub.expiresAt.toISOString()
        });

        await trx.auditLog.create({
          data: {
            tenantId: sub.tenantId,
            actorUserId: "system:subscriptions:cron",
            actorRole: UserRole.PLATFORM_ADMIN,
            action: 'subscription.expired',
            targetType: 'AccountSubscription',
            targetId: sub.id,
            metadata: { planType: sub.planType }
          }
        });
      });
    }
    return expired.length;
  }

  async processReminders() {
    const now = new Date();
    
    const subs = await this.prisma.client.accountSubscription.findMany({
      where: {
        status: AccountPlanStatus.ACTIVE,
        expiresAt: { gt: now }
      }
    });

    let sentCount = 0;
    for (const sub of subs) {
      const daysRemaining = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let reminderKey: 'reminderJ1Sent' | 'reminderJ3Sent' | 'reminderJ7Sent' | null = null;
      let daysLabel = 0;
      
      if (daysRemaining <= 1) {
        if (!sub.reminderJ1Sent) {
          reminderKey = 'reminderJ1Sent';
          daysLabel = 1;
        }
      } else if (daysRemaining <= 3) {
        if (!sub.reminderJ3Sent) {
          reminderKey = 'reminderJ3Sent';
          daysLabel = 3;
        }
      } else if (daysRemaining <= 7) {
        if (!sub.reminderJ7Sent) {
          reminderKey = 'reminderJ7Sent';
          daysLabel = 7;
        }
      }

      if (reminderKey) {
        const updateData: any = { [reminderKey]: true };
        if (reminderKey === 'reminderJ1Sent') {
          updateData.reminderJ3Sent = true;
          updateData.reminderJ7Sent = true;
        } else if (reminderKey === 'reminderJ3Sent') {
          updateData.reminderJ7Sent = true;
        }

        await this.prisma.client.accountSubscription.update({
          where: { id: sub.id },
          data: updateData
        });

        const users = await this.prisma.client.user.findMany({
          where: { tenantId: sub.tenantId, role: { not: UserRole.ORGANIZER_STAFF } },
          select: { email: true }
        });
        const emails = users.map(u => u.email).filter(Boolean);

        await this.notifications.create(sub.tenantId, "SUBSCRIPTION_EXPIRING_SOON", {
          daysRemaining: daysLabel,
          expiresAt: sub.expiresAt.toISOString()
        });

        if (emails.length > 0) {
          await this.mailService.send({
            to: emails,
            subject: `Votre abonnement expire dans ${daysLabel} jour(s)`,
            html: `<p>Bonjour,</p><p>Votre abonnement sur la plateforme de vote expire le ${sub.expiresAt.toLocaleDateString('fr-FR')} (dans ${daysLabel} jour(s)).</p><p>Renouvelez votre abonnement dès maintenant pour éviter toute interruption de service.</p>`
          });
        }
        sentCount++;
      }
    }
    return sentCount;
  }

  async listAllSubscriptions(admin: AuthUser, query: any) {
    if (admin.role !== UserRole.PLATFORM_ADMIN && admin.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    return this.prisma.client.accountSubscription.findMany({
      include: {
        tenant: {
          select: { displayName: true, slug: true }
        }
      },
      orderBy: { expiresAt: 'desc' }
    });
  }

  async listPricingAdmin() {
    return this.prisma.client.subscriptionPricing.findMany({
      orderBy: { durationMonths: 'asc' }
    });
  }

  async updatePricing(admin: AuthUser, payload: any) {
    if (admin.role !== UserRole.PLATFORM_ADMIN && admin.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    const data = UpdatePricingSchema.parse(payload);
    for (const item of data.items) {
      await this.prisma.client.subscriptionPricing.upsert({
        where: { durationMonths: item.durationMonths },
        update: { priceCfa: item.priceCfa, active: item.active },
        create: { durationMonths: item.durationMonths, priceCfa: item.priceCfa, active: item.active }
      });
    }
    return { success: true };
  }
}

