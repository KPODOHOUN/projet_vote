import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Billetterie de bout en bout : acheteur (liste, achat, billet reçu, « Mes
// billets »), organisateur (types, design, ventes, scanner). Les paiements
// passent en mode démo (API_PAYMENT_DEMO_MODE, voir playwright.config.ts) ; la
// mise en ligne, couverte par organizer-flow.spec, est posée en base.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
const PASSWORD = "SecurePass123!";

test.afterAll(async () => {
  await prisma.$disconnect();
});

type Organizer = { email: string; headers: { Authorization: string } };
type TypeSpec = { name: string; priceCfa: number; quantity: number; maxPerPerson?: number };

let counter = 0;
/** Numéro Mobile Money propre à chaque achat : la limite par personne ne déborde pas d'un test à l'autre. */
function buyerPhone() {
  counter += 1;
  return `0196${String(Date.now() % 10_000).padStart(4, "0")}${String(counter % 100).padStart(2, "0")}`;
}

async function registerOrganizer(request: APIRequestContext, label: string): Promise<Organizer> {
  const unique = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `tix-${unique}@shadowa.test`;
  const register = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      firstName: "E2E",
      lastName: "Billetterie",
      phone: "0197000000",
      organizationName: `Tix ${unique}`,
      email,
      password: PASSWORD,
      acceptPrivacyPolicy: true
    }
  });
  expect(register.ok()).toBeTruthy();
  const { accessToken } = (await register.json()) as { accessToken: string };
  return { email, headers: { Authorization: `Bearer ${accessToken}` } };
}

/** Concours et ses types de billets (créés en brouillon, comme dans l'app), puis mis en ligne en base. */
async function eventWithTickets(
  request: APIRequestContext,
  organizer: Organizer,
  label: string,
  types: TypeSpec[],
  publish = true
) {
  const slug = `tix-${label}-${Date.now()}`;
  const created = await request.post(`${apiBaseUrl}/events`, {
    headers: organizer.headers,
    data: {
      slug,
      title: `Gala ${label}`,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      voteUnitPriceCfa: 100
    }
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  const typeIds: Record<string, string> = {};
  for (const type of types) {
    const res = await request.post(`${apiBaseUrl}/events/${id}/ticket-types`, { headers: organizer.headers, data: type });
    expect(res.ok()).toBeTruthy();
    typeIds[type.name] = ((await res.json()) as { id: string }).id;
  }
  if (publish) {
    await prisma.event.update({
      where: { id },
      data: { status: "ACTIVE", startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000) }
    });
  }
  return { id, slug, typeIds };
}

async function loginInBrowser(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Parcours acheteur dans le navigateur, jusqu'au clic sur « Payer ». */
async function fillPurchase(
  page: Page,
  slug: string,
  typeName: string,
  opts: { quantity?: number; phone: string; name?: string; guests?: string[] }
) {
  await page.goto(`/e/${slug}/tickets`);
  await page.getByRole("button", { name: new RegExp(typeName) }).click();
  if (opts.quantity && opts.quantity > 1) await page.getByRole("spinbutton").fill(String(opts.quantity));
  if (opts.name) await page.getByLabel("Votre nom").fill(opts.name);
  await page.getByLabel("Numéro Mobile Money qui paie").fill(opts.phone);
  await page.getByLabel("Réseau").selectOption("mtn");
  for (const [i, guest] of (opts.guests ?? []).entries()) {
    await page.getByLabel(`Nom sur le billet ${i + 1}`).fill(guest);
  }
  await page.getByRole("button", { name: /^Payer/ }).click();
}

async function seedTicket(
  eventId: string,
  ticketTypeId: string,
  status: "RESERVED" | "PAID" | "USED" | "CANCELLED",
  holderName: string
) {
  const secret = `e2e-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ticket = await prisma.ticket.create({
    data: {
      eventId,
      ticketTypeId,
      holderName,
      qrSecret: secret,
      status,
      amountCfa: 1000,
      ...(status === "PAID" || status === "USED" ? { paidAt: new Date() } : {}),
      ...(status === "USED" ? { usedAt: new Date() } : {})
    }
  });
  return { id: ticket.id, secret, url: `/t/${ticket.id}?s=${encodeURIComponent(secret)}` };
}

const confirmed = (page: Page) => expect(page.getByRole("heading", { name: "Achat confirmé !" })).toBeVisible({ timeout: 20_000 });

// ── Acheteur ─────────────────────────────────────────────────────────────

test.describe("billetterie — acheteur", () => {
  test("liste : prix croissants, places restantes, limite par personne, épuisé ; types en pause ou hors période masqués", async ({ page, request }) => {
    const org = await registerOrganizer(request, "liste");
    const { id, slug, typeIds } = await eventWithTickets(request, org, "liste", [
      { name: "VIP Lounge", priceCfa: 5000, quantity: 20, maxPerPerson: 4 },
      { name: "Standard", priceCfa: 1500, quantity: 50, maxPerPerson: 6 },
      { name: "Complet", priceCfa: 3000, quantity: 1 },
      { name: "En pause", priceCfa: 2000, quantity: 10 },
      { name: "Plus tard", priceCfa: 2500, quantity: 10 }
    ]);
    await prisma.ticketType.update({ where: { id: typeIds["En pause"]! }, data: { status: "PAUSED" } });
    await prisma.ticketType.update({ where: { id: typeIds["Plus tard"]! }, data: { saleStartsAt: new Date(Date.now() + 86_400_000) } });
    await seedTicket(id, typeIds["Complet"]!, "PAID", "Déjà vendu");

    await page.goto(`/e/${slug}/tickets`);
    await expect(page.getByRole("heading", { name: "Acheter des billets" })).toBeVisible();
    const cards = page.locator('main [role="button"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("Standard");
    await expect(cards.nth(0)).toContainText("50 restants");
    await expect(cards.nth(0)).toContainText("max 6/personne");
    await expect(cards.nth(1)).toContainText("Complet");
    await expect(cards.nth(1)).toContainText("Épuisé");
    await expect(cards.nth(2)).toContainText("VIP Lounge");
    await expect(page.getByText("En pause")).toHaveCount(0);
    await expect(page.getByText("Plus tard")).toHaveCount(0);
  });

  test("concours en brouillon : billets invisibles ; concours sans billet : message clair", async ({ page, request }) => {
    const org = await registerOrganizer(request, "vide");
    const draft = await eventWithTickets(request, org, "brouillon", [{ name: "Standard", priceCfa: 1000, quantity: 5 }], false);
    const hidden = await request.get(`${apiBaseUrl}/public/events/${draft.slug}/ticket-types`);
    expect(hidden.status()).toBe(404);
    await page.goto(`/e/${draft.slug}/tickets`);
    await expect(page.getByRole("button", { name: /Standard/ })).toHaveCount(0);

    const empty = await eventWithTickets(request, org, "sansbillet", []);
    await page.goto(`/e/${empty.slug}/tickets`);
    await expect(page.getByText("Aucun billet disponible")).toBeVisible();
  });

  test("formulaire : paiement bloqué sans numéro ni réseau, quantité bornée, noms d'invités à partir de 2 billets", async ({ page, request }) => {
    const org = await registerOrganizer(request, "form");
    const { slug } = await eventWithTickets(request, org, "form", [{ name: "VIP", priceCfa: 5000, quantity: 10, maxPerPerson: 4 }]);
    await page.goto(`/e/${slug}/tickets`);
    await page.getByRole("button", { name: /VIP/ }).click();
    const pay = page.getByRole("button", { name: /^Payer/ });
    await expect(pay).toBeDisabled();
    await expect(page.getByLabel("Nom sur le billet 1")).toHaveCount(0);

    const quantity = page.getByRole("spinbutton");
    await quantity.fill("9");
    await expect(quantity).toHaveValue("4");
    await expect(pay).toHaveText(/20\s?000/);
    await expect(page.getByLabel("Nom sur le billet 4")).toBeVisible();

    await page.getByLabel("Numéro Mobile Money qui paie").fill(buyerPhone());
    await expect(pay).toBeDisabled();
    await page.getByLabel("Réseau").selectOption("mtn");
    await expect(pay).toBeEnabled();

    await page.getByRole("button", { name: "Changer" }).click();
    await expect(page.getByRole("button", { name: /VIP/ })).toBeVisible();
  });

  test("achat de 2 billets pour des invités : confirmation, billets nominatifs payés et numérotés, image rendue, commission de 10 %", async ({ page, request }) => {
    const org = await registerOrganizer(request, "achat");
    const { id, slug } = await eventWithTickets(request, org, "achat", [{ name: "VIP", priceCfa: 5000, quantity: 10, maxPerPerson: 4 }]);

    await fillPurchase(page, slug, "VIP", { quantity: 2, phone: buyerPhone(), name: "Acheteur E2E", guests: ["Invité Un", "Invité Deux"] });
    await confirmed(page);
    await expect(page.getByText("Billet 1 · Invité Un")).toBeVisible();
    await expect(page.getByText("Billet 2 · Invité Deux")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir" })).toHaveCount(2);

    const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { eventId: id, purpose: "TICKET" } });
    expect(tx.status).toBe("SUCCEEDED");
    expect(tx.amountCfa).toBe(10_000);
    expect(tx.commissionCfa).toBe(1_000);

    const href = await page.getByRole("link", { name: "Voir" }).first().getAttribute("href");
    const link = new URL(href!, "http://127.0.0.1");
    await page.goto(link.pathname + link.search);
    await expect(page.getByText("Payé", { exact: true })).toBeVisible();
    await expect(page.getByText("N° 0001")).toBeVisible();
    await expect(page.getByText("Invité Un")).toBeVisible();

    // Image du billet (design de l'organisateur + QR) servie en PNG.
    const image = await page.request.get(`${link.pathname}/image${link.search}`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");

    // « Mes billets » : retrouvés sur ce téléphone, puis effaçables (téléphone partagé).
    await page.goto(`/e/${slug}/tickets`);
    await expect(page.getByText("Mes billets sur ce téléphone (2)")).toBeVisible();
    const remove = page.getByRole("button", { name: /Retirer ces billets de ce téléphone/ });
    // Confirmation demandée : « Annuler » garde les billets, « OK » les retire.
    page.once("dialog", (dialog) => void dialog.dismiss());
    await remove.click();
    await expect(page.getByText("Mes billets sur ce téléphone (2)")).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await remove.click();
    await expect(page.getByText(/Mes billets sur ce téléphone/)).toHaveCount(0);
  });

  test("limite par personne : le même numéro, saisi autrement, ne dépasse pas le maximum", async ({ page, request }) => {
    const org = await registerOrganizer(request, "limite");
    const { slug } = await eventWithTickets(request, org, "limite", [{ name: "VIP", priceCfa: 5000, quantity: 10, maxPerPerson: 2 }]);
    const phone = buyerPhone();
    await fillPurchase(page, slug, "VIP", { quantity: 2, phone });
    await confirmed(page);

    await fillPurchase(page, slug, "VIP", { phone: `+229${phone}` });
    await expect(page.getByText(/ce numéro a déjà atteint la limite/)).toBeVisible();
  });

  test("dernière place : vendue une fois, affichée épuisée, refusée au suivant", async ({ page, request }) => {
    const org = await registerOrganizer(request, "stock");
    const { slug, typeIds } = await eventWithTickets(request, org, "stock", [{ name: "Unique", priceCfa: 2000, quantity: 1 }]);
    await fillPurchase(page, slug, "Unique", { phone: buyerPhone() });
    await confirmed(page);

    await page.goto(`/e/${slug}/tickets`);
    await expect(page.locator('main [role="button"]').first()).toContainText("Épuisé");
    const late = await request.post(`${apiBaseUrl}/public/events/${slug}/tickets/purchase`, {
      data: { ticketTypeId: typeIds["Unique"], quantity: 1, holderPhone: buyerPhone(), operator: "mtn" }
    });
    expect(late.status()).toBe(400);
    expect(((await late.json()) as { message: string }).message).toMatch(/Seulement 0/);
  });

  test("achats simultanés sur les 3 dernières places : jamais de survente", async ({ request }) => {
    const org = await registerOrganizer(request, "course");
    const { slug, typeIds } = await eventWithTickets(request, org, "course", [{ name: "Rare", priceCfa: 1000, quantity: 3, maxPerPerson: 2 }]);
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request.post(`${apiBaseUrl}/public/events/${slug}/tickets/purchase`, {
          data: { ticketTypeId: typeIds["Rare"], quantity: 2, holderPhone: buyerPhone(), operator: "mtn" }
        })
      )
    );
    expect(attempts.filter((r) => r.ok())).toHaveLength(1);
    const held = await prisma.ticket.count({ where: { ticketTypeId: typeIds["Rare"]!, status: { in: ["RESERVED", "PAID", "CONFIRMED", "USED"] } } });
    expect(held).toBe(2);
  });

  test("acheteur qui réessaie : son achat non payé précédent ne le bloque pas, il est remplacé", async ({ page, request }) => {
    const org = await registerOrganizer(request, "retry");
    const { id, slug, typeIds } = await eventWithTickets(request, org, "retry", [
      { name: "VIP", priceCfa: 5000, quantity: 10, maxPerPerson: 1 },
      { name: "Repère", priceCfa: 500, quantity: 10 }
    ]);
    const phone = buyerPhone();
    // Un premier achat réel donne le numéro tel que l'API l'enregistre (normalisé).
    const probe = await request.post(`${apiBaseUrl}/public/events/${slug}/tickets/purchase`, {
      data: { ticketTypeId: typeIds["Repère"], quantity: 1, holderPhone: phone, operator: "mtn" }
    });
    expect(probe.ok()).toBeTruthy();
    const holderPhone = (await prisma.ticket.findFirstOrThrow({ where: { ticketTypeId: typeIds["Repère"]! } })).holderPhone;

    // Invite USSD envoyée puis fermée : réservation VIP en attente, référence connue.
    const event = await prisma.event.findUniqueOrThrow({ where: { id } });
    const pending = await prisma.paymentTransaction.create({
      data: {
        tenantId: event.tenantId, eventId: id, provider: "FEEXPAY", providerRef: `e2e-pending-${Date.now()}`,
        amountCfa: 5000, status: "PENDING", purpose: "TICKET", idempotencyKey: `e2e-retry-${Date.now()}-aaaaaaaa`
      }
    });
    await prisma.ticket.create({
      data: { eventId: id, ticketTypeId: typeIds["VIP"]!, holderPhone, qrSecret: `e2e-retry-${Date.now()}`, amountCfa: 5000, paymentTransactionId: pending.id }
    });

    await fillPurchase(page, slug, "VIP", { phone });
    await confirmed(page);
    expect((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("FAILED");
    expect(await prisma.ticket.count({ where: { ticketTypeId: typeIds["VIP"]!, status: "PAID" } })).toBe(1);
  });

  test("page du billet : en attente, expiré, déjà utilisé, lien falsifié", async ({ page, request }) => {
    const org = await registerOrganizer(request, "etats");
    const { id, typeIds } = await eventWithTickets(request, org, "etats", [{ name: "Standard", priceCfa: 1000, quantity: 10 }]);
    const typeId = typeIds["Standard"]!;

    const reserved = await seedTicket(id, typeId, "RESERVED", "En attente");
    await page.goto(reserved.url);
    await expect(page.getByText(/Paiement en cours de confirmation/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();

    const cancelled = await seedTicket(id, typeId, "CANCELLED", "Expiré");
    await page.goto(cancelled.url);
    await expect(page.getByText(/Réservation expirée/)).toBeVisible();

    const used = await seedTicket(id, typeId, "USED", "Déjà entré");
    await page.goto(used.url);
    await expect(page.getByText("Ce billet a déjà servi.")).toBeVisible();

    const paid = await seedTicket(id, typeId, "PAID", "Vrai billet");
    await page.goto(`/t/${paid.id}?s=faux-secret`);
    await expect(page.getByRole("heading", { name: "Billet invalide" })).toBeVisible();
    const image = await page.request.get(`/t/${paid.id}/image?s=faux-secret`);
    expect(image.ok()).toBeFalsy();
  });
});

// ── Organisateur ─────────────────────────────────────────────────────────

test.describe("billetterie — organisateur", () => {
  test("types de billets : création en brouillon, puis nom, prix et quantité figés après publication", async ({ page, request }) => {
    const org = await registerOrganizer(request, "types");
    const { id } = await eventWithTickets(request, org, "types", [], false);
    await loginInBrowser(page, org.email);
    await page.goto(`/dashboard/events/${id}/tickets`);
    await expect(page.getByText("Aucun type de billet")).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un type" }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Early Bird");
    await page.getByLabel("Prix (FCFA)").fill("1500");
    await page.getByLabel("Quantité").fill("40");
    await page.getByLabel("Max par personne").fill("3");
    await page.getByRole("button", { name: "Créer" }).click();
    await expect(page.getByText("Type de billet créé")).toBeVisible();
    await expect(page.getByText("0/40 vendus", { exact: true })).toBeVisible();
    await expect(page.getByText("3 max par personne", { exact: true })).toBeVisible();

    await prisma.event.update({ where: { id }, data: { status: "ACTIVE" } });
    await page.reload();
    await expect(page.getByRole("button", { name: "Ajouter un type" })).toHaveCount(0);
    await page.getByRole("button", { name: "Modifier Early Bird" }).click();
    await expect(page.getByLabel("Nom", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Prix (FCFA)")).toBeDisabled();
    await expect(page.getByLabel("Quantité")).toBeDisabled();
    await expect(page.getByText("Nom, prix et quantité sont fixés par le contrat signé.")).toBeVisible();
    await expect(page.getByLabel("Statut")).toHaveValue("ACTIVE");
  });

  test("ventes : chiffres, liste des acheteurs et export CSV après un achat", async ({ page, request }) => {
    const org = await registerOrganizer(request, "ventes");
    const { id, slug } = await eventWithTickets(request, org, "ventes", [{ name: "Standard", priceCfa: 2000, quantity: 30 }]);
    await fillPurchase(page, slug, "Standard", { quantity: 3, phone: buyerPhone(), name: "Client Ventes" });
    await confirmed(page);

    await loginInBrowser(page, org.email);
    await page.goto(`/dashboard/events/${id}/tickets`);
    await expect(page.getByText(/3\/30 vendus/)).toBeVisible();
    await expect(page.getByText(/6\s?000\s?F\s?CFA/).first()).toBeVisible();

    await page.getByRole("button", { name: "Ventes", exact: true }).click();
    await expect(page.getByText("Client Ventes").first()).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV" }).click();
    const file = await download;
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv).toContain("ID;Type;Titulaire");
    expect(csv).toContain("Client Ventes");
  });

  test("design du billet : modèle appliqué, enregistré, conservé au rechargement", async ({ page, request }) => {
    const org = await registerOrganizer(request, "design");
    const { id, typeIds } = await eventWithTickets(request, org, "design", [{ name: "VIP", priceCfa: 5000, quantity: 10 }]);
    await loginInBrowser(page, org.email);
    await page.goto(`/dashboard/events/${id}/tickets`);
    await page.getByRole("button", { name: "Personnaliser le billet VIP" }).click();
    await expect(page.getByText("Calques", { exact: false }).first()).toBeVisible();

    // Remplacer un design existant demande confirmation.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: /Gala/ }).click();
    await expect(page.getByText("Modifications non enregistrées")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Modifications non enregistrées")).toHaveCount(0);

    await expect.poll(async () => (await prisma.ticketType.findUniqueOrThrow({ where: { id: typeIds["VIP"]! } })).design).not.toBeNull();
    await page.reload();
    await expect(page.getByText("Calques", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Modifications non enregistrées")).toHaveCount(0);
  });

  test("scanner : entrée validée une seule fois, refus pour un autre concours, alerte si non payé, QR étranger", async ({ page, request }) => {
    const org = await registerOrganizer(request, "scan");
    const main = await eventWithTickets(request, org, "scan", [{ name: "Standard", priceCfa: 1000, quantity: 10 }]);
    const other = await eventWithTickets(request, org, "scan-autre", [{ name: "Standard", priceCfa: 1000, quantity: 10 }]);
    const good = await seedTicket(main.id, main.typeIds["Standard"]!, "PAID", "Awa Entrée");
    const elsewhere = await seedTicket(other.id, other.typeIds["Standard"]!, "PAID", "Autre Soirée");
    const unpaid = await seedTicket(main.id, main.typeIds["Standard"]!, "RESERVED", "Pas Payé");

    await loginInBrowser(page, org.email);
    await page.goto(`/dashboard/events/${main.id}/tickets/scan`);
    await expect(page.getByRole("heading", { name: "Scanner les entrées" })).toBeVisible();
    const manual = page.getByLabel("Lien du billet");
    const check = page.getByRole("button", { name: "Vérifier" });
    const next = page.getByRole("status").filter({ hasText: "Touchez pour scanner le suivant" });

    await manual.fill(`http://127.0.0.1${good.url}`);
    await check.click();
    await expect(page.getByText("Entrée validée")).toBeVisible();
    await expect(page.getByText("Awa Entrée")).toBeVisible();
    await expect(page.getByText("1 entrée", { exact: true })).toBeVisible();
    await next.click();

    await manual.fill(good.url);
    await check.click();
    await expect(page.getByText("Refusé", { exact: true })).toBeVisible();
    await expect(page.getByText(/déjà été utilisé \(le /)).toBeVisible();
    await next.click();

    await manual.fill(elsewhere.url);
    await check.click();
    await expect(page.getByText(/pour un autre événement/)).toBeVisible();
    await next.click();

    await manual.fill(unpaid.url);
    await check.click();
    await expect(page.getByText("Pas encore payé", { exact: true })).toBeVisible();
    await next.click();

    await manual.fill("https://exemple.com/promo");
    await check.click();
    await expect(page.getByText("Ce QR code n'est pas un billet de la plateforme.")).toBeVisible();
    await expect(page.getByText("1 entrée", { exact: true })).toBeVisible();
  });

  test("un organisateur ne peut pas valider le billet d'un autre organisateur", async ({ request }) => {
    const owner = await registerOrganizer(request, "proprio");
    const intruder = await registerOrganizer(request, "intrus");
    const { id, typeIds } = await eventWithTickets(request, owner, "proprio", [{ name: "Standard", priceCfa: 1000, quantity: 10 }]);
    const intruderEvent = await eventWithTickets(request, intruder, "intrus", []);
    const ticket = await seedTicket(id, typeIds["Standard"]!, "PAID", "Protégé");

    const res = await request.post(`${apiBaseUrl}/tickets/validate`, {
      headers: intruder.headers,
      data: { ticketId: ticket.id, secret: ticket.secret, eventId: intruderEvent.id }
    });
    expect(res.status()).toBe(404);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("PAID");
  });
});
