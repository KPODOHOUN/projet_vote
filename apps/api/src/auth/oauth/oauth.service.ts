import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { SignJWT } from "jose";
import { env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import type { FacebookUserInfo, GoogleUserInfo, OAuthProvider, ProviderConfig } from "./oauth.types";

type SessionMeta = { userAgent?: string | null; ipAddress?: string | null };

type AuthUser = {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
};

const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scope: "openid email profile",
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
  },
  facebook: {
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/v19.0/me?fields=id,name,email,picture",
    scope: "email,public_profile",
    clientId: env.FACEBOOK_CLIENT_ID,
    clientSecret: env.FACEBOOK_CLIENT_SECRET,
    callbackUrl: env.FACEBOOK_CALLBACK_URL,
  },
};

const JWT_ISSUER = "shadowa-votes";
const JWT_AUDIENCE = "shadowa-votes-api";

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  getProviderConfig(provider: string): ProviderConfig {
    const config = OAUTH_PROVIDERS[provider as OAuthProvider];
    if (!config) {
      throw new UnauthorizedException(`Fournisseur OAuth non supporté: ${provider}`);
    }
    if (!config.clientId || !config.clientSecret) {
      throw new UnauthorizedException(
        `OAuth ${provider} n'est pas configuré. Vérifiez les variables d'environnement.`
      );
    }
    return config;
  }

  getAuthorizationUrl(provider: string): { url: string; state: string } {
    const config = this.getProviderConfig(provider);
    const state = randomBytes(32).toString("hex");
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: "code",
      scope: config.scope,
      state,
      ...(provider === "google" ? { access_type: "offline", prompt: "consent" } : {}),
    });
    return { url: `${config.authorizeUrl}?${params.toString()}`, state };
  }

  async handleCallback(
    provider: string,
    code: string,
    state: string,
    stateFromCookie: string | undefined,
    meta: SessionMeta
  ) {
    if (!stateFromCookie || state !== stateFromCookie) {
      throw new UnauthorizedException("État de sécurité OAuth invalide. Veuillez réessayer.");
    }

    const config = this.getProviderConfig(provider);

    const tokenData = await this.exchangeCode(config, code);

    const userInfo = await this.fetchUserInfo(provider, config, tokenData.access_token);

    const { user, isNew } = await this.findOrCreateUser(provider, userInfo);

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as UserRole,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
    };

    const accessToken = await this.signAccessToken(authUser);
    const { refreshToken } = await this.createSession(authUser, meta);

    this.logger.log(`OAuth ${provider} login: userId=${user.id} isNew=${isNew}`);

    return { accessToken, refreshToken };
  }

  private async signAccessToken(user: AuthUser): Promise<string> {
    const secret = new TextEncoder().encode(env.API_JWT_SECRET);
    return new SignJWT({
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      photoUrl: user.photoUrl ?? null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${env.API_JWT_EXPIRES_IN_SECONDS}s`)
      .sign(secret);
  }

  private async exchangeCode(config: ProviderConfig, code: string): Promise<{ access_token: string }> {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`OAuth token exchange failed: ${response.status} ${text}`);
      throw new UnauthorizedException("L'échange du code OAuth a échoué.");
    }

    const data = (await response.json()) as { access_token: string };
    return data;
  }

  private async fetchUserInfo(
    provider: string,
    config: ProviderConfig,
    accessToken: string
  ): Promise<{ id: string; email: string; firstName: string; lastName: string; displayName: string; photoUrl: string }> {
    const response = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`OAuth userinfo failed: ${response.status} ${text}`);
      throw new UnauthorizedException("Récupération des informations utilisateur OAuth a échoué.");
    }

    if (provider === "google") {
      const data = (await response.json()) as GoogleUserInfo;
      return {
        id: data.id,
        email: data.email ?? "",
        firstName: data.given_name ?? "",
        lastName: data.family_name ?? "",
        displayName: data.name ?? data.email?.split("@")[0] ?? "",
        photoUrl: data.picture ?? "",
      };
    }

    if (provider === "facebook") {
      const data = (await response.json()) as FacebookUserInfo;
      return {
        id: data.id,
        email: data.email ?? "",
        firstName: data.name?.split(" ").slice(0, -1).join(" ") ?? "",
        lastName: data.name?.split(" ").pop() ?? "",
        displayName: data.name ?? data.email?.split("@")[0] ?? "",
        photoUrl: data.picture?.data?.url ?? "",
      };
    }

    throw new UnauthorizedException(`Fournisseur OAuth non supporté: ${provider}`);
  }

  private async findOrCreateUser(
    provider: string,
    userInfo: { id: string; email: string; firstName: string; lastName: string; displayName: string; photoUrl: string }
  ) {
    const normalizedEmail = userInfo.email.toLowerCase();

    const existingAccount = await this.prisma.client.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: userInfo.id } },
      include: { user: true },
    });

    if (existingAccount) {
      if (userInfo.photoUrl && existingAccount.photoUrl !== userInfo.photoUrl) {
        await this.prisma.client.oAuthAccount.update({
          where: { id: existingAccount.id },
          data: { photoUrl: userInfo.photoUrl, displayName: userInfo.displayName, email: normalizedEmail },
        });
      }
      return { user: existingAccount.user, isNew: false };
    }

    if (normalizedEmail) {
      const existingUserByEmail = await this.prisma.client.user.findFirst({
        where: { email: normalizedEmail },
      });

      if (existingUserByEmail) {
        await this.prisma.client.oAuthAccount.create({
          data: {
            userId: existingUserByEmail.id,
            provider,
            providerAccountId: userInfo.id,
            email: normalizedEmail,
            displayName: userInfo.displayName,
            photoUrl: userInfo.photoUrl,
          },
        });

        await this.prisma.client.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            firstName: existingUserByEmail.firstName ?? (userInfo.firstName || null),
            lastName: existingUserByEmail.lastName ?? (userInfo.lastName || null),
            photoUrl: existingUserByEmail.photoUrl ?? (userInfo.photoUrl || null),
          },
        });

        return { user: existingUserByEmail, isNew: false };
      }
    }

    const slugBase = userInfo.displayName
      ? userInfo.displayName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : `user-${userInfo.id.substring(0, 8)}`;
    const displayName = userInfo.displayName || userInfo.email?.split("@")[0] || "Mon Organisation";
    const uniqueSlug = await this.generateUniqueSlug(slugBase || "org");

    const tenant = await this.prisma.client.tenant.create({
      data: { slug: uniqueSlug, displayName },
    });

    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        firstName: userInfo.firstName || null,
        lastName: userInfo.lastName || null,
        photoUrl: userInfo.photoUrl || null,
        role: UserRole.ORGANIZER_OWNER,
        emailVerifiedAt: new Date(),
      },
    });

    await this.prisma.client.oAuthAccount.create({
      data: {
        userId: user.id,
        provider,
        providerAccountId: userInfo.id,
        email: normalizedEmail,
        displayName: userInfo.displayName,
        photoUrl: userInfo.photoUrl,
      },
    });

    return { user, isNew: true };
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const slug = base || "org";
    const existing = await this.prisma.client.tenant.findUnique({ where: { slug } });
    if (!existing) return slug;
    for (let i = 1; i < 100; i++) {
      const candidate = `${slug}-${i}`;
      const exists = await this.prisma.client.tenant.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    const suffix = randomBytes(4).toString("hex");
    return `${slug}-${suffix}`;
  }

  private async createSession(user: AuthUser, meta?: SessionMeta) {
    const refreshToken = randomBytes(48).toString("hex");
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");
    await this.prisma.client.authSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + env.API_REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000),
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
      },
    });
    return { refreshToken };
  }
}
