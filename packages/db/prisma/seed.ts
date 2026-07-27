import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { EventStatus, PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

// Démo : un concours ACTIF, 5 candidats avec photo réelle, et des votes PAYÉS
// répartis pour peupler le classement. Idempotent (upsert + reset des votes).
const CANDIDATES = [
  { number: 1, fullName: "Awa Kouassi", photoUrl: "https://i.pravatar.cc/480?img=5", paidVotes: 18 },
  { number: 2, fullName: "Nadia Mensah", photoUrl: "https://i.pravatar.cc/480?img=9", paidVotes: 31 },
  { number: 3, fullName: "Fatou Diallo", photoUrl: "https://i.pravatar.cc/480?img=16", paidVotes: 12 },
  { number: 4, fullName: "Mariam Touré", photoUrl: "https://i.pravatar.cc/480?img=20", paidVotes: 25 },
  { number: 5, fullName: "Chantal Adjovi", photoUrl: "https://i.pravatar.cc/480?img=32", paidVotes: 6 }
];

const PRICE_CFA = 200;

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
    update: { passwordHash: demoPasswordHash, role: UserRole.ORGANIZER_OWNER, emailVerifiedAt: new Date() },
    create: {
      tenantId: tenant.id,
      email: "organisateur@demovote.africa",
      passwordHash: demoPasswordHash,
      role: UserRole.ORGANIZER_OWNER,
      emailVerifiedAt: new Date()
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

  const event = await prisma.event.upsert({
    where: { slug: "miss-campus-2026" },
    update: {
      title: "Miss Campus 2026",
      status: EventStatus.ACTIVE,
      brandColor: "#6366F1",
      tagline: "Élisez la Miss Campus de l'année — votre vote compte.",
      voteUnitPriceCfa: PRICE_CFA,
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
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });

  // Reset des votes de l'event pour rester idempotent (les votes n'ont pas de clé naturelle).
  await prisma.vote.deleteMany({ where: { eventId: event.id } });

  for (const c of CANDIDATES) {
    const candidate = await prisma.candidate.upsert({
      where: { eventId_number: { eventId: event.id, number: c.number } },
      update: { fullName: c.fullName, photoUrl: c.photoUrl },
      create: {
        eventId: event.id,
        fullName: c.fullName,
        number: c.number,
        photoUrl: c.photoUrl,
        publicRef: seedPublicRef()
      }
    });

    if (c.paidVotes > 0) {
      await prisma.vote.createMany({
        data: Array.from({ length: c.paidVotes }, () => ({
          tenantId: tenant.id,
          eventId: event.id,
          candidateId: candidate.id,
          amountCfa: PRICE_CFA,
          paidAt: new Date()
        }))
      });
    }
  }

  const total = CANDIDATES.reduce((acc, c) => acc + c.paidVotes, 0);

  // Default subscription pricing grid (Standard plan).
  const defaultPricing = [
    { durationMonths: 1, priceCfa: 5_000 },
    { durationMonths: 3, priceCfa: 12_000 },
    { durationMonths: 6, priceCfa: 20_000 },
    { durationMonths: 12, priceCfa: 35_000 }
  ];
  for (const p of defaultPricing) {
    await prisma.subscriptionPricing.upsert({
      where: { durationMonths: p.durationMonths },
      update: { priceCfa: p.priceCfa },
      create: { durationMonths: p.durationMonths, priceCfa: p.priceCfa }
    });
  }
  console.log(`Seed OK — ${defaultPricing.length} formules d'abonnement Standard.`);

  // Plans d'abonnement flexibles (Free, Starter, Pro, Enterprise).
  const defaultPlans = [
    {
      slug: "free",
      name: "Free",
      description: "Pour démarrer. 1 événement gratuit, commission 15%.",
      priceCfa: 0,
      maxEvents: 1,
      commissionRate: 1500, // 15%
      sortOrder: 10,
      features: ["1 événement maximum", "Commission 15% sur les votes", "Accès au dashboard"],
      isActive: true
    },
    {
      slug: "starter",
      name: "Starter",
      description: "Pour les organisateurs réguliers. Jusqu'à 5 événements.",
      priceCfa: 9900,
      maxEvents: 5,
      commissionRate: 1000, // 10%
      sortOrder: 20,
      features: ["5 événements maximum", "Commission 10% sur les votes", "Support prioritaire"],
      isActive: true
    },
    {
      slug: "pro",
      name: "Pro",
      description: "Pour les professionnels. Événements illimités.",
      priceCfa: 24900,
      maxEvents: null, // illimité
      commissionRate: 700, // 7%
      sortOrder: 30,
      features: ["Événements illimités", "Commission 7% sur les votes", "Support dédié", "Statistiques avancées"],
      isActive: true
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      description: "Pour les grandes organisations. Tout illimité.",
      priceCfa: 49900,
      maxEvents: null, // illimité
      commissionRate: 500, // 5%
      sortOrder: 40,
      features: ["Événements illimités", "Commission 5% sur les votes", "Support VIP", "API dédiée", "Marque blanche"],
      isActive: true
    }
  ];
  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        description: plan.description,
        priceCfa: plan.priceCfa,
        maxEvents: plan.maxEvents,
        commissionRate: plan.commissionRate,
        sortOrder: plan.sortOrder,
        features: plan.features,
        isActive: plan.isActive
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        priceCfa: plan.priceCfa,
        maxEvents: plan.maxEvents,
        commissionRate: plan.commissionRate,
        sortOrder: plan.sortOrder,
        features: plan.features,
        isActive: plan.isActive
      }
    });
  }
  console.log(`Seed OK — ${defaultPlans.length} plans d'abonnement (Free, Starter, Pro, Enterprise).`);

  console.log(`Seed OK — concours « ${event.title} » (/e/${event.slug}), ${CANDIDATES.length} candidats, ${total} votes payés.`);
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
