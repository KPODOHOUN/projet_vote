import { test } from "node:test";
import * as assert from "node:assert/strict";
import { defaultTicketDesign, fillTicketText, isBlankDesign, isUnrenderableImage, layersToRender, renderableImageUrl, ticketNumber, type TicketDesign } from "./ticket-design";

const values = {
  ticketId: "cm1abcdefghijk12345678",
  holderName: "Awa Kouassi",
  ticketTypeName: "VIP",
  eventTitle: "Miss Campus 2026",
  eventStartsAt: "2026-12-12T19:00:00.000Z",
  amountCfa: 15000
};

test("les champs du billet sont remplis avec les informations de l'acheteur", () => {
  assert.equal(fillTicketText("{{titulaire}} — {{billet}}", values), "Awa Kouassi — VIP");
  assert.equal(fillTicketText("{{prix}}", values), "15 000 FCFA");
  assert.equal(fillTicketText("N° {{numero}}", values), `N° ${ticketNumber(values.ticketId)}`);
  assert.match(fillTicketText("{{date}}", values), /12 décembre 2026/);
  assert.equal(fillTicketText("{{ TITULAIRE }}", { ...values, holderName: null }), "Invité");
  assert.equal(fillTicketText("{{inconnu}}", values), "{{inconnu}}");
});

test("un design sans QR code reçoit quand même un QR code", () => {
  const design: TicketDesign = {
    width: 600, height: 300, background: { type: "color", value: "#000000" }, backgroundImage: "/api/v1/uploads/files/x.png",
    layers: [{ id: "t", type: "text", content: "Hello", x: 0, y: 0, width: 100, height: 20, zIndex: 1, visible: true, style: {} }]
  };
  const qr = layersToRender(design).filter((l) => l.type === "qr");
  assert.equal(qr.length, 1);
  assert.ok(qr[0]!.x + qr[0]!.width <= design.width && qr[0]!.y + qr[0]!.height <= design.height);
  assert.equal(layersToRender(defaultTicketDesign()).filter((l) => l.type === "qr").length, 1);
});

test("un billet jamais dessiné utilise le billet par défaut", () => {
  assert.ok(isBlankDesign(null));
  assert.ok(isBlankDesign({ width: 600, height: 300, background: { type: "color", value: "#fff" }, backgroundImage: null, layers: [] }));
  assert.ok(!isBlankDesign(defaultTicketDesign()));
});

test("le rendu serveur ne charge que les images de la plateforme et de Cloudinary", () => {
  const api = "https://api.shadoma.test";
  assert.equal(renderableImageUrl("/api/v1/uploads/files/abc.png", api), `${api}/api/v1/uploads/files/abc.png`);
  assert.equal(renderableImageUrl("https://res.cloudinary.com/demo/image/upload/a.jpg", api), "https://res.cloudinary.com/demo/image/upload/a.jpg");
  for (const url of ["http://169.254.169.254/latest", "https://evil.com/a.png", "/api/v1/../admin", "http://res.cloudinary.com/a.png", "file:///etc/passwd"]) {
    assert.equal(renderableImageUrl(url, api), null, url);
  }
});

test("une image WebP est signalée : le rendu du billet ne sait pas la lire", () => {
  assert.ok(isUnrenderableImage("/api/v1/uploads/files/abc.webp"));
  assert.ok(isUnrenderableImage("https://res.cloudinary.com/demo/image/upload/a.WEBP?x=1"));
  assert.ok(!isUnrenderableImage("/api/v1/uploads/files/abc.png"));
  assert.ok(!isUnrenderableImage(null));
});

test("numéro du billet : « 0042 » une fois payé, sinon la fin de l'identifiant", () => {
  assert.equal(fillTicketText("N° {{numero}}", { ...values, number: 42 }), "N° 0042");
  assert.equal(fillTicketText("N° {{numero}}", { ...values, number: null }), `N° ${ticketNumber(values.ticketId)}`);
});
