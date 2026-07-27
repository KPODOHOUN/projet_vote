import { test } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

test("UserRole expose PLATFORM_SUPER_ADMIN", () => {
  assert.equal(UserRole.PLATFORM_SUPER_ADMIN, "PLATFORM_SUPER_ADMIN");
});
