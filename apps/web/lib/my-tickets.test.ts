import { test } from "node:test";
import * as assert from "node:assert/strict";
import { mergeMyTickets, ticketPagePath, whatsappShareUrl, type MyTicket } from "./my-tickets";

const t = (id: string): MyTicket => ({ id, secret: `s-${id}`, holderName: null, ticketTypeName: "VIP", boughtAt: "2026-10-31T10:00:00.000Z" });

test("billets de l'appareil : les nouveaux d'abord, sans doublon, en nombre borné", () => {
  assert.deepEqual(mergeMyTickets([t("a"), t("b")], [t("c"), t("a")]).map((x) => x.id), ["c", "a", "b"]);
  assert.equal(mergeMyTickets([], Array.from({ length: 80 }, (_, i) => t(String(i)))).length, 60);
});

test("liens de partage : page du billet et message WhatsApp prêt à envoyer", () => {
  assert.equal(ticketPagePath("tk 1", "a/b"), "/t/tk%201?s=a%2Fb");
  const url = whatsappShareUrl("https://shadoma.app/t/x?s=y", "Gala 2026", "Awa");
  assert.ok(url.startsWith("https://wa.me/?text="));
  const text = decodeURIComponent(url.split("text=")[1]!);
  assert.match(text, /Bonjour Awa, voici ton billet pour Gala 2026 : https:\/\/shadoma\.app\/t\/x\?s=y/);
});
