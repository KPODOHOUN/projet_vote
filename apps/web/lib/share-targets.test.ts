import assert from "node:assert/strict";
import test from "node:test";
import { buildShareTargets, SHARE_TARGET_ORDER } from "./share-targets";

const input = {
  url: "https://votes.example/e/miss-campus/c/ab12?x=1&y=2",
  text: "Vote pour Aïcha au concours Miss Campus : https://votes.example/e/miss-campus/c/ab12?x=1&y=2",
  title: "Aïcha Dossou · Miss Campus"
};

test("partage : une cible par réseau, dans l'ordre affiché", () => {
  const targets = buildShareTargets(input);
  assert.deepEqual(
    targets.map((t) => t.id),
    SHARE_TARGET_ORDER
  );
});

test("partage : liens d'intention officiels, paramètres encodés", () => {
  const byId = Object.fromEntries(buildShareTargets(input).map((t) => [t.id, t]));
  const enc = encodeURIComponent;
  assert.equal(byId.whatsapp!.href, `https://wa.me/?text=${enc(input.text)}`);
  assert.equal(byId.facebook!.href, `https://www.facebook.com/sharer/sharer.php?u=${enc(input.url)}`);
  assert.equal(byId.telegram!.href, `https://t.me/share/url?url=${enc(input.url)}&text=${enc(input.title)}`);
  assert.equal(byId.x!.href, `https://x.com/intent/tweet?text=${enc(input.title)}&url=${enc(input.url)}`);
  assert.equal(byId.linkedin!.href, `https://www.linkedin.com/sharing/share-offsite/?url=${enc(input.url)}`);
  assert.equal(byId.reddit!.href, `https://www.reddit.com/submit?url=${enc(input.url)}&title=${enc(input.title)}`);
  assert.equal(byId.threads!.href, `https://www.threads.net/intent/post?text=${enc(input.text)}`);
  assert.equal(byId.bluesky!.href, `https://bsky.app/intent/compose?text=${enc(input.text)}`);
  assert.equal(byId.messenger!.href, `fb-messenger://share/?link=${enc(input.url)}`);
  assert.equal(byId.email!.href, `mailto:?subject=${enc(input.title)}&body=${enc(input.text)}`);
  assert.equal(byId.sms!.href, `sms:?&body=${enc(input.text)}`);
  // Aucun « & » brut de l'URL partagée ne fuit dans le lien d'intention.
  assert.ok(!byId.facebook!.href!.includes("x=1&y=2"));
});

test("partage : Instagram, TikTok et Snapchat n'ont pas de lien web → partage natif / copie", () => {
  const byId = Object.fromEntries(buildShareTargets(input).map((t) => [t.id, t]));
  for (const id of ["instagram", "tiktok", "snapchat"]) {
    assert.equal(byId[id]!.href, null, id);
    assert.equal(byId[id]!.via, "native", id);
  }
  assert.equal(byId.messenger!.mobileOnly, true);
});
