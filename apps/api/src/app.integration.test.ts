import "reflect-metadata";
import { createHmac } from "node:crypto";
import cookieParser from "cookie-parser";
import { test, before, after } from "node:test";
import type { TestContext } from "node:test";
import * as assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import request from "supertest";
import { assertTestDatabase, prisma, resetDatabase } from "./test-utils/db";
import type { FeexpayInitRequest, FeexpayInitResult, FeexpayStatusPayload } from "./payments/feexpay/feexpay.types";
import { FeexpayGateway } from "./payments/psp/feexpay.gateway";
import { parseStrictProviderAmount } from "./payments/psp/parse-provider-amount";
import type { PspCredentials, PspStatusResult } from "./payments/psp/psp.types";
import { AuthService } from "./auth/auth.service";
import { UserRole } from "@prisma/client";
import { ZodExceptionFilter } from "./common/zod-exception.filter";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { ObservabilityService } from "./observability/observability.service";

/**
 * In-memory Feexpay client for the full-stack integration test (ADR-017).
 * Lets the test script the verify-by-pull response per reference, so the
 * webhook handler does not need a real network call.
 */
class IntegrationFakeFeexpay {
  scripted = new Map<string, FeexpayStatusPayload>();
  async initRequestToPay(req: FeexpayInitRequest): Promise<FeexpayInitResult> {
    return { reference: `fp_${Math.random().toString(36).slice(2)}`, status: "PENDING", amount: req.amountCfa };
  }
  async fetchStatus(reference: string): Promise<FeexpayStatusPayload> {
    return (
      this.scripted.get(reference) ?? { status: "PENDING", amount: 0, currency: "XOF" }
    );
  }
}

class IntegrationFakeFeexpayGateway extends FeexpayGateway {
  constructor(private readonly fake: IntegrationFakeFeexpay) {
    super();
  }

  async fetchPayinStatus(reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    const payload = await this.fake.fetchStatus(reference);
    const status =
      payload.status === "SUCCESSFUL"
        ? ("SUCCEEDED" as const)
        : payload.status === "FAILED"
          ? ("FAILED" as const)
          : ("PENDING" as const);
    return {
      status,
      amountCfa: parseStrictProviderAmount(payload.amount) ?? 0,
      providerAmount: payload.amount,
      currency: payload.currency ?? "XOF",
      reason: payload.reason
    };
  }
}

// Real-database integration test — NO mock Prisma client. Every request hits
// the real NestJS app wired to the real PostgreSQL test database, so we
// exercise actual constraints, cascades, tenant scoping and error paths.
before(async () => {
  assertTestDatabase();
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

test("API integration flow: auth, events, votes, payments", async (t: TestContext) => {
  const fakeFeexpay = new IntegrationFakeFeexpay();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(FeexpayGateway)
    .useValue(new IntegrationFakeFeexpayGateway(fakeFeexpay))
    .compile();

  // rawBody: true is kept for parity with main.ts (other consumers depend on
  // it); we no longer use it for HMAC since Feexpay does not sign webhooks
  // (ADR-017).
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new ZodExceptionFilter()
  );
  await app.init();
  t.after(async () => {
    await app.close();
  });

  const registerResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      tenantSlug: "demo-vote",
      tenantDisplayName: "Demo Vote",
      email: "owner@demovote.africa",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });

  assert.equal(registerResponse.status, 201);
  assert.equal(typeof registerResponse.body.accessToken, "string");
  assert.equal(registerResponse.body.refreshToken, undefined);
  assert.ok(registerResponse.body.accessToken.length > 20);
  let accessToken = registerResponse.body.accessToken as string;
  let cookies = registerResponse.headers["set-cookie"];
  let authHeader = `Bearer ${accessToken}`;
  const meResponse = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set("Authorization", authHeader);
  assert.equal(meResponse.status, 200);
  const tenantId = meResponse.body.tenantId as string;
  const ownerUserId = meResponse.body.userId as string;
  assert.ok(tenantId.length > 5);

  // The admin surface (/admin/*) is now restricted to platform operators
  // (RBAC hardening). Mint a PLATFORM_ADMIN access token for the existing user
  // to exercise those routes — the role is carried by the JWT, and the user
  // row already exists and is not suspended.
  const authService = app.get(AuthService);
  const platformAdminToken = await authService.issueAccessToken({
    userId: ownerUserId,
    tenantId,
    role: UserRole.PLATFORM_ADMIN,
    email: "owner@demovote.africa"
  });
  const platformAdminHeader = `Bearer ${platformAdminToken}`;

  // SECURITY: re-registering on an existing tenant slug must be rejected (409),
  // never silently attach a new ORGANIZER_OWNER to someone else's tenant.
  const duplicateSlugRegister = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      tenantSlug: "demo-vote",
      tenantDisplayName: "Impersonator",
      email: "attacker@evil.africa",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });
  assert.equal(duplicateSlugRegister.status, 409);

  const refreshResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/refresh")
    .set("Cookie", typeof cookies === "string" ? [cookies] : (cookies ?? []))
    .send({});
  assert.equal(refreshResponse.status, 201);
  assert.equal(typeof refreshResponse.body.accessToken, "string");
  assert.equal(refreshResponse.body.refreshToken, undefined);
  accessToken = refreshResponse.body.accessToken as string;
  cookies = refreshResponse.headers["set-cookie"];
  authHeader = `Bearer ${accessToken}`;

  const upsertSecretResponse = await request(app.getHttpServer())
    .post("/api/v1/organizer/secrets")
    .set("Authorization", authHeader)
    .send({ key: "feexpay_api_secret", value: "my-super-sensitive-secret" });
  assert.equal(upsertSecretResponse.status, 201);
  assert.equal(upsertSecretResponse.body.key, "feexpay_api_secret");

  const getSecretResponse = await request(app.getHttpServer())
    .get("/api/v1/organizer/secrets/feexpay_api_secret")
    .set("Authorization", authHeader);
  assert.equal(getSecretResponse.status, 200);
  assert.equal(getSecretResponse.body.value, "my-super-sensitive-secret");

  const now = new Date();
  const eventStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const eventEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const createEventResponse = await request(app.getHttpServer())
    .post("/api/v1/events")
    .set("Authorization", authHeader)
    .send({
      slug: "finale-2026",
      title: "Finale VotezPro 2026",
      startsAt: eventStartsAt,
      endsAt: eventEndsAt,
      tagline: "Votez pour votre finaliste préféré",
      brandColor: "#1d4ed8",
      voteUnitPriceCfa: 500
    });

  assert.equal(createEventResponse.status, 201);
  const eventId = createEventResponse.body.id as string;
  assert.ok(eventId.length > 10);

  // ADR-016: event is the public platform unit, resolved by its global slug.
  // Branding inherits from the organizer when the event leaves a field null.
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { logoUrl: "https://cdn.votezpro.africa/campus-africa.png" }
  });
  const publicEventResponse = await request(app.getHttpServer()).get(
    "/api/v1/votes/public/event/finale-2026"
  );
  assert.equal(publicEventResponse.status, 200);
  assert.equal(publicEventResponse.body.organizer.displayName, "Demo Vote");
  assert.equal(publicEventResponse.body.event.branding.brandColor, "#1d4ed8"); // event override
  assert.equal(
    publicEventResponse.body.event.branding.logoUrl,
    "https://cdn.votezpro.africa/campus-africa.png"
  ); // inherited from organizer
  assert.equal(publicEventResponse.body.event.voteUnitPriceCfa, 500);

  const listEventsResponse = await request(app.getHttpServer())
    .get("/api/v1/events")
    .set("Authorization", authHeader);
  assert.equal(listEventsResponse.status, 200);
  assert.equal(listEventsResponse.body.length, 1);

  // Activate the event before voting (events start as DRAFT)
  const activateEventResponse = await request(app.getHttpServer())
    .patch(`/api/v1/events/${eventId}`)
    .set("Authorization", authHeader)
    .send({ status: "ACTIVE" });
  assert.equal(activateEventResponse.status, 200);
  assert.equal(activateEventResponse.body.status, "ACTIVE");

  const createCandidateResponse = await request(app.getHttpServer())
    .post(`/api/v1/events/${eventId}/candidates`)
    .set("Authorization", authHeader)
    .send({
      fullName: "Arielle Dossou",
      number: 7,
      photoUrl: "https://img.test/arielle.jpg"
    });

  assert.equal(createCandidateResponse.status, 201);
  assert.equal(createCandidateResponse.body.number, 7);

  // Phase 2 — endpoint de signature d'upload : gardé par auth, 503 si Cloudinary
  // non configuré (cas par défaut en test → prouve le wiring + le guard).
  const unauthSign = await request(app.getHttpServer()).post("/api/v1/uploads/signature");
  assert.equal(unauthSign.status, 401);
  const authedSign = await request(app.getHttpServer())
    .post("/api/v1/uploads/signature")
    .set("Authorization", authHeader);
  assert.equal(authedSign.status, 503);

  // The voter journey no longer carries a privacy consent step — a vote can be
  // cast directly (privacy acceptance now happens at organizer onboarding).
  const castVoteResponse = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({
      tenantSlug: "demo-vote",
      eventSlug: "finale-2026",
      candidateNumber: 7,
      quantity: 1,
      voterPhone: "22999001122"
    });

  assert.equal(castVoteResponse.status, 201);
  assert.equal(castVoteResponse.body.amountCfa, 500);

  // Per-event vote price rule: a mismatched amount (e.g. missing quantity) is rejected (400).
  const wrongAmountVote = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({
      tenantSlug: "demo-vote",
      eventSlug: "finale-2026",
      candidateNumber: 7,
      voterPhone: "22999003344"
    });
  assert.equal(wrongAmountVote.status, 400);

  const initPaymentResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/init")
    .set("Authorization", authHeader)
    .send({
      tenantId,
      eventId: eventId,
      amountCfa: 1000,
      idempotencyKey: "idem-key-1234567890",
      requestFingerprint: "fingerprint-001"
    });

  assert.equal(initPaymentResponse.status, 201);
  assert.equal(initPaymentResponse.body.status, "PENDING");
  const transactionId = initPaymentResponse.body.transactionId as string;

  // --- Tenant isolation: a second tenant must NOT be able to initiate a
  // payment scoped to the first tenant (cross-tenant write / IDOR). ---
  const attackerRegister = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      tenantSlug: "rival-vote",
      tenantDisplayName: "Rival Vote",
      email: "owner@rivalvote.africa",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });
  assert.equal(attackerRegister.status, 201);
  const attackerAuthHeader = `Bearer ${attackerRegister.body.accessToken as string}`;
  const attackerMe = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set("Authorization", attackerAuthHeader);
  assert.equal(attackerMe.status, 200);
  const attackerTenantId = attackerMe.body.tenantId as string;
  assert.notEqual(attackerTenantId, tenantId);

  // ADR-016: event slugs are GLOBALLY unique — another organizer cannot reuse
  // an existing event slug (409).
  const duplicateEventSlug = await request(app.getHttpServer())
    .post("/api/v1/events")
    .set("Authorization", attackerAuthHeader)
    .send({
      slug: "finale-2026",
      title: "Copie illégitime",
      startsAt: eventStartsAt,
      endsAt: eventEndsAt
    });
  assert.equal(duplicateEventSlug.status, 409);

  // Forging the victim tenantId in the body must be rejected (403).
  const crossTenantByTenantId = await request(app.getHttpServer())
    .post("/api/v1/payments/init")
    .set("Authorization", attackerAuthHeader)
    .send({
      tenantId,
      eventId,
      amountCfa: 1000,
      idempotencyKey: "idem-key-attacker-tenant-0001",
      requestFingerprint: "fingerprint-attacker-001"
    });
  assert.equal(crossTenantByTenantId.status, 403);

  // Pairing own tenantId with the victim's eventId must not resolve (404).
  const crossTenantByEventId = await request(app.getHttpServer())
    .post("/api/v1/payments/init")
    .set("Authorization", attackerAuthHeader)
    .send({
      tenantId: attackerTenantId,
      eventId,
      amountCfa: 1000,
      idempotencyKey: "idem-key-attacker-event-0001",
      requestFingerprint: "fingerprint-attacker-002"
    });
  assert.equal(crossTenantByEventId.status, 404);

  const idempotentPaymentResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/init")
    .set("Authorization", authHeader)
    .send({
      tenantId,
      eventId: eventId,
      amountCfa: 1000,
      idempotencyKey: "idem-key-1234567890",
      requestFingerprint: "fingerprint-001"
    });

  assert.equal(idempotentPaymentResponse.status, 201);
  assert.equal(idempotentPaymentResponse.body.transactionId, transactionId);

  const conflictedPaymentResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/init")
    .set("Authorization", authHeader)
    .send({
      tenantId,
      eventId: eventId,
      amountCfa: 1500,
      idempotencyKey: "idem-key-1234567890",
      requestFingerprint: "fingerprint-002"
    });
  assert.equal(conflictedPaymentResponse.status, 409);

  // ADR-017: a webhook for an UNKNOWN reference is acknowledged with 200/201
  // (Feexpay must not keep retrying) but produces no DB mutation. The
  // verify-by-pull pipeline returns `outcome: rejected, reason:
  // unknown_reference`.
  const processPaymentResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/webhooks/feexpay")
    .send({ reference: "fp_unknown_xxx" });
  assert.equal(processPaymentResponse.status, 201);
  assert.equal(processPaymentResponse.body.outcome, "rejected");
  assert.equal(processPaymentResponse.body.reason, "unknown_reference");
  // ... and no PaymentTransaction was flipped:
  const stillPending = await prisma.paymentTransaction.findUnique({
    where: { idempotencyKey: "idem-key-1234567890" }
  });
  assert.equal(stillPending?.status, "PENDING");

  // Platform commission (10% = 1000 bps) is captured at payment confirmation.
  await prisma.platformSetting.create({
    data: { key: "commission_bps", value: "1000", updatedByUserId: "system" }
  });

  // ADR-017 happy path: bind a Feexpay reference to the transaction, script
  // a SUCCESSFUL pull at the exact amount, then trigger the webhook. The
  // pipeline flips the tx to SUCCEEDED and captures the commission.
  await prisma.paymentTransaction.update({
    where: { idempotencyKey: "idem-key-1234567890" },
    data: { providerRef: "fp_123" }
  });
  fakeFeexpay.scripted.set("fp_123", {
    status: "SUCCESSFUL",
    amount: "1000",
    currency: "XOF"
  });
  const processPaymentSuccessResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/webhooks/feexpay")
    .send({ reference: "fp_123" });
  assert.equal(processPaymentSuccessResponse.status, 201);
  assert.equal(processPaymentSuccessResponse.body.outcome, "applied");

  // Commission captured: 10% of 1000 FCFA = 100.
  const settledTx = await prisma.paymentTransaction.findUnique({
    where: { idempotencyKey: "idem-key-1234567890" }
  });
  assert.equal(settledTx?.commissionCfa, 100);

  // RBAC hardening: an organizer must NOT reach the admin surface anymore.
  const organizerAuditLogsForbidden = await request(app.getHttpServer())
    .get("/api/v1/admin/audit-logs?limit=20")
    .set("Authorization", authHeader);
  assert.equal(organizerAuditLogsForbidden.status, 403);

  const listAuditLogsResponse = await request(app.getHttpServer())
    .get(`/api/v1/admin/audit-logs?limit=20&tenantId=${tenantId}`)
    .set("Authorization", platformAdminHeader);
  assert.equal(listAuditLogsResponse.status, 200);
  assert.ok(Array.isArray(listAuditLogsResponse.body.items));
  assert.ok(listAuditLogsResponse.body.items.length >= 4);
  assert.equal(listAuditLogsResponse.body.items[0].tenantId, tenantId);

  const invalidFeatureFlagResponse = await request(app.getHttpServer())
    .post("/api/v1/admin/feature-flags")
    .set("Authorization", platformAdminHeader)
    .send({
      key: "!!",
      enabled: true,
      rolloutPercent: 100
    });
  assert.equal(invalidFeatureFlagResponse.status, 400);

  const unauthorizedJobsResponse = await request(app.getHttpServer()).get("/api/v1/admin/jobs/overview");
  assert.equal(unauthorizedJobsResponse.status, 401);

  const invalidSubscriptionsQueryResponse = await request(app.getHttpServer())
    .get("/api/v1/admin/subscriptions/overview?from=invalid-date")
    .set("Authorization", platformAdminHeader);
  assert.equal(invalidSubscriptionsQueryResponse.status, 400);

  const privacyExportResponse = await request(app.getHttpServer())
    .get("/api/v1/privacy/export")
    .set("Authorization", authHeader);
  assert.equal(privacyExportResponse.status, 200);
  assert.equal(
    (privacyExportResponse.headers["content-type"] as string).includes("application/zip"),
    true
  );

  const privacyDeleteResponse = await request(app.getHttpServer())
    .delete("/api/v1/privacy/delete")
    .set("Authorization", authHeader);
  assert.equal(privacyDeleteResponse.status, 200);
  assert.equal(privacyDeleteResponse.body.success, true);

  const maintenanceCronPayload = {
    auditLogsRetentionDays: 7,
    idempotencyRetentionDays: 1,
    revokedSessionsRetentionDays: 1,
    tenantSlug: "demo-vote"
  };
  const maintenanceCronSignature = createHmac(
    "sha256",
    "dev-only-maintenance-cron-secret-change-me-32chars"
  )
    .update(JSON.stringify(maintenanceCronPayload))
    .digest("hex");

  const maintenanceCronResponse1 = await request(app.getHttpServer())
    .post("/api/v1/maintenance/cron/purge")
    .set("x-maintenance-cron-signature", maintenanceCronSignature)
    .send(maintenanceCronPayload);
  assert.equal(maintenanceCronResponse1.status, 201);
  assert.equal(maintenanceCronResponse1.body.alreadyExecuted, false);

  const maintenanceCronResponse2 = await request(app.getHttpServer())
    .post("/api/v1/maintenance/cron/purge")
    .set("x-maintenance-cron-signature", maintenanceCronSignature)
    .send(maintenanceCronPayload);
  assert.equal(maintenanceCronResponse2.status, 201);
  assert.equal(maintenanceCronResponse2.body.alreadyExecuted, true);

  // --- ops/metrics: token gate (constant-time comparison) ---
  const opsNoToken = await request(app.getHttpServer()).get("/api/v1/ops/metrics");
  assert.equal(opsNoToken.status, 403);

  const opsWrongToken = await request(app.getHttpServer())
    .get("/api/v1/ops/metrics")
    .set("x-ops-token", "wrong-token");
  assert.equal(opsWrongToken.status, 403);

  const opsValidToken = await request(app.getHttpServer())
    .get("/api/v1/ops/metrics")
    .set("x-ops-token", "dev-only-ops-token-change-me-32chars");
  assert.equal(opsValidToken.status, 200);

  // God-mode control space is PLATFORM_ADMIN only: an organizer is forbidden.
  const ownerPlatformOverview = await request(app.getHttpServer())
    .get("/api/v1/admin/platform/overview")
    .set("Authorization", authHeader);
  assert.equal(ownerPlatformOverview.status, 403);

  const logoutResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/logout")
    .set("Cookie", typeof cookies === "string" ? [cookies] : (cookies ?? []))
    .send({});
  assert.equal(logoutResponse.status, 201);
  assert.equal(logoutResponse.body.success, true);
});
