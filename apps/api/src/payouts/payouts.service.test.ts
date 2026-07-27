import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  EventStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PayoutKind,
  PayoutPeriodStatus,
  PayoutStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutsService } from "./payouts.service";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { PspRegistry } from "../payments/psp/psp.registry";
import { FeexpayGateway } from "../payments/psp/feexpay.gateway";
import { FedapayGateway } from "../payments/psp/fedapay.gateway";
import { KkiapayGateway } from "../payments/psp/kkiapay.gateway";
import type { PspPayoutInput, PspPayoutResult } from "../payments/psp/psp.types";
import { NotificationsService } from "../notifications/notifications.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PlatformSecretsService } from "../platform-control/platform-secrets.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

const prismaService = new PrismaService();
const balance = new PayoutBalanceService(prismaService);
const lock = new PayoutJobLockService(prismaService);
const destinations = new PayoutDestinationService(prismaService);
const notifications = new NotificationsService(prismaService);

/**
 * Scriptable registry: real provider-resolution against the DB, but sendPayout is
 * overridden so a test can drive SUCCEEDED / UNCERTAIN / FAILED without HTTP.
 */
class ScriptedRegistry extends PspRegistry {
  public next: PspPayoutResult = { status: "SUCCEEDED", providerRef: "po_ok" };
  public received: PspPayoutInput[] = [];
  private calls = 0;
  override get(provider: PaymentProvider) {
    const real = super.get(provider);
    // Arrow fn closes over the instance lexically — no `this` aliasing needed.
    return {
      ...real,
      provider: real.provider,
      sendPayout: async (input: PspPayoutInput): Promise<PspPayoutResult> => {
        this.received.push(input);
        this.calls += 1;
        // A real PSP returns a DISTINCT reference per disbursement. Mirror that so
        // two payouts in one period (organizer + platform) never collide on the
        // unique Payout.providerRef column.
        if (this.next.status === "SUCCEEDED") {
          return { status: "SUCCEEDED", providerRef: `${this.next.providerRef}_${this.calls}` };
        }
        return this.next;
      }
    } as ReturnType<PspRegistry["get"]>;
  }
}

function newRegistry() {
  return new ScriptedRegistry(
    prismaService,
    new OrganizerSecretsService(prismaService),
    new PlatformSecretsService(prismaService),
    new FeexpayGateway(),
    new FedapayGateway(),
    new KkiapayGateway()
  );
}

function newService(registry: ScriptedRegistry) {
  return new PayoutsService(prismaService, balance, lock, destinations, registry, notifications);
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedPaidVote(slug: string, amount = 1000, commission = 100, withDestination = true) {
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      displayName: slug,
      ...(withDestination
        ? { payoutNetwork: "MTN", payoutPhoneEnc: await encDest(), payoutPhoneLast4: "0000" }
        : {})
    }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: `${slug}-evt`,
      title: slug,
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const c = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "A", number: 1 }) });
  const v = await prisma.vote.create({
    data: { tenantId: tenant.id, eventId: event.id, candidateId: c.id, amountCfa: amount, paidAt: new Date() }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: v.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: amount,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: commission,
      idempotencyKey: `seed-${slug}-${Math.random().toString(36).slice(2)}`
    }
  });
  return { tenant, event };
}

// Encrypt a throwaway destination number through the real service so resolveForTenant works.
async function encDest(): Promise<string> {
  const tmp = await prisma.tenant.create({ data: { slug: `tmp-${Math.random().toString(36).slice(2)}`, displayName: "tmp" } });
  await destinations.setForTenant(tmp.id, { phone: "0190000000", network: "MTN" });
  const row = await prisma.tenant.findUniqueOrThrow({ where: { id: tmp.id } });
  await prisma.tenant.delete({ where: { id: tmp.id } });
  return row.payoutPhoneEnc!;
}

const win = () => ({ from: new Date(Date.now() - 600_000), to: new Date(Date.now() + 600_000) });

test("openPeriod: crée une période OPEN unique par label", async () => {
  const s = newService(newRegistry());
  const p = await s.openPeriod({ label: "2026-W22", ...win() });
  assert.equal(p.status, PayoutPeriodStatus.OPEN);
  await assert.rejects(s.openPeriod({ label: "2026-W22", ...win() }), /existe déjà/i);
});

test("processPeriod SUCCEEDED: organizer net 900 ; commission RETENUE (Flow A) ; lignes pinées ; CLOSED", async () => {
  const reg = newRegistry();
  const s = newService(reg);
  await seedPaidVote("ps1");
  const period = await s.openPeriod({ label: "2026-W23", ...win() });

  const result = await s.processPeriod(period.id);
  // Flow A: only the organizer net (900) is disbursed. The 100 commission stays
  // on the platform master account where the gross was collected — its source
  // payment is now pinned, so no separate PLATFORM payout is issued for it.
  assert.equal(result.payouts.length, 1);
  const org = result.payouts.find((p) => p.kind === PayoutKind.ORGANIZER);
  assert.equal(org?.amountCfa, 900);
  assert.equal(org?.status, PayoutStatus.SUCCEEDED);
  assert.ok(!result.payouts.some((p) => p.kind === PayoutKind.PLATFORM));

  // Layer 3: a fully-successful run pins its source lines and auto-CLOSES the
  // period. A 2nd pass is refused and disburses nothing more — no extra lines.
  const linesAfterFirst = await prisma.payoutLine.count({ where: { payout: { periodId: period.id } } });
  await assert.rejects(s.processPeriod(period.id), /CLOSED/i);
  assert.equal(
    await prisma.payoutLine.count({ where: { payout: { periodId: period.id } } }),
    linesAfterFirst,
    "aucune ligne supplémentaire au 2nd passage"
  );

  const refreshed = await prisma.payoutPeriod.findUniqueOrThrow({ where: { id: period.id } });
  assert.equal(refreshed.status, PayoutPeriodStatus.CLOSED);
});

test("processPeriod: un forfait d'activation génère un payout PLATEFORME (revenu non lié à un organisateur)", async () => {
  const reg = newRegistry();
  const s = newService(reg);
  const { tenant, event } = await seedPaidVote("ps1b");
  // Activation fee 25000 — platform revenue with no organizer counterpart.
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 25000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.ACTIVATION,
      idempotencyKey: `act-${Math.random().toString(36).slice(2)}`
    }
  });
  const period = await s.openPeriod({ label: "2026-W23b", ...win() });
  const result = await s.processPeriod(period.id);
  const plat = result.payouts.find((p) => p.kind === PayoutKind.PLATFORM);
  assert.equal(plat?.amountCfa, 25000, "le forfait d'activation est versé à la plateforme");
});

test("processPeriod sur période CLOSED: refusé", async () => {
  const s = newService(newRegistry());
  const period = await s.openPeriod({ label: "2026-W24", ...win() });
  await prisma.payoutPeriod.update({ where: { id: period.id }, data: { status: PayoutPeriodStatus.CLOSED } });
  await assert.rejects(s.processPeriod(period.id), /CLOSED/i);
});

test("Layer 4 — UNCERTAIN ne pin PAS et laisse la période PROCESSING", async () => {
  const reg = newRegistry();
  reg.next = { status: "UNCERTAIN", reason: "timeout" };
  const s = newService(reg);
  await seedPaidVote("ps3");
  const period = await s.openPeriod({ label: "2026-W26", ...win() });

  const result = await s.processPeriod(period.id);
  assert.ok(result.payouts.every((p) => p.status === PayoutStatus.UNCERTAIN));
  assert.equal(await prisma.payoutLine.count(), 0, "aucune ligne pinée sur UNCERTAIN");
  const p = await prisma.payoutPeriod.findUniqueOrThrow({ where: { id: period.id } });
  assert.equal(p.status, PayoutPeriodStatus.PROCESSING);
});

test("Layer 5 — deux processPeriod concurrents: un seul travaille (job lock)", async () => {
  const s1 = newService(newRegistry());
  const s2 = newService(newRegistry());
  await seedPaidVote("ps5");
  const period = await s1.openPeriod({ label: "2026-W25", ...win() });
  const [r1, r2] = await Promise.all([
    s1.processPeriod(period.id).catch((e) => ({ error: String(e) })),
    s2.processPeriod(period.id).catch((e) => ({ error: String(e) }))
  ]);
  const worked = [r1, r2].filter((r) => "payouts" in r && r.payouts.length > 0);
  assert.equal(worked.length, 1, "une seule instance émet des payouts");
});

test("Organizer sans destination de versement: ignoré (jamais de virement à l'aveugle)", async () => {
  const reg = newRegistry();
  const s = newService(reg);
  await seedPaidVote("ps6", 1000, 100, /* withDestination */ false);
  const period = await s.openPeriod({ label: "2026-W27", ...win() });
  const result = await s.processPeriod(period.id);
  // Only the platform payout is issued; the organizer is skipped.
  assert.ok(!result.payouts.some((p) => p.kind === PayoutKind.ORGANIZER));
});

test("resolveUncertain SUCCEEDED exige un providerRef et marque SUCCEEDED", async () => {
  const reg = newRegistry();
  reg.next = { status: "UNCERTAIN", reason: "timeout" };
  const s = newService(reg);
  await seedPaidVote("ps7");
  const period = await s.openPeriod({ label: "2026-W28", ...win() });
  await s.processPeriod(period.id);
  const uncertain = await prisma.payout.findFirstOrThrow({ where: { status: PayoutStatus.UNCERTAIN } });

  await assert.rejects(s.resolveUncertain(uncertain.id, { resolution: "SUCCEEDED" }), /providerRef/i);
  const ok = await s.resolveUncertain(uncertain.id, { resolution: "SUCCEEDED", providerRef: "manual-ref-1" });
  assert.equal(ok.status, "SUCCEEDED");
  const after = await prisma.payout.findUniqueOrThrow({ where: { id: uncertain.id } });
  assert.equal(after.status, PayoutStatus.SUCCEEDED);
  assert.equal(after.providerRef, "manual-ref-1");
});
