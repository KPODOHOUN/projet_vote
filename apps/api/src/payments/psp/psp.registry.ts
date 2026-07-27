import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { paymentSecretKeys } from "../../common/payment-secrets";
import { PrismaService } from "../../prisma/prisma.service";
import { OrganizerSecretsService } from "../../organizer-secrets/organizer-secrets.service";
import { PlatformSecretsService } from "../../platform-control/platform-secrets.service";
import { FeexpayGateway } from "./feexpay.gateway";
import { FedapayGateway } from "./fedapay.gateway";
import { KkiapayGateway } from "./kkiapay.gateway";
import type { PspCredentials, PspGateway } from "./psp.types";

/**
 * Resolves WHICH provider handles a transaction and WITH WHICH credentials, then
 * hands back the matching stateless gateway.
 *
 * Provider resolution chain (organizer's choice):
 *   event.provider ?? tenant.provider ?? env.DEFAULT_PSP_PROVIDER
 *
 * Credential resolution:
 *   - ACTIVATION payins → platform env credentials only
 *   - VOTE payins → event/organizer secret, then platform env fallback (dev)
 */
@Injectable()
export class PspRegistry {
  private readonly gateways: Map<PaymentProvider, PspGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizerSecrets: OrganizerSecretsService,
    private readonly platformSecrets: PlatformSecretsService,
    feexpay: FeexpayGateway,
    fedapay: FedapayGateway,
    kkiapay: KkiapayGateway
  ) {
    this.gateways = new Map<PaymentProvider, PspGateway>([
      [PaymentProvider.FEEXPAY, feexpay],
      [PaymentProvider.FEDAPAY, fedapay],
      [PaymentProvider.KKIAPAY, kkiapay]
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

  /**
   * Per-provider credentials from env (platform master account, Flow A). FeexPay
   * uses Bearer apiKey + shop; FedaPay uses a Bearer secret key (no shop);
   * KkiaPay verifies with its three keys read directly by its gateway, so the
   * returned creds are a placeholder for port symmetry.
   */
  resolveCredentials(provider: PaymentProvider): PspCredentials {
    switch (provider) {
      case PaymentProvider.FEEXPAY:
        return { apiKey: env.FEEXPAY_API_KEY, shop: env.FEEXPAY_SHOP_ID };
      case PaymentProvider.FEDAPAY:
        return { apiKey: env.FEDAPAY_API_KEY, shop: "" };
      case PaymentProvider.KKIAPAY:
        return {
          apiKey: env.KKIAPAY_SECRET_KEY,
          shop: "",
          kkiapayPublicKey: env.KKIAPAY_PUBLIC_KEY,
          kkiapayPrivateKey: env.KKIAPAY_PRIVATE_KEY,
          kkiapaySecretKey: env.KKIAPAY_SECRET_KEY
        };
      default:
        throw new Error(`Credentials non résolues pour ${provider}.`);
    }
  }

  /**
   * Compte plateforme (DB chiffré → env) — forfait d'activation.
   */
  async resolvePlatformCredentials(provider: PaymentProvider): Promise<PspCredentials> {
    if (provider === PaymentProvider.FEEXPAY) {
      const creds = await this.platformSecrets.resolvePlatformFeexpayCredentials();
      return { apiKey: creds.apiKey, shop: creds.shop };
    }
    return this.resolveCredentials(provider);
  }

  /**
   * Votes : évènement partenaire → compte plateforme ; sinon clé orga/concours.
   */
  async resolveVotePayinCredentials(ctx: {
    eventId: string;
    tenantId: string;
  }): Promise<PspCredentials> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: ctx.eventId },
      select: { isPartnerEvent: true }
    });
    const provider = await this.resolveProvider(ctx);
    if (event?.isPartnerEvent) {
      return this.resolvePlatformCredentials(provider);
    }

    const platformCreds = await this.resolvePlatformCredentials(provider);
    const keys = paymentSecretKeys(provider);
    const resolved = await Promise.all(
      keys.map((k) => this.organizerSecrets.resolvePaymentSecret(ctx.eventId, ctx.tenantId, k))
    );

    if (provider === PaymentProvider.FEEXPAY) {
      const [apiKey] = resolved;
      if (apiKey) return { ...platformCreds, apiKey, shop: platformCreds.shop };
      return platformCreds;
    }
    if (provider === PaymentProvider.FEDAPAY) {
      const [apiKey] = resolved;
      if (apiKey) return { ...platformCreds, apiKey, shop: "" };
      return platformCreds;
    }
    if (provider === PaymentProvider.KKIAPAY) {
      const [pub, priv, sec] = resolved;
      if (pub && priv && sec) {
        return {
          ...platformCreds,
          kkiapayPublicKey: pub,
          kkiapayPrivateKey: priv,
          kkiapaySecretKey: sec
        };
      }
      return platformCreds;
    }
    return platformCreds;
  }

  /** Indique si le compte plateforme FeexPay est configuré (hors placeholders dev). */
  async isPlatformFeexpayConfigured(): Promise<boolean> {
    const setup = await this.platformSecrets.getPaymentSetupStatus();
    return setup.feexpayConfigured;
  }
}

export const PSP_REGISTRY = Symbol("PSP_REGISTRY_PROVIDER");
