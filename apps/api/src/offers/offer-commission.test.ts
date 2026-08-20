import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OFFER1_COMMISSION_BPS,
  DEFAULT_OFFER1_COMMISSION_FIXED_CFA,
  type OfferSettings
} from "./offer-settings.service";

function computeExternalCommissionCfa(
  settings: Pick<OfferSettings, "offer1CommissionBps" | "offer1CommissionFixedCfa">,
  amountCfa: number
): number {
  return Math.floor((amountCfa * settings.offer1CommissionBps) / 10_000) + settings.offer1CommissionFixedCfa;
}

test("commission External = bps + fixe", () => {
  const settings = {
    offer1CommissionBps: DEFAULT_OFFER1_COMMISSION_BPS,
    offer1CommissionFixedCfa: DEFAULT_OFFER1_COMMISSION_FIXED_CFA
  };
  assert.equal(computeExternalCommissionCfa(settings, 10_000), 1000);
  assert.equal(
    computeExternalCommissionCfa({ offer1CommissionBps: 500, offer1CommissionFixedCfa: 50 }, 10_000),
    550
  );
});
