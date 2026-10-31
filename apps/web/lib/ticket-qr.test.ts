import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseTicketQr } from "./ticket-qr";

test("QR d'un billet : identifiant et secret extraits, lien complet ou relatif", () => {
  assert.deepEqual(parseTicketQr("https://shadoma.app/t/cm1abcdef123?s=Zx_-9"), { ticketId: "cm1abcdef123", secret: "Zx_-9" });
  assert.deepEqual(parseTicketQr("  /t/cm1abcdef123?s=abc  "), { ticketId: "cm1abcdef123", secret: "abc" });
});

test("tout autre QR est ignoré", () => {
  for (const raw of ["", "bonjour", "https://evil.com/phish", "https://shadoma.app/t/cm1abcdef123", "https://x.app/e/miss?s=1", "https://x.app/t/../admin?s=1"]) {
    assert.equal(parseTicketQr(raw), null, raw);
  }
});
