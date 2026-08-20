import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { TenantOfferType } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { OFFER1_ENABLED_KEY } from "../common/platform-settings";
import {
  DEFAULT_OFFER1_ENABLED,
  OfferSettingsService
} from "./offer-settings.service";

test("par défaut l'offre External est désactivée pendant la phase de test", () => {
  assert.equal(DEFAULT_OFFER1_ENABLED, false);
});

test("register refuse EXTERNAL quand l'offre 1 est désactivée", async () => {
  const prisma = {
    client: {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          where.key === OFFER1_ENABLED_KEY ? { value: "false" } : null
      },
      tenant: {
        findUnique: async () => null,
        create: async () => {
          throw new Error("tenant.create ne doit pas être appelé");
        }
      }
    }
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    { send: async () => true } as never
  );

  await assert.rejects(
    service.register({
      tenantSlug: "parked-ext",
      tenantDisplayName: "Parked Ext",
      email: "owner@parked-ext.africa",
      password: "SecurePass123!",
      offerType: TenantOfferType.EXTERNAL,
      acceptPrivacyPolicy: true as const
    }),
    /réflexion|indisponible|External/i
  );
});

test("getSettings reflète offer1ExternalEnabled=false par défaut", async () => {
  const prisma = {
    client: {
      platformSetting: {
        findMany: async () => []
      }
    }
  };
  const settings = await new OfferSettingsService(prisma as never).getSettings();
  assert.equal(settings.offer1ExternalEnabled, false);
  assert.equal(settings.offer2EscrowEnabled, true);
});
