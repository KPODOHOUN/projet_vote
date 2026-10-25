import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Données de validation uniquement (jamais committées dans les seeds) :
// la base est celle de l'e2e (TEST_DATABASE_URL).
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
const OUT = "../../docs/validation";

type Palette = {
  name: string;
  color: string | null;
  layout: "GRID" | "LIST" | "SPOTLIGHT";
  pageStyle: "AFFICHE" | "SOIREE" | "BILLET" | "COURONNE" | "MAGAZINE" | "POP";
  fontStyle: "FESTIVAL" | "GALA" | "CLASSIQUE";
  cover?: boolean;
};
// Les six styles de page, chacun avec une couleur, une police et un logo de
// démonstration ; couverture là où le style la met en avant.
const PALETTES: Palette[] = [
  { name: "affiche-or", color: "#D4A017", layout: "GRID", pageStyle: "AFFICHE", fontStyle: "FESTIVAL", cover: true },
  { name: "soiree-or", color: "#D4A017", layout: "GRID", pageStyle: "SOIREE", fontStyle: "GALA" },
  { name: "billet-turquoise", color: "#14B8A6", layout: "GRID", pageStyle: "BILLET", fontStyle: "CLASSIQUE" },
  { name: "couronne-rose", color: "#DB2777", layout: "GRID", pageStyle: "COURONNE", fontStyle: "GALA", cover: true },
  { name: "magazine-rouge", color: "#DC2626", layout: "GRID", pageStyle: "MAGAZINE", fontStyle: "FESTIVAL", cover: true },
  { name: "pop-orange", color: "#F97316", layout: "GRID", pageStyle: "POP", fontStyle: "FESTIVAL" }
];

// Logo et couverture de démonstration, fournis hors dépôt (VISUAL_LOGO_PATH,
// VISUAL_COVER_PATH) et importés par la vraie route d'import (stockage en base).
async function importImage(request: APIRequestContext, headers: Record<string, string>, path: string | undefined, mimeType: string) {
  if (!path || !existsSync(path)) return null;
  const res = await request.post(`${apiBaseUrl}/uploads/image`, {
    headers,
    multipart: { file: { name: path.split("/").pop()!, mimeType, buffer: readFileSync(path) } }
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { url: string }).url;
}

async function organizer(request: APIRequestContext, unique: string) {
  const res = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      tenantSlug: `vis-${unique}`,
      tenantDisplayName: "Comité Miss Campus",
      email: `vis-${unique}@shadowa.test`,
      password: "SecurePass123!",
      acceptPrivacyPolicy: true,
      offerType: "ESCROW"
    }
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

async function seedEvent(request: APIRequestContext, headers: Record<string, string>, unique: string, p: Palette) {
  const slug = `vis-${p.name}-${unique}`;
  const created = await request.post(`${apiBaseUrl}/events`, {
    headers,
    data: {
      slug,
      title: `Miss Campus ${p.name}`,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      voteUnitPriceCfa: 100
    }
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  const names = ["Aïcha Dossou", "Grace Houngbo", "Mariam Sanni", "Esther Agbo", "Nadia Kpade", "Ruth Ahouansou"];
  for (const [i, fullName] of names.entries()) {
    const r = await request.post(`${apiBaseUrl}/events/${id}/candidates`, { headers, data: { fullName, number: i + 1 } });
    expect(r.ok()).toBeTruthy();
  }
  // Activation et votes payés posés directement en base : le parcours PSP n'est pas l'objet de la capture.
  const event = await prisma.event.update({
    where: { id },
    data: {
      status: "ACTIVE",
      brandColor: p.color,
      layout: p.layout,
      tagline: "Édition 2026",
      pageStyle: p.pageStyle,
      fontStyle: p.fontStyle,
      logoUrl: await importImage(request, headers, process.env.VISUAL_LOGO_PATH, "image/png"),
      coverUrl: p.cover ? await importImage(request, headers, process.env.VISUAL_COVER_PATH, "image/jpeg") : null
    }
  });
  const candidates = await prisma.candidate.findMany({ where: { eventId: id }, orderBy: { number: "asc" } });
  const counts = [42, 31, 18, 9, 4, 0];
  for (const [i, c] of candidates.entries()) {
    if (!counts[i]) continue;
    await prisma.vote.create({
      data: { tenantId: event.tenantId, eventId: id, candidateId: c.id, amountCfa: counts[i]! * 100, votesCount: counts[i]!, paidAt: new Date() }
    });
  }
  return { slug, id, firstRef: candidates[0]!.publicRef };
}

async function shoot(page: Page, path: string, width: number, file: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  mkdirSync(`${OUT}/${width}`, { recursive: true });
  await page.screenshot({ path: `${OUT}/${width}/${file}.png`, fullPage: true });
}

test("mini-plateformes : hub, profil, résultats dans les six styles", async ({ page, request }) => {
  test.setTimeout(300_000);
  const unique = `${Date.now()}`;
  const headers = await organizer(request, unique);
  for (const p of PALETTES) {
    const { slug, id, firstRef } = await seedEvent(request, headers, unique, p);
    for (const width of [390, 1280]) {
      await shoot(page, `/e/${slug}`, width, `hub-${p.name}`);
      await shoot(page, `/e/${slug}/c/${firstRef}`, width, `profil-${p.name}`);
      await shoot(page, `/e/${slug}/results`, width, `resultats-${p.name}`);
    }
    if (p.name === "affiche-or") {
      // Panneau de partage ouvert, sur téléphone.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/e/${slug}/c/${firstRef}`);
      await page.getByRole("button", { name: "Partager ce profil" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/390/partage.png` });
    }
    if (p.name === "soiree-or") {
      await prisma.event.update({ where: { id }, data: { status: "CLOSED" } });
      for (const width of [390, 1280]) await shoot(page, `/e/${slug}/results`, width, "resultats-clos");
    }
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
