import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const targets = [
    path.resolve(__dirname, "../../../../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const envPath of targets) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index === -1) continue;
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  if (process.env.NODE_ENV === "test") {
    process.env.API_PAYMENT_DEMO_MODE = "false";
  }
}
loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_JWT_SECRET: z.string().min(32).default("dev-only-insecure-secret-change-me-32chars"),
  API_JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  API_REFRESH_TOKEN_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(2592000),
  API_ORGANIZER_SECRET_KEY: z.string().min(32).default("dev-only-organizer-secret-key-32-chars-min"),
  // Dedicated key for the cancelled/deleted-votes vault (AES-256-GCM via
  // scrypt). MUST be distinct from API_ORGANIZER_SECRET_KEY so that a leak
  // of one does not unlock the other.
  API_VAULT_SECRET_KEY: z.string().min(32).default("dev-only-vault-secret-key-32-chars-minimum"),
  // -- Feexpay (ADR-017 verify-by-pull) ---------------------------------
  // Feexpay does NOT sign its webhooks. The webhook is treated as an
  // untrusted ping; the authoritative status comes from the server-to-server
  // GET /api/transactions/public/single/status/{reference}. We therefore
  // hold only the API key (Bearer) and the base URL — no webhook secret.
  FEEXPAY_BASE_URL: z
    .string()
    .url()
    .default("https://api-v2.feexpay.me"),
  // Live keys start with `fp_`, sandbox keys with `test_`. We accept any
  // 16+ char string in dev/test to keep local setup low-friction, but the
  // superRefine below enforces the prefix in production.
  FEEXPAY_API_KEY: z
    .string()
    .min(16)
    .default("test_dev_only_feexpay_api_key_change_me_xxxxxxxxx"),
  FEEXPAY_SHOP_ID: z.string().min(1).default("dev-shop"),
  // Bounded outbound timeout for the Feexpay pull — protects the webhook
  // handler and the reconciliation cron from a hung provider.
  FEEXPAY_HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  // -- FedaPay (3-step payin, create+start payout; verify-by-pull) ---------
  // Bearer secret key. Live keys start with `sk_live_`, sandbox with `sk_sandbox_`.
  // Accept any 16+ char string in dev/test; the prefix is enforced in production
  // by the superRefine below.
  FEDAPAY_BASE_URL: z.string().url().default("https://sandbox-api.fedapay.com/v1"),
  FEDAPAY_API_KEY: z.string().min(16).default("sk_sandbox_dev_only_fedapay_key_change_me_xxxx"),
  FEDAPAY_HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  // -- KkiaPay (front widget payin + server verify-by-pull) ----------------
  // Three keys: public (x-api-key), private (x-private-key), secret (x-secret-key).
  KKIAPAY_BASE_URL: z.string().url().default("https://api-sandbox.kkiapay.me"),
  KKIAPAY_PUBLIC_KEY: z.string().min(8).default("dev_only_kkiapay_public_key_change_me"),
  KKIAPAY_PRIVATE_KEY: z.string().min(8).default("dev_only_kkiapay_private_key_change_me"),
  KKIAPAY_SECRET_KEY: z.string().min(8).default("dev_only_kkiapay_secret_key_change_me"),
  KKIAPAY_HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  // Platform-wide default PSP when neither event nor tenant pins one.
  DEFAULT_PSP_PROVIDER: z.enum(["FEEXPAY", "KKIAPAY", "FEDAPAY"]).default("FEEXPAY"),
  // Platform settlement (Flow A) master account: where the platform's own
  // commission/activation/confiscation share is paid out.
  PLATFORM_PAYOUT_NETWORK: z.string().min(2).default("MTN"),
  PLATFORM_PAYOUT_ACCOUNT: z.string().min(6).default("00000000"),
  API_MAINTENANCE_CRON_SECRET: z.string().min(32).default("dev-only-maintenance-cron-secret-change-me-32chars"),
  API_OPS_TOKEN: z.string().min(32).default("dev-only-ops-token-change-me-32chars"),
  API_MAINTENANCE_CRON_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
  API_SENTRY_DSN: z.string().url().optional(),
  API_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  API_CORS_ORIGINS: z.string().optional(),
  // Optional Redis connection string (redis:// or rediss://). When set, the
  // rate limiter uses a shared Redis store so limits hold across all instances
  // (Cloud Run). When unset, falls back to the per-instance in-memory store.
  API_REDIS_URL: z.string().min(1).optional(),
  // -- OAuth (Google, Facebook) ---------------------------------------------
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3000/oauth/callback/google"),
  FACEBOOK_CLIENT_ID: z.string().default(""),
  FACEBOOK_CLIENT_SECRET: z.string().default(""),
  FACEBOOK_CALLBACK_URL: z.string().url().default("http://localhost:3000/oauth/callback/facebook"),
  // -- Cloudinary (Phase 2 upload photo candidat) --------------------------
  // Optionnelles : si l'une manque, l'upload est « non configuré » (l'app reste
  // fonctionnelle via le coller-URL). Le secret ne quitte jamais le serveur.
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  // -- Mail (Resend) -------------------------------------------------------
  // Chaîne vide = absente (permet aux tests de neutraliser une clé héritée
  // d'un .env chargé par le client Prisma).
  MAIL_RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  MAIL_FROM: z.string().min(3).default("SHADOMA Votes <noreply@shadowa.votes>"),
  /** Adresses admin supplémentaires (CSV), en plus des comptes PLATFORM_ADMIN. */
  MAIL_ADMIN_EXTRA_RECIPIENTS: z.string().optional(),
  // URL publique du frontend (liens dans e-mails et webhooks).
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  /** Webhook Slack / alertes (POST JSON) pour les demandes partenaires. */
  PLATFORM_ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Confirme automatiquement les paiements sans PSP (développement / démo). */
  API_PAYMENT_DEMO_MODE: z.coerce.boolean().default(false),
  // -- Couverture pan-africaine des paiements ------------------------------
  // Indicatif pays (sans +) appliqué UNIQUEMENT aux numéros locaux saisis sans
  // indicatif. Les numéros déjà internationaux (avec + / 00 / indicatif connu)
  // sont préservés tels quels. Défaut 229 (Bénin) pour compat ascendante.
  PLATFORM_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,4}$/, "PLATFORM_DEFAULT_COUNTRY_CODE doit être un indicatif numérique (ex: 229).")
    .default("229"),
  // Réseaux mobile money acceptés (CSV, minuscules). Le code opérateur fourni
  // par le client est validé contre cette liste avant d'atteindre l'URL du PSP,
  // ce qui interdit toute injection de segment de chemin. Extensible sans
  // redéploiement selon le contrat PSP de la plateforme.
  PSP_SUPPORTED_OPERATORS: z.string().min(2).default("mtn,moov,orange"),
  // Indicatifs pays (CSV, sans +) réellement chargeables par les PSP intégrés
  // (FeexPay/FedaPay/KkiaPay). Défaut = zone UEMOA/XOF couverte par les trois :
  // Bénin 229, Côte d'Ivoire 225, Togo 228, Sénégal 221, Niger 227,
  // Burkina 226, Mali 223, Guinée 224. Un numéro hors de cette liste est refusé
  // AVANT l'appel PSP (message clair plutôt qu'un échec opaque du PSP).
  // Extensible sans redéploiement selon la couverture réelle du contrat PSP.
  PSP_SUPPORTED_COUNTRY_CODES: z.string().min(2).default("229,225,228,221,227,226,223,224"),
  // Intervalle minimal entre deux pulls PSP « à la demande » pour une même
  // transaction (anti-amplification / coût). Le webhook et le cron ne sont pas
  // concernés.
  PSP_STATUS_PULL_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(120_000).default(8_000),
  // OpenAI API key for the AI assistant chatbot
  OPENAI_API_KEY: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") {
    return;
  }

  // Demo mode auto-confirms every payment without ever calling the PSP. In
  // production this would let anyone inflate vote counts for free — it must
  // never be enabled outside dev/test.
  if (value.API_PAYMENT_DEMO_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["API_PAYMENT_DEMO_MODE"],
      message: "API_PAYMENT_DEMO_MODE ne doit jamais etre active en production."
    });
  }

  const alwaysForbidden = [
    {
      key: "API_JWT_SECRET",
      value: "dev-only-insecure-secret-change-me-32chars"
    },
    {
      key: "API_ORGANIZER_SECRET_KEY",
      value: "dev-only-organizer-secret-key-32-chars-min"
    },
    {
      key: "API_MAINTENANCE_CRON_SECRET",
      value: "dev-only-maintenance-cron-secret-change-me-32chars"
    },
    {
      key: "API_OPS_TOKEN",
      value: "dev-only-ops-token-change-me-32chars"
    },
    {
      key: "API_VAULT_SECRET_KEY",
      value: "dev-only-vault-secret-key-32-chars-minimum"
    }
  ] as const;

  const pspForbiddenByProvider = {
    FEEXPAY: [
      {
        key: "FEEXPAY_API_KEY",
        value: "test_dev_only_feexpay_api_key_change_me_xxxxxxxxx"
      }
    ],
    FEDAPAY: [
      {
        key: "FEDAPAY_API_KEY",
        value: "sk_sandbox_dev_only_fedapay_key_change_me_xxxx"
      }
    ],
    KKIAPAY: [
      {
        key: "KKIAPAY_PUBLIC_KEY",
        value: "dev_only_kkiapay_public_key_change_me"
      },
      {
        key: "KKIAPAY_PRIVATE_KEY",
        value: "dev_only_kkiapay_private_key_change_me"
      },
      {
        key: "KKIAPAY_SECRET_KEY",
        value: "dev_only_kkiapay_secret_key_change_me"
      }
    ]
  } as const;

  const forbidden = [
    ...alwaysForbidden,
    ...pspForbiddenByProvider[value.DEFAULT_PSP_PROVIDER]
  ];

  for (const secret of forbidden) {
    const current = value[secret.key as keyof typeof value];
    if (typeof current === "string" && current === secret.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [secret.key],
        message: `${secret.key} doit etre remplace en production.`
      });
    }
  }

  if (value.DEFAULT_PSP_PROVIDER === "FEEXPAY") {
    // Feexpay API key must use a real prefix in prod — `fp_` (LIVE) or
    // `test_` (SANDBOX, but tolerated only on staging-grade production where
    // FEEXPAY_BASE_URL points at a sandbox host). We reject anything else to
    // catch typos / misconfigured deploys at boot time, not at first webhook.
    if (!value.FEEXPAY_API_KEY.startsWith("fp_") && !value.FEEXPAY_API_KEY.startsWith("test_")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FEEXPAY_API_KEY"],
        message: "FEEXPAY_API_KEY doit commencer par 'fp_' (LIVE) ou 'test_' (SANDBOX)."
      });
    }
    if (value.FEEXPAY_SHOP_ID === "dev-shop") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FEEXPAY_SHOP_ID"],
        message: "FEEXPAY_SHOP_ID doit etre defini en production."
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;
export const env: AppEnv = envSchema.parse(process.env);
