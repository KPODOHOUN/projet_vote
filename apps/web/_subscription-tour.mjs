import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUT = "/home/triple-v/Documents/Projets Personnels/Plateforme de vote/apps/web/test-results/subscription-tour";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const VW = 1280, VH = 800;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;

async function mark(label) {
  step++;
  console.log(`[TOUR STEP ${step}] ${label}`);
}

async function run() {
  console.log("Launching browser using local /usr/bin/google-chrome...");
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader"
    ]
  });

  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    recordVideo: { dir: OUT, size: { width: VW, height: VH } },
    locale: "fr-FR"
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  try {
    // 1. Organizer Login
    await mark("Connexion en tant qu'Organisateur");
    await page.goto(`${BASE}/?auth=login`, { waitUntil: "load" });
    await pause(3000); // Allow modal to animate open
    await page.locator("#email").fill("organisateur@demovote.africa");
    await page.locator("#password").fill("SecurePass123!");
    await pause(500);
    await page.click("button:has-text('Se connecter')", { force: true });
    await page.waitForSelector("a[href*='/subscription']", { timeout: 40000 });
    await pause(2000);
    try {
      await page.click("button:has-text('Tout accepter')", { timeout: 3000 });
      await pause(1000);
      console.log("Cookie banner accepted on dashboard.");
    } catch (e) {
      console.log("Cookie banner not found on dashboard.");
    }

    // 2. Dashboard warning banner
    await mark("Vérification de la bannière dynamique 'Aucun abonnement actif'");
    const warningBanner = await page.locator("text=Aucun abonnement actif").isVisible();
    console.log("Alerte abonnement visible:", warningBanner);

    // 3. Mon abonnement page
    await mark("Navigation vers l'onglet 'Mon abonnement'");
    await page.goto(`${BASE}/dashboard/subscription`, { waitUntil: "load" });
    await pause(2000);

    // 4. Subscribe page (pricing grid)
    await mark("Clic sur 'Formules Standard' et sélection d'un forfait");
    await page.click("a[href*='/subscription/subscribe']", { force: true });
    await page.waitForSelector("h1:has-text('abonnement Standard')", { timeout: 15000 });
    await pause(2000);

    // 5. Checkout
    await mark("Achat du forfait Standard (3 Mois)");
    await page.click("text=3 Mois", { force: true });
    await pause(1000);
    await page.click("button:has-text('Passer au paiement')", { force: true });
    await pause(2000);

    // Fill payment fields
    await page.locator("#payerPhone").fill("+22997000000");
    await page.locator("select").selectOption("mtn");
    await pause(1000);
    await page.click("button:has-text('Payer via Mobile Money')", { force: true });

    await mark("Attente de la confirmation automatique du paiement (Mode Démo)...");
    await page.waitForSelector("h1:has-text('Mon abonnement')", { timeout: 20000 });
    await pause(3000);

    // 6. Verify Standard Plan is active
    await mark("Vérification de l'activation du plan Standard");
    const planText = await page.locator("text=Standard").isVisible();
    console.log("Plan Standard activé:", planText);
    await pause(2000);

    // 7. Partnership request
    await mark("Navigation vers le formulaire de partenariat");
    await page.goto(`${BASE}/dashboard/subscription/partner`, { waitUntil: "load" });
    await pause(2000);

    await mark("Remplissage de la demande de partenariat");
    await page.locator("#reason").fill("Nous organisons des votes nationaux réguliers et souhaitons bénéficier de l'offre partenaire.");
    await page.locator("#signedFullName").fill("Demo Vote Organizer");
    await page.locator("#acceptTerms").click({ force: true });
    await pause(1000);
    await page.click("button:has-text('Signer et soumettre la demande')", { force: true });
    await page.waitForSelector("h1:has-text('Mon abonnement')", { timeout: 15000 });
    await pause(2500);

    // 8. Logout
    await mark("Déconnexion de l'organisateur");
    await page.goto(`${BASE}/?auth=login`, { waitUntil: "load" });
    await pause(2000);

    // 9. Login as Admin
    await mark("Connexion en tant qu'Administrateur Plateforme");
    await page.locator("#email").fill("admin@shadoma.africa");
    await page.locator("#password").fill("SecurePass123!");
    await pause(500);
    await page.click("button:has-text('Se connecter')", { force: true });
    await page.waitForSelector("a[href*='/admin/subscriptions']", { timeout: 15000 });
    await pause(2000);

    // 10. Admin Pricing Grid Edit
    await mark("Administration : Modification de la grille tarifaire standard");
    await page.goto(`${BASE}/admin/subscriptions`, { waitUntil: "load" });
    await pause(2000);
    const priceInput = await page.locator('input[type="number"]').first();
    await priceInput.fill("6000");
    await pause(1000);
    await page.click("button:has-text('Enregistrer les tarifs')", { force: true });
    await pause(2000);

    // 11. Admin Partnership Request Review
    await mark("Administration : Approbation de la demande de partenariat");
    await page.goto(`${BASE}/admin/account-partners`, { waitUntil: "load" });
    await pause(2000);
    await page.click("button:has-text('Approuver')", { force: true });
    await pause(1500);

    // Negotiated commission rate override
    await page.locator("#commissionBps").fill("2000");
    await page.locator("#note").fill("Contrat validé");
    await pause(1000);
    await page.click("button:has-text('Approuver et activer')", { force: true });
    await pause(3000);

    // 12. Logout admin
    await mark("Déconnexion de l'administrateur");
    await page.goto(`${BASE}/?auth=login`, { waitUntil: "load" });
    await pause(2000);

    // 13. Re-login as organizer to check final state
    await mark("Re-connexion en tant qu'organisateur");
    await page.locator("#email").fill("organisateur@demovote.africa");
    await page.locator("#password").fill("SecurePass123!");
    await pause(500);
    await page.click("button:has-text('Se connecter')", { force: true });
    await page.waitForSelector("a[href*='/subscription']", { timeout: 15000 });
    await pause(1500);

    await page.goto(`${BASE}/dashboard/subscription`, { waitUntil: "load" });
    await mark("Vérification finale du forfait 'Partenaire Plateforme' actif");
    await pause(3000);

  } catch (error) {
    console.error("Erreur durant le tour de validation:", error);
    try {
      const screenshotPath = path.join(OUT, "failure-screenshot.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Capture d'écran de l'erreur enregistrée sous: ${screenshotPath}`);
    } catch (scrErr) {
      console.error("Impossible de prendre la capture d'écran:", scrErr);
    }
  } finally {
    const video = page.video();
    if (video) {
      const videoPath = await video.path();
      console.log(`Video enregistrée avec succès sous: ${videoPath}`);
      const destPath = path.join(OUT, "subscription-tour.webm");
      fs.copyFileSync(videoPath, destPath);
      console.log(`Vidéo copiée sous: ${destPath}`);
    }
    await context.close();
    await browser.close();
    console.log("Tour de validation terminé.");
  }
}

run();
