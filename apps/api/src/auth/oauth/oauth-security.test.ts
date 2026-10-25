import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";

process.env.GOOGLE_CLIENT_ID = "google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/oauth/callback/google";

// The test suite preloads config/env.js (--require, see apps/api/package.json)
// so every OTHER test sees deterministic env.* values regardless of import
// order — but that means config/env.js (and oauth.service.js's OAUTH_PROVIDERS,
// which captures env.GOOGLE_CLIENT_ID/SECRET at its own module scope) is
// already cached with the *real* .env values by the time this file runs,
// before the fake credentials above ever get a chance to apply. Busting both
// cache entries forces a fresh re-evaluation that picks up the fake values
// set just above, for every dynamic `await import("./oauth.service")` below.
delete require.cache[require.resolve("../../config/env")];
delete require.cache[require.resolve("./oauth.service")];

type FakeUser = {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
};

function fakePrisma(options?: { existingOAuthUser?: FakeUser }) {
  const createdUsers: Array<Record<string, unknown>> = [];
  const prisma = {
    client: {
      oAuthAccount: {
        findUnique: async () =>
          options?.existingOAuthUser
            ? {
                id: "oauth-1",
                photoUrl: null,
                user: options.existingOAuthUser
              }
            : null,
        update: async () => ({ id: "oauth-1" }),
        create: async () => ({ id: "oauth-new" })
      },
      user: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdUsers.push(data);
          return {
            id: "user-new",
            tenantId: String(data.tenantId),
            email: String(data.email),
            role: data.role as UserRole,
            firstName: (data.firstName as string | null) ?? null,
            lastName: (data.lastName as string | null) ?? null,
            photoUrl: (data.photoUrl as string | null) ?? null,
            passwordHash: null,
            emailVerifiedAt: data.emailVerifiedAt as Date,
            suspendedAt: null,
            suspendedReason: null
          };
        },
        update: async () => ({ id: "user-updated" })
      },
      tenant: {
        findUnique: async () => null,
        create: async () => ({ id: "tenant-new" })
      },
      organizerWallet: {
        create: async () => ({ id: "wallet-new", tenantId: "tenant-new" })
      },
      authSession: {
        create: async () => ({ id: "session-new" }),
        updateMany: async () => ({ count: 0 })
      }
    }
  };
  return { prisma, createdUsers };
}

function mockGoogle(userInfo: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ access_token: "google-access-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify(userInfo), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("Google OAuth refuse un e-mail non vérifié", async () => {
  const restore = mockGoogle({
    sub: "google-sub-1",
    email: "owner@example.com",
    email_verified: false,
    name: "Owner"
  });
  try {
    const { OAuthService } = await import("./oauth.service");
    const { prisma } = fakePrisma();
    const service = new OAuthService(prisma as never);

    await assert.rejects(
      service.handleCallback("google", "code", "state", "state", {}),
      // Specific to the email-verification rejection, not just /vérifi/i —
      // that alone also matches "Vérifiez les variables d'environnement"
      // (the config-missing error), which let this assertion pass once for
      // entirely the wrong reason. See the require.cache note above.
      /adresse e-mail vérifiée/i
    );
  } finally {
    restore();
  }
});

test("Google OAuth refuse une session pour un compte suspendu", async () => {
  const restore = mockGoogle({
    sub: "google-sub-2",
    email: "owner@example.com",
    email_verified: true,
    name: "Owner"
  });
  try {
    const { OAuthService } = await import("./oauth.service");
    const suspendedUser: FakeUser = {
      id: "user-suspended",
      tenantId: "tenant-1",
      email: "owner@example.com",
      role: UserRole.ORGANIZER_OWNER,
      firstName: null,
      lastName: null,
      photoUrl: null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      suspendedAt: new Date(),
      suspendedReason: "Compte suspendu"
    };
    const { prisma } = fakePrisma({ existingOAuthUser: suspendedUser });
    const service = new OAuthService(prisma as never);

    await assert.rejects(
      service.handleCallback("google", "code", "state", "state", {}),
      /suspendu/i
    );
  } finally {
    restore();
  }
});

test("Google OAuth utilise sub et email_verified pour créer un compte", async () => {
  const restore = mockGoogle({
    sub: "google-sub-3",
    email: "owner@example.com",
    email_verified: true,
    name: "Awa Owner",
    given_name: "Awa",
    family_name: "Owner"
  });
  try {
    const { OAuthService } = await import("./oauth.service");
    const { prisma, createdUsers } = fakePrisma();
    const service = new OAuthService(prisma as never);

    const result = await service.handleCallback(
      "google",
      "code",
      "state",
      "state",
      {}
    );

    assert.equal(typeof result.accessToken, "string");
    assert.equal(createdUsers[0]?.email, "owner@example.com");
    assert.ok(createdUsers[0]?.emailVerifiedAt instanceof Date);
  } finally {
    restore();
  }
});

test("listEnabledProviders n'annonce Google que si l'id ET le secret sont configurés", async () => {
  const { listEnabledProviders } = await import("./oauth.service");

  assert.deepEqual(listEnabledProviders({ google: { clientId: "id", clientSecret: "secret" } }), { google: true });
  assert.deepEqual(listEnabledProviders({ google: { clientId: "", clientSecret: "secret" } }), { google: false });
  assert.deepEqual(listEnabledProviders({ google: { clientId: "id", clientSecret: "" } }), { google: false });
});

test("getEnabledProviders reflète les clés Google de l'environnement", async () => {
  const { OAuthService } = await import("./oauth.service");
  const { prisma } = fakePrisma();
  const service = new OAuthService(prisma as never);

  // Les clés factices posées en tête de fichier sont présentes.
  assert.deepEqual(service.getEnabledProviders(), { google: true });
});
