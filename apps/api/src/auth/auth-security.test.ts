import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hash } from "bcryptjs";
import { AuthOtpPurpose, UserRole } from "@prisma/client";
import { AccountService } from "../account/account.service";
import { AdminService } from "../admin/admin.service";
import { AuthService } from "./auth.service";

type MutableUser = {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  passwordHash: string | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  emailVerifiedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

function authServiceWithUser(user: MutableUser) {
  const prisma = {
    client: {
      user: {
        findUnique: async () => user,
        update: async () => user
      },
      platformSetting: { findUnique: async () => null },
      authOtpChallenge: {
        updateMany: async () => ({ count: 0 }),
        create: async () => ({ id: "otp-1" })
      },
      authSession: {
        create: async () => ({ id: "session-1" }),
        updateMany: async () => ({ count: 0 })
      },
      auditLog: { create: async () => ({ id: "audit-1" }) }
    }
  };
  const mail = { send: async () => false };
  const notifications = {};
  const service = new AuthService(
    prisma as never,
    notifications as never,
    mail as never
  );
  return { service, prisma };
}

test("un échec e-mail ne doit jamais exposer ni logger l'OTP hors développement", async () => {
  const user: MutableUser = {
    id: "user-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    role: UserRole.ORGANIZER_OWNER,
    passwordHash: null,
    suspendedAt: null,
    suspendedReason: null,
    emailVerifiedAt: null,
    firstName: null,
    lastName: null,
    photoUrl: null
  };
  const { service } = authServiceWithUser(user);
  const warnings: string[] = [];
  (service as unknown as { logger: { warn: (message: string) => void } }).logger = {
    warn: (message) => warnings.push(message)
  };

  const result = await (
    service as unknown as {
      createAndSendOtp: (
        userId: string,
        email: string,
        purpose: AuthOtpPurpose
      ) => Promise<{ code: string; exposeInResponse: boolean }>;
    }
  ).createAndSendOtp(user.id, user.email, AuthOtpPurpose.PASSWORD_RESET);

  assert.equal(result.exposeInResponse, false);
  assert.equal(warnings.some((message) => message.includes(result.code)), false);
});

test("l'OTP est stocké avec un pepper serveur, pas avec un SHA-256 devinable", async () => {
  let createdChallenge: { codeHash: string } | null = null;
  const prisma = {
    client: {
      platformSetting: { findUnique: async () => null },
      authOtpChallenge: {
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }: { data: { codeHash: string } }) => {
          createdChallenge = data;
          return { id: "otp-1", ...data };
        }
      }
    }
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    { send: async () => true } as never
  );
  const result = await (
    service as unknown as {
      createAndSendOtp: (
        userId: string,
        email: string,
        purpose: AuthOtpPurpose
      ) => Promise<{ code: string }>;
    }
  ).createAndSendOtp(
    "user-1",
    "owner@example.com",
    AuthOtpPurpose.EMAIL_VERIFICATION
  );

  const storedHash = (createdChallenge as { codeHash: string } | null)?.codeHash;
  assert.ok(storedHash);
  assert.notEqual(
    storedHash,
    createHash("sha256").update(result.code).digest("hex")
  );
});

test("un OTP consommé ne peut pas être rejoué pendant une fenêtre de grâce", async () => {
  let challenge: {
    id: string;
    codeHash: string;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null = null;
  const prisma = {
    client: {
      platformSetting: { findUnique: async () => null },
      authOtpChallenge: {
        updateMany: async () => ({ count: 0 }),
        create: async ({
          data
        }: {
          data: { codeHash: string; expiresAt: Date; maxAttempts: number };
        }) => {
          challenge = {
            id: "otp-1",
            codeHash: data.codeHash,
            attempts: 0,
            maxAttempts: data.maxAttempts,
            expiresAt: data.expiresAt,
            consumedAt: null
          };
          return challenge;
        },
        findFirst: async ({
          where
        }: {
          where: { consumedAt: null | Record<string, unknown> };
        }) => {
          if (!challenge) return null;
          if (where.consumedAt === null) {
            return challenge.consumedAt ? null : challenge;
          }
          return challenge.consumedAt ? challenge : null;
        },
        update: async ({
          data
        }: {
          data: { consumedAt?: Date; attempts?: { increment: number } };
        }) => {
          if (!challenge) throw new Error("Challenge absent");
          if (data.consumedAt) challenge.consumedAt = data.consumedAt;
          if (data.attempts) challenge.attempts += data.attempts.increment;
          return challenge;
        }
      }
    }
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    { send: async () => true } as never
  );
  const created = await (
    service as unknown as {
      createAndSendOtp: (
        userId: string,
        email: string,
        purpose: AuthOtpPurpose
      ) => Promise<{ code: string }>;
    }
  ).createAndSendOtp(
    "user-1",
    "owner@example.com",
    AuthOtpPurpose.PASSWORD_RESET
  );
  const verify = (
    service as unknown as {
      verifyAndConsumeOtpChallenge: (
        userId: string,
        code: string,
        purpose: AuthOtpPurpose,
        options?: { allowRecentlyConsumed?: boolean }
      ) => Promise<void>;
    }
  ).verifyAndConsumeOtpChallenge.bind(service);

  await verify(
    "user-1",
    created.code,
    AuthOtpPurpose.PASSWORD_RESET,
    { allowRecentlyConsumed: true }
  );
  await assert.rejects(
    verify(
      "user-1",
      created.code,
      AuthOtpPurpose.PASSWORD_RESET,
      { allowRecentlyConsumed: true }
    ),
    /invalide|expiré/i
  );
});

test("verifyAccessToken recharge immédiatement rôle, tenant et e-mail depuis la base", async () => {
  const user: MutableUser = {
    id: "user-1",
    tenantId: "tenant-new",
    email: "new@example.com",
    role: UserRole.ORGANIZER_STAFF,
    passwordHash: null,
    suspendedAt: null,
    suspendedReason: null,
    emailVerifiedAt: new Date(),
    firstName: "Awa",
    lastName: "K.",
    photoUrl: null
  };
  const { service } = authServiceWithUser(user);
  const token = await service.issueAccessToken({
    userId: user.id,
    tenantId: "tenant-old",
    email: "old@example.com",
    role: UserRole.PLATFORM_ADMIN
  });

  const verified = await service.verifyAccessToken(token);

  assert.equal(verified.tenantId, user.tenantId);
  assert.equal(verified.email, user.email);
  assert.equal(verified.role, user.role);
});

test("verifyAccessToken refuse immédiatement un e-mail non vérifié", async () => {
  const user: MutableUser = {
    id: "user-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    role: UserRole.ORGANIZER_OWNER,
    passwordHash: null,
    suspendedAt: null,
    suspendedReason: null,
    emailVerifiedAt: null,
    firstName: null,
    lastName: null,
    photoUrl: null
  };
  const { service } = authServiceWithUser(user);
  const token = await service.issueAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role
  });

  await assert.rejects(service.verifyAccessToken(token), /e-mail|vérifi/i);
});

test("changePassword applique la même politique forte que l'inscription", async () => {
  const user: MutableUser = {
    id: "user-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    role: UserRole.ORGANIZER_OWNER,
    passwordHash: await hash("CurrentPass123!", 4),
    suspendedAt: null,
    suspendedReason: null,
    emailVerifiedAt: new Date(),
    firstName: null,
    lastName: null,
    photoUrl: null
  };
  const { service, prisma } = authServiceWithUser(user);
  const account = new AccountService(prisma as never, service);

  await assert.rejects(
    account.changePassword(
      {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role
      },
      { currentPassword: "CurrentPass123!", newPassword: "abcdefgh" },
      "r".repeat(64)
    ),
    /10 caract|deux types|caract/i
  );
});

test("changeEmail invalide toutes les sessions et exige la vérification du nouvel e-mail", async () => {
  const currentPassword = "CurrentPass123!";
  const user: MutableUser = {
    id: "user-1",
    tenantId: "tenant-1",
    email: "old@example.com",
    role: UserRole.ORGANIZER_OWNER,
    passwordHash: await hash(currentPassword, 4),
    suspendedAt: null,
    suspendedReason: null,
    emailVerifiedAt: new Date(),
    firstName: null,
    lastName: null,
    photoUrl: null
  };
  const updates: Array<Record<string, unknown>> = [];
  const sessionRevocations: Array<Record<string, unknown>> = [];
  const otpRequests: Array<{ userId: string; email: string }> = [];
  const prisma = {
    client: {
      user: {
        findUnique: async (args: { where: Record<string, unknown> }) =>
          "id" in args.where ? user : null,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...user, ...data };
        }
      },
      authSession: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => {
          sessionRevocations.push(where);
          return { count: 2 };
        }
      },
      auditLog: { create: async () => ({ id: "audit-1" }) }
    }
  };
  const auth = {
    hashRefreshToken: () => "current-hash",
    issueAccessToken: async () => "obsolete-access-token",
    sendEmailVerificationOtp: async (userId: string, email: string) => {
      otpRequests.push({ userId, email });
      return { sent: true };
    }
  };
  const account = new AccountService(prisma as never, auth as never);

  const result = await account.changeEmail(
    {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role
    },
    { newEmail: "new@example.com", currentPassword },
    "r".repeat(64)
  );

  assert.deepEqual(updates[0], {
    email: "new@example.com",
    emailVerifiedAt: null
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(sessionRevocations[0] ?? {}, "refreshTokenHash"),
    false
  );
  assert.deepEqual(otpRequests, [
    { userId: user.id, email: "new@example.com" }
  ]);
  assert.deepEqual(result, {
    requiresEmailVerification: true,
    email: "new@example.com"
  });
});

test("un admin standard ne peut pas attribuer un rôle plateforme", async () => {
  const target = {
    id: "target-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    role: UserRole.ORGANIZER_OWNER,
    suspendedAt: null,
    suspendedReason: null,
    updatedAt: new Date()
  };
  const prisma = {
    client: {
      user: {
        findUnique: async () => target,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...target,
          ...data
        })
      },
      auditLog: { create: async () => ({ id: "audit-1" }) },
      authSession: { updateMany: async () => ({ count: 0 }) }
    }
  };
  const admin = new AdminService(prisma as never, {} as never);

  await assert.rejects(
    admin.updateUser(
      {
        userId: "admin-1",
        tenantId: "platform",
        email: "admin@example.com",
        role: UserRole.PLATFORM_ADMIN
      },
      target.id,
      { role: UserRole.PLATFORM_ADMIN }
    ),
    /super-admin/i
  );
});
