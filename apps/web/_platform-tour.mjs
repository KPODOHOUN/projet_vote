import { chromium } from "@playwright/test";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const OUT = process.env.TOUR_OUT ||
  "/home/triple-v/Documents/Projets Personnels/Plateforme de vote/.tour-video";
const FINAL_VIDEO = "/home/triple-v/Documents/Projets Personnels/Plateforme de vote/platform-tour.mp4";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const VW = 1366, VH = 800;
const ts = Date.now();

const ORG = { email: "organisateur@demovote.africa", password: "SecurePass123!" };
const ADMIN = { email: "admin@shadoma.africa", password: "SecurePass123!" };
const DEMO_EVENT = "miss-campus-2026";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
async function mark(label) {
  step++;
  console.log(`STEP ${step}: ${label}`);
}
async function tour(page, downMs = 2400) {
  await page.evaluate(async (dur) => {
    const h = document.body.scrollHeight - window.innerHeight;
    if (h <= 0) return;
    const t0 = performance.now();
    await new Promise((res) => {
      function fr(t) {
        const p = Math.min((t - t0) / dur, 1);
        window.scrollTo(0, h * (0.5 - Math.cos(Math.PI * p) / 2));
        if (p < 1) requestAnimationFrame(fr); else res();
      }
      requestAnimationFrame(fr);
    });
  }, downMs).catch(() => {});
  await pause(350);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })).catch(() => {});
  await pause(500);
}
async function safe(name, fn) {
  try { await fn(); } catch (e) { console.log(`  ! ${name} skipped: ${String(e).split("\n")[0]}`); }
}

function isPageDead(page) {
  return page.isClosed();
}

async function ensurePage(context, getAuthFn) {
  const page = await context.newPage();
  if (getAuthFn) {
    try { await getAuthFn(page); } catch {}
  }
  return page;
}

async function visit(page, path, label, downMs = 2200) {
  await mark(label);
  await safe(`goto ${path}`, async () => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 20000 });
    await pause(900);
    await tour(page, downMs);
  });
}

async function loginAs(page, creds) {
  const res = await page.request.post(`${BASE}/api/v1/auth/login`, {
    data: { email: creds.email, password: creds.password }
  });
  if (!res.ok()) throw new Error(`login ${creds.email} -> ${res.status()}`);
  const { accessToken } = await res.json();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((tok) => {
    window.localStorage.setItem("vp.organizer.token", tok);
  }, accessToken);
  return accessToken;
}

const videoPaths = [];

async function runSection(name, fn) {
  console.log(`\n=== ${name} ===`);
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: VW, height: VH },
      recordVideo: { dir: OUT, size: { width: VW, height: VH } },
      locale: "fr-FR"
    });
    let page = await context.newPage();

    // fn receives a { page, context } proxy that auto-recovers dead pages
    const proxy = {
      get page() { return page; },
      context,
      async recover(getAuthFn) {
        if (isPageDead(page)) {
          page = await context.newPage();
          if (getAuthFn) {
            try { await getAuthFn(page); } catch {}
          }
          console.log(`  [recovered new page]`);
        }
      }
    };

    await fn(proxy);
    try { videoPaths.push(await page.video().path()); } catch {}
    await context.close();
  } catch (e) {
    console.log(`  ! ${name} error (recovering): ${String(e).split("\n")[0]}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ===========================================================================
// PART 1 — PUBLIC SURFACE (no auth)
// ===========================================================================
await runSection("PART 1 — PUBLIC", async ({ page: p, context, recover }) => {
  async function v(path, label, downMs) {
    await recover();
    await visit(p, path, label, downMs);
  }

  await mark("Accueil (home)");
  await p.goto(BASE, { waitUntil: "networkidle" });
  await pause(1200);
  await safe("cookie-accept", async () => {
    await p.getByRole("button", { name: /Tout accepter|Accept all/ }).click({ timeout: 4000 });
    await pause(500);
  });
  await tour(p, 3200);

  await safe("lang toggle", async () => {
    await mark("Bascule de langue EN ↔ FR");
    await p.getByRole("button", { name: "EN", exact: true }).click({ timeout: 3000 });
    await pause(1200);
    await p.getByRole("button", { name: "FR", exact: true }).click({ timeout: 3000 });
    await pause(800);
  });

  await v("/privacy", "Politique de confidentialité");
  await v("/cookies", "Politique cookies");
  await v("/terms", "Conditions d'utilisation (terms)");
  await v("/legal", "Mentions légales (legal)");

  await v("/register", "Inscription organisateur (/register)");
  await v("/login", "Connexion (/login → modal)");
  await v("/forgot-password", "Mot de passe oublié");
  await v("/check-email", "Vérification e-mail (check-email)");
  await v("/verify-email", "Confirmation e-mail (verify-email)");
  await v("/reset-password", "Réinitialisation du mot de passe");
  await v("/accept-invitation", "Acceptation d'invitation");

  await v(`/e/${DEMO_EVENT}`, `Évènement public /e/${DEMO_EVENT}`, 2800);
  await v(`/e/${DEMO_EVENT}/c/1`, "Profil candidat + formulaire de vote", 2400);
  await v(`/e/${DEMO_EVENT}/results`, "Classement public (résultats)", 2600);
  await v("/vote", "Hub de vote (legacy /vote)");
  await v(`/vote/demo-vote`, "Vote — liste évènements du tenant");
  await v(`/vote/demo-vote/${DEMO_EVENT}`, "Parcours votant (legacy)", 2400);
});

// ===========================================================================
// PART 2 — ORGANIZER DASHBOARD (authenticated)
// ===========================================================================
await runSection("PART 2 — ORGANIZER", async ({ page: p, context, recover }) => {
  let authFn = null;

  await safe("login organizer", async () => {
    await mark("Connexion organisateur (session)");
    const tok = await loginAs(p, ORG);
    authFn = async (pg) => {
      await pg.goto(BASE, { waitUntil: "domcontentloaded" });
      await pg.evaluate((t) => { window.localStorage.setItem("vp.organizer.token", t); }, tok);
    };
    await pause(600);
  });

  async function v(path, label, downMs) {
    await recover(authFn);
    await visit(p, path, label, downMs);
  }

  await v("/dashboard", "Dashboard organisateur", 2000);
  await v("/dashboard/start", "Démarrage rapide (start)");
  await v("/dashboard/events", "Liste des évènements");
  await v("/dashboard/events/new", "Créer un évènement");

  await recover(authFn);
  await safe("event subpages", async () => {
    await p.goto(`${BASE}/dashboard/events`, { waitUntil: "networkidle" });
    await pause(800);
    const link = p.locator('a[href*="/dashboard/events/"]').first();
    const href = await link.getAttribute("href").catch(() => null);
    if (href) {
      const id = href.split("/dashboard/events/")[1]?.split("/")[0];
      if (id) {
        await visit(p, `/dashboard/events/${id}`, "Détail évènement (organisateur)");
        await recover(authFn);
        await visit(p, `/dashboard/events/${id}/edit`, "Édition évènement");
        await recover(authFn);
        await visit(p, `/dashboard/events/${id}/candidates`, "Gestion des candidats");
        await recover(authFn);
        await safe("design page", async () => {
          await mark("Apparence / design évènement");
          await p.goto(`${BASE}/dashboard/events/${id}/design`, {
            waitUntil: "domcontentloaded",
            timeout: 10000
          });
          await pause(1200);
          await tour(p, 1600);
        });
      }
    }
  });

  const dashRoutes = [
    ["/dashboard/subscription", "Abonnement — aperçu"],
    ["/dashboard/subscription/subscribe", "Abonnement — souscrire (Standard)"],
    ["/dashboard/subscription/partner", "Abonnement — devenir Partenaire"],
    ["/dashboard/team", "Équipe / membres"],
    ["/dashboard/notifications", "Notifications"],
    ["/dashboard/search", "Recherche"],
    ["/dashboard/account", "Compte / profil"],
  ];
  for (const [path, label] of dashRoutes) {
    await recover(authFn);
    await v(path, label);
  }
});

// ===========================================================================
// PART 3 — PLATFORM ADMIN (god-mode, authenticated as admin)
// ===========================================================================
await runSection("PART 3 — ADMIN", async ({ page: p, context, recover }) => {
  let authFn = null;

  await safe("login admin", async () => {
    await mark("Connexion admin plateforme (session)");
    const tok = await loginAs(p, ADMIN);
    authFn = async (pg) => {
      await pg.goto(BASE, { waitUntil: "domcontentloaded" });
      await pg.evaluate((t) => { window.localStorage.setItem("vp.organizer.token", t); }, tok);
    };
    await pause(600);
  });

  async function v(path, label, downMs) {
    await recover(authFn);
    await visit(p, path, label, downMs);
  }

  const adminRoutes = [
    ["/admin", "Admin — vue d'ensemble", 2000],
    ["/admin/subscriptions", "Admin — abonnements"],
    ["/admin/account-partners", "Admin — comptes partenaires"],
    ["/admin/partners", "Admin — demandes de partenariat"],
    ["/admin/payments", "Admin — paiements"],
    ["/admin/payouts", "Admin — versements (payouts)"],
    ["/admin/votes", "Admin — votes"],
    ["/admin/users", "Admin — utilisateurs"],
    ["/admin/audit", "Admin — journal d'audit"],
    ["/admin/jobs", "Admin — tâches planifiées (jobs)"],
    ["/admin/feature-flags", "Admin — feature flags"],
    ["/admin/maintenance", "Admin — maintenance"],
    ["/admin/settings", "Admin — paramètres"],
  ];
  for (const [path, label, downMs] of adminRoutes) {
    await recover(authFn);
    await v(path, label, downMs);
  }

  await recover(authFn);
  await mark("Retour accueil — fin sur le footer");
  await p.goto(BASE, { waitUntil: "networkidle" });
  await pause(700);
  await p.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })).catch(() => {});
  await pause(2200);
});

// ===========================================================================
// MERGE VIDEOS
// ===========================================================================
console.log(`\nTOTAL STEPS: ${step}`);
console.log(`VIDEO SEGMENTS: ${videoPaths.length}`);

if (videoPaths.length === 0) {
  console.log("ERROR: No video segments recorded");
  process.exit(1);
} else if (videoPaths.length === 1) {
  fs.copyFileSync(videoPaths[0], FINAL_VIDEO);
} else {
  const concatFile = `${OUT}/concat.txt`;
  const lines = videoPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(concatFile, lines);
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${FINAL_VIDEO}"`,
    { stdio: "inherit" }
  );
}
console.log(`VIDEO_FINAL=${FINAL_VIDEO}`);
