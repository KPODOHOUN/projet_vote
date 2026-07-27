import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../auth/roles.decorator";
import { OrganizerSecretsController } from "./organizer-secrets.controller";

// Résout les rôles autorisés pour une méthode EXACTEMENT comme RolesGuard :
// override méthode > classe (getAllAndOverride).
const reflector = new Reflector();
function rolesFor(method: keyof OrganizerSecretsController): UserRole[] {
  const handler = OrganizerSecretsController.prototype[method] as (...args: unknown[]) => unknown;
  return (
    reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [handler, OrganizerSecretsController]) ?? []
  );
}

// Les endpoints qui manipulent la VALEUR d'un secret PSP (clé marchande qui
// encaisse l'argent des votes) doivent être réservés à l'owner + admin. Un
// ORGANIZER_STAFF ne doit jamais pouvoir lire ni écrire ces clés (il pourrait
// détourner les fonds vers un compte tiers).
const SECRET_VALUE_ENDPOINTS: Array<keyof OrganizerSecretsController> = [
  "saveSecret",
  "saveEventSecret",
  "getSecret",
  "getEventSecret"
];

for (const endpoint of SECRET_VALUE_ENDPOINTS) {
  test(`RBAC: ${String(endpoint)} interdit à ORGANIZER_STAFF`, () => {
    const roles = rolesFor(endpoint);
    assert.equal(roles.includes(UserRole.ORGANIZER_STAFF), false, `${String(endpoint)} accepte STAFF`);
    assert.equal(roles.includes(UserRole.ORGANIZER_OWNER), true);
    assert.equal(roles.includes(UserRole.PLATFORM_ADMIN), true);
  });
}

// Les endpoints de STATUT (booléen configuré/masqué, jamais la valeur) restent
// lisibles par le staff — il peut voir si le paiement est prêt sans voir la clé.
const STATUS_ENDPOINTS: Array<keyof OrganizerSecretsController> = [
  "getPaymentSetupStatus",
  "getSecretStatus",
  "getEventSecretStatus"
];

for (const endpoint of STATUS_ENDPOINTS) {
  test(`RBAC: ${String(endpoint)} reste accessible à ORGANIZER_STAFF`, () => {
    const roles = rolesFor(endpoint);
    assert.equal(roles.includes(UserRole.ORGANIZER_STAFF), true, `${String(endpoint)} refuse STAFF`);
  });
}
