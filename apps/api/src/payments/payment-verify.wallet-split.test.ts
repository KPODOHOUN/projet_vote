import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider, PaymentPurpose, PaymentStatus, TenantOfferType, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../offers/wallet.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { PaymentVerifyService } from "./payment-verify.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PspRegistry } from "./psp/psp.registry";
import {
  OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY,
  OFFER2_PER_VOTE_COMMISSION_BPS_KEY,
  SETTLEMENT_HELD_BPS_KEY
} from "../common/platform-settings";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const offerSettings = new OfferSettingsService(prisma);
const notifications = new NotificationsService(prisma);
const pspRegistry = {} as PspRegistry; // non utilisé par applyDemoSuccess
const verifyService = new PaymentVerifyService(prisma, notifications, pspRegistry, wallet, offerSettings);

test("applyDemoSuccess (ESCROW, vote): crédite held+withdrawable selon heldBps et commissionBps de l'event", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY, value: "1000", updatedByUserId: "test" }, // 10%
    update: { value: "1000" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: SETTLEMENT_HELD_BPS_KEY },
    create: { key: SETTLEMENT_HELD_BPS_KEY, value: "5000", updatedByUserId: "test" }, // 50%
    update: { value: "5000" }
  });

  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `pv-split-${Date.now().toString(36)}`,
      displayName: "PV Split",
      offerType: TenantOfferType.ESCROW
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "PV split event",
      slug: `ev-pv-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      heldBps: 5_000
    }
  });
  const candidate = await prisma.client.candidate.create({
    data: { eventId: event.id, fullName: "Candidate PV", publicRef: `cand-${Date.now().toString(36)}` }
  });
  const vote = await prisma.client.vote.create({
    data: { eventId: event.id, candidateId: candidate.id, amountCfa: 1_000, currency: "XOF" }
  });
  const tx = await prisma.client.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      purpose: PaymentPurpose.VOTE,
      provider: PaymentProvider.FEEXPAY,
      status: PaymentStatus.PENDING,
      amountCfa: 1_000,
      currency: "XOF",
      providerRef: `pvref-${Date.now().toString(36)}`
    }
  });

  await verifyService.applyDemoSuccess(tx.id);

  // brut=1000, commission=10%=100, net=900, held=50%*900=450, withdrawable=450.
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 450);
  assert.equal(w.withdrawableCfa, 450);

  const heldEntry = w.recentEntries.find((e) => e.kind === WalletLedgerKind.HELD_ALLOCATION);
  assert.ok(heldEntry);
  assert.equal(heldEntry.amountCfa, 450);
});
