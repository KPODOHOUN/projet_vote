import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformSecretsService } from "../../platform-control/platform-secrets.service";
import { FeexpayGateway } from "./feexpay.gateway";
import { FedapayGateway } from "./fedapay.gateway";
import type { PspCredentials, PspGateway } from "./psp.types";

/**
 * Resolves WHICH provider handles a transaction and WITH WHICH credentials, then
 * hands back the matching stateless gateway.
 *
 * Provider resolution chain (organizer's choice):
 *   event.provider ?? tenant.provider ?? env.DEFAULT_PSP_PROVIDER
 *
 * Credentials: SHADOMA encaisse tous les paiements sur son propre compte
 * prestataire (secrets chiffrés en base, sinon variables d'environnement).
 */
@Injectable()
export class PspRegistry {
  private readonly gateways: Map<PaymentProvider, PspGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSecrets: PlatformSecretsService,
    feexpay: FeexpayGateway,
    fedapay: FedapayGateway
  ) {
    this.gateways = new Map<PaymentProvider, PspGateway>([
      [PaymentProvider.FEEXPAY, feexpay],
      [PaymentProvider.FEDAPAY, fedapay]
    ]);
  }

  get(provider: PaymentProvider): PspGateway {
    const gw = this.gateways.get(provider);
    if (!gw) {
      throw new Error(`Aucun adaptateur PSP enregistré pour ${provider}.`);
    }
    return gw;
  }

  /**
   * Resolve the provider for a payment context. Reads the event's override first,
   * then the owning tenant's default, then the platform default. A null DB column
   * means "inherit", so we only fall through on null/undefined.
   */
  async resolveProvider(ctx: { eventId?: string | undefined; tenantId: string }): Promise<PaymentProvider> {
    if (ctx.eventId) {
      const event = await this.prisma.client.event.findUnique({
        where: { id: ctx.eventId },
        select: { provider: true, tenant: { select: { provider: true } } }
      });
      const resolved = event?.provider ?? event?.tenant.provider;
      if (resolved) return resolved;
    }
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { provider: true }
    });
    return tenant?.provider ?? (env.DEFAULT_PSP_PROVIDER as PaymentProvider);
  }

  /** Identifiants du compte plateforme : secrets chiffrés en base (FeexPay), sinon environnement. */
  async resolvePlatformCredentials(provider: PaymentProvider): Promise<PspCredentials> {
    if (provider === PaymentProvider.FEEXPAY) {
      const creds = await this.platformSecrets.resolvePlatformFeexpayCredentials();
      return { apiKey: creds.apiKey, shop: creds.shop };
    }
    if (provider === PaymentProvider.FEDAPAY) {
      return { apiKey: env.FEDAPAY_API_KEY, shop: "" };
    }
    throw new Error(`Aucun compte de paiement plateforme pour ${provider}.`);
  }

  /** Indique si le compte plateforme FeexPay est configuré (hors placeholders dev). */
  async isPlatformFeexpayConfigured(): Promise<boolean> {
    const setup = await this.platformSecrets.getPaymentSetupStatus();
    return setup.feexpayConfigured;
  }
}

export const PSP_REGISTRY = Symbol("PSP_REGISTRY_PROVIDER");
