import { test } from "node:test";
import * as assert from "node:assert/strict";
import { getVotePhase, type VotePhase } from "./vote-phase";

const startsAt = "2026-11-01T10:00:00.000Z";
const endsAt = "2026-11-10T18:00:00.000Z";
const at = (iso: string) => new Date(iso);

test("vote-phase : table aux bornes exactes", () => {
  const cases: Array<[string, string, VotePhase]> = [
    ["ACTIVE", "2026-11-01T09:59:59.999Z", "upcoming"],
    ["ACTIVE", startsAt, "open"],
    ["ACTIVE", "2026-11-05T12:00:00.000Z", "open"],
    ["ACTIVE", endsAt, "open"],
    ["ACTIVE", "2026-11-10T18:00:00.001Z", "ended"],
    ["CLOSED", "2026-11-05T12:00:00.000Z", "closed"],
    ["ARCHIVED", "2026-11-05T12:00:00.000Z", "closed"],
    ["DRAFT", "2026-11-05T12:00:00.000Z", "draft"]
  ];
  for (const [status, now, expected] of cases) {
    assert.equal(getVotePhase({ status, startsAt, endsAt }, at(now)), expected, `${status} @ ${now}`);
  }
});

test("vote-phase : statut inattendu ou dates invalides ne promettent jamais un vote ouvert", () => {
  const now = at("2026-11-05T12:00:00.000Z");
  assert.equal(getVotePhase({ status: "PAUSED", startsAt, endsAt }, now), "draft");
  assert.equal(getVotePhase({ status: "", startsAt, endsAt }, now), "draft");
  assert.equal(getVotePhase({ status: "active", startsAt, endsAt }, now), "open");
  assert.equal(getVotePhase({ status: "ACTIVE", startsAt: "pas une date", endsAt }, now), "draft");
  assert.equal(getVotePhase({ status: "ACTIVE", startsAt, endsAt: null }, now), "draft");
});
