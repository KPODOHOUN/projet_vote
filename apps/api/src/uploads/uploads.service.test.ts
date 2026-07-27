import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { UploadsService, type UploadedImageFile } from "./uploads.service";

test("computeSignature: sha1 des params triés + secret (protocole Cloudinary)", () => {
  const params = { timestamp: 1_700_000_000, folder: "candidates" };
  const expected = createHash("sha1")
    .update("folder=candidates&timestamp=1700000000" + "the-secret")
    .digest("hex");
  assert.equal(UploadsService.computeSignature(params, "the-secret"), expected);
});

test("signUpload: 503 quand les creds Cloudinary sont absentes (défaut env de test)", () => {
  const service = new UploadsService();
  assert.throws(
    () => service.signUpload(),
    (e) => e instanceof ServiceUnavailableException
  );
});

test("storeDirectUpload: 503 hors développement", async () => {
  const service = new UploadsService();
  await assert.rejects(
    () =>
      service.storeDirectUpload({
        buffer: Buffer.from("fake"),
        size: 4,
        mimetype: "image/png",
        originalname: "x.png"
      } as UploadedImageFile),
    (e) => e instanceof ServiceUnavailableException
  );
});
