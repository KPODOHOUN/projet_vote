import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { EventStatus, PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

// Démo : un concours ACTIF, 5 candidats avec photo réelle, et des votes PAYÉS
// répartis pour peupler le classement. Idempotent (upsert + reset des votes).
const CANDIDATES = [
  { number: 1, fullName: "Awa Kouassi" },
  { number: 2, fullName: "Nadia Mensah" },
  { number: 3, fullName: "Fatou Diallo" },
  { number: 4, fullName: "Mariam Touré" },
  { number: 5, fullName: "Chantal Adjovi" }
];

const PRICE_CFA = 200;

// Identité du compte organisateur de démo (pré-remplit son contrat).
const DEMO_OWNER = { firstName: "Démo", lastName: "Organisateur", phone: "2290197000000" };

function seedPublicRef(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-vote" },
    update: { displayName: "Demo Vote Benin", brandColor: "#6366F1" },
    create: { slug: "demo-vote", displayName: "Demo Vote Benin", brandColor: "#6366F1" }
  });

  // Mot de passe commun aux comptes de démo (test restreint).
  const demoPasswordHash = await hash("SecurePass123!", 12);

  // Organisateur propriétaire (crée et gère ses concours).
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "organisateur@demovote.africa" } },
    update: { passwordHash: demoPasswordHash, role: UserRole.ORGANIZER_OWNER, emailVerifiedAt: new Date(), ...DEMO_OWNER },
    create: {
      tenantId: tenant.id,
      email: "organisateur@demovote.africa",
      passwordHash: demoPasswordHash,
      role: UserRole.ORGANIZER_OWNER,
      emailVerifiedAt: new Date(),
      ...DEMO_OWNER
    }
  });

  // Membre d'équipe (staff) du même organisateur — accès restreint.
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "equipe@demovote.africa" } },
    update: { passwordHash: demoPasswordHash, role: UserRole.ORGANIZER_STAFF, emailVerifiedAt: new Date() },
    create: {
      tenantId: tenant.id,
      email: "equipe@demovote.africa",
      passwordHash: demoPasswordHash,
      role: UserRole.ORGANIZER_STAFF,
      emailVerifiedAt: new Date()
    }
  });

  // Compte admin plateforme — réservé au propriétaire (mot de passe via env, jamais partagé aux testeurs).
  const platformAdminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (platformAdminPassword && platformAdminPassword.length >= 8) {
    const platformTenant = await prisma.tenant.upsert({
      where: { slug: "shadoma-platform" },
      update: { displayName: "SHADOMA Votes (Plateforme)" },
      create: { slug: "shadoma-platform", displayName: "SHADOMA Votes (Plateforme)" }
    });
    const adminPasswordHash = await hash(platformAdminPassword, 12);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: platformTenant.id, email: "admin@shadoma.africa" } },
      update: {
        passwordHash: adminPasswordHash,
        role: UserRole.PLATFORM_ADMIN,
        emailVerifiedAt: new Date()
      },
      create: {
        tenantId: platformTenant.id,
        email: "admin@shadoma.africa",
        passwordHash: adminPasswordHash,
        role: UserRole.PLATFORM_ADMIN,
        emailVerifiedAt: new Date()
      }
    });
  }

  // Concours de démonstration publié d'office (sans contrat) pour tester le vote ;
  // il porte les conditions qu'un contrat signé figerait : 12 % et 50 % réservés.
  // Les concours réels ne passent en ligne que par la signature du contrat.
  const event = await prisma.event.upsert({
    where: { slug: "miss-campus-2026" },
    update: {
      title: "Miss Campus 2026",
      status: EventStatus.ACTIVE,
      brandColor: "#6366F1",
      tagline: "Élisez la Miss Campus de l'année — votre vote compte.",
      voteUnitPriceCfa: PRICE_CFA,
      commissionBps: 1_200,
      heldBps: 5_000,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    },
    create: {
      tenantId: tenant.id,
      slug: "miss-campus-2026",
      title: "Miss Campus 2026",
      status: EventStatus.ACTIVE,
      brandColor: "#6366F1",
      tagline: "Élisez la Miss Campus de l'année — votre vote compte.",
      voteUnitPriceCfa: PRICE_CFA,
      commissionBps: 1_200,
      heldBps: 5_000,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });

  // Aucun vote fabriqué : un vote n'existe qu'avec son paiement (portefeuille
  // et comptabilité cohérents). Le classement se remplit par de vrais votes
  // (mode démo). On purge les anciens votes sans paiement d'un seed précédent.
  await prisma.vote.deleteMany({ where: { eventId: event.id } });
  await prisma.organizerWallet.upsert({ where: { tenantId: tenant.id }, update: {}, create: { tenantId: tenant.id } });

  for (const c of CANDIDATES) {
    await prisma.candidate.upsert({
      where: { eventId_number: { eventId: event.id, number: c.number } },
      // Pas de photo factice : sans photo, le site affiche les initiales.
      update: { fullName: c.fullName, photoUrl: null },
      create: {
        eventId: event.id,
        fullName: c.fullName,
        number: c.number,
        publicRef: seedPublicRef()
      }
    });
  }

  // Réglages produit : taux de commission (12 %), part réservée (50 %) et délai
  // de libération (48 h) ont leurs valeurs par défaut dans le code ; seuls les
  // délais des codes à usage unique sont posés ici.
  const platformDefaults: Array<{ key: string; value: string }> = [
    { key: "otp_ttl_seconds", value: "600" },
    { key: "otp_resend_delay_seconds", value: "60" }
  ];
  for (const s of platformDefaults) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value, updatedByUserId: "system:seed" }
    });
  }
  console.log(`Seed OK — ${platformDefaults.length} réglages plateforme (codes à usage unique).`);

  console.log(`Seed OK — concours « ${event.title} » (/e/${event.slug}), ${CANDIDATES.length} candidats (0 vote : votez en mode démo).`);
  console.log("");
  console.log("Comptes de démo testeurs (mot de passe : SecurePass123!) :");
  console.log("  • Organisateur (owner) : organisateur@demovote.africa");
  console.log("  • Équipe (staff)       : equipe@demovote.africa");
  if (platformAdminPassword && platformAdminPassword.length >= 8) {
    console.log("  • Admin plateforme (propriétaire, ne pas partager) : admin@shadoma.africa");
  }
}

void main()
  .catch(async (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
