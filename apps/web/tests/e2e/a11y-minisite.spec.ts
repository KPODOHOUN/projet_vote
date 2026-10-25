import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Accessibilité des mini-plateformes : axe-core (WCAG 2.2 A/AA) et aucun
// défilement horizontal à 390 px, sur l'accueil, le profil et les résultats des
// dix-sept styles de page, puis sur l'éditeur d'apparence. Activation et votes
// posés en base (base e2e), comme les autres specs.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
const axePath = require.resolve("axe-core/axe.min.js");

const STYLES = [
  "AFFICHE", "SOIREE", "BILLET", "COURONNE", "MAGAZINE", "POP", "TERROIR", "STADE", "LINEUP",
  "DIPLOME", "MARCHE", "MENU", "WAX", "CAMPUS", "BADGE", "STORY", "SANCTUAIRE"
] as const;
// Une couleur claire, une moyenne, une sombre : le thème doit tenir le contraste avec chacune.
const COLORS = ["#FACC15", "#65A30D", "#6D28D9"];

test.afterAll(async () => {
  await prisma.$disconnect();
});

type Violation = { page: string; rule: string; impact: string | null; targets: string[]; detail?: string | undefined };

async function audit(page: Page, label: string): Promise<Violation[]> {
  await page.waitForLoadState("networkidle");
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    type AxeNode = { target: string[]; html: string; failureSummary?: string };
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: AxeNode[] }[] }> } }).axe;
    return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
  });
  const found: Violation[] = result.violations.map((v) => ({
    page: label,
    rule: v.id,
    impact: v.impact,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    detail: v.nodes[0] ? `${v.nodes[0].html.slice(0, 160)} — ${(v.nodes[0].failureSummary ?? "").replace(/\s+/g, " ").slice(0, 240)}` : undefined
  }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) found.push({ page: label, rule: "horizontal-overflow", impact: "serious", targets: [`${overflow}px`] });
  return found;
}

async function organizer(request: APIRequestContext, unique: string) {
  const email = `a11y-${unique}@shadowa.test`;
  const password = "SecurePass123!";
  const res = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { tenantSlug: `a11y-${unique}`, tenantDisplayName: "Comité A11y", email, password, acceptPrivacyPolicy: true, offerType: "ESCROW" }
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { email, password, headers: { Authorization: `Bearer ${accessToken}` } };
}

async function seedEvent(request: APIRequestContext, headers: Record<string, string>, unique: string, style: string, color: string) {
  const slug = `a11y-${style.toLowerCase()}-${unique}`;
  const created = await request.post(`${apiBaseUrl}/events`, {
    headers,
    data: {
      slug,
      title: `Miss A11y ${style}`,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      voteUnitPriceCfa: 100
    }
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  for (const [i, fullName] of ["Aïcha Dossou", "Ruth Ahouansou", "Mariam Sanni"].entries()) {
    const r = await request.post(`${apiBaseUrl}/events/${id}/candidates`, { headers, data: { fullName, number: i + 1 } });
    expect(r.ok()).toBeTruthy();
  }
  const event = await prisma.event.update({
    where: { id },
    data: { status: "ACTIVE", brandColor: color, tagline: "Édition 2026", pageStyle: style as never }
  });
  const candidates = await prisma.candidate.findMany({ where: { eventId: id }, orderBy: { number: "asc" } });
  await prisma.vote.create({
    data: { tenantId: event.tenantId, eventId: id, candidateId: candidates[0]!.id, amountCfa: 1200, votesCount: 12, paidAt: new Date() }
  });
  return { slug, id, firstRef: candidates[0]!.publicRef };
}

test("accessibilité : mini-plateformes dans les dix-sept styles et éditeur d'apparence", async ({ page, request }) => {
  test.setTimeout(600_000);
  const unique = `${Date.now()}`;
  const owner = await organizer(request, unique);
  const violations: Violation[] = [];
  let lastEventId = "";

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [i, style] of STYLES.entries()) {
    const { slug, id, firstRef } = await seedEvent(request, owner.headers, unique, style, COLORS[i % COLORS.length]!);
    lastEventId = id;
    for (const [path, label] of [
      [`/e/${slug}`, "accueil"],
      [`/e/${slug}/c/${firstRef}`, "profil"],
      [`/e/${slug}/results`, "résultats"]
    ] as const) {
      await page.goto(path);
      violations.push(...(await audit(page, `${style} ${label}`)));
    }
  }

  await page.goto("/login");
  await page.locator("#email").fill(owner.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`/dashboard/events/${lastEventId}/design`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  violations.push(...(await audit(page, "éditeur d'apparence")));

  writeFileSync(test.info().outputPath("a11y-violations.json"), JSON.stringify(violations, null, 2));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});
