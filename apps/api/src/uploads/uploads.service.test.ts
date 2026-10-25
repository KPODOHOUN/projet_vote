import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "crypto";
import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService, type UploadedImageFile } from "./uploads.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const service = new UploadsService(new PrismaService());

// Plus petit PNG valide (1×1, transparent).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);

function file(buffer: Buffer, mimetype: string, originalname = "photo"): UploadedImageFile {
  return { buffer, size: buffer.length, mimetype, originalname };
}

/** Réponse Express minimale : enregistre en-têtes et corps. */
function fakeResponse() {
  const headers: Record<string, string> = {};
  let body: Buffer | undefined;
  return {
    headers,
    get body() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    send(payload: Buffer) {
      body = payload;
    }
  };
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("computeSignature: sha1 des params triés + secret (protocole Cloudinary)", () => {
  const params = { timestamp: 1_700_000_000, folder: "candidates" };
  const expected = createHash("sha1")
    .update("folder=candidates&timestamp=1700000000" + "the-secret")
    .digest("hex");
  assert.equal(UploadsService.computeSignature(params, "the-secret"), expected);
});

test("signUpload: 503 quand les creds Cloudinary sont absentes (défaut env de test)", () => {
  assert.throws(
    () => service.signUpload(),
    (e) => e instanceof ServiceUnavailableException
  );
});

test("import sans Cloudinary : l'image est stockée en base (tous environnements) et resservie telle quelle", async () => {
  const { url } = await service.storeDirectUpload(file(PNG, "image/png"), "tenant-1");
  const match = /^\/api\/v1\/uploads\/files\/([a-f0-9]{32})\.png$/.exec(url);
  assert.ok(match, url);

  const stored = await prisma.storedImage.findUnique({ where: { id: match[1]! } });
  assert.equal(stored?.mime, "image/png");
  assert.equal(stored?.tenantId, "tenant-1");
  assert.equal(stored?.size, PNG.length);

  const res = fakeResponse();
  await service.serveLocalFile(url.split("/").pop()!, res as never);
  assert.deepEqual(res.body, PNG);
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.match(res.headers["cache-control"] ?? "", /immutable/);
});

test("import : contenu qui ne correspond pas au type déclaré, SVG et fichier vide refusés", async () => {
  await assert.rejects(
    () => service.storeDirectUpload(file(Buffer.from("<script>alert(1)</script>"), "image/png"), "t"),
    (e) => e instanceof BadRequestException
  );
  await assert.rejects(
    () => service.storeDirectUpload(file(Buffer.from("<svg onload=alert(1)>"), "image/svg+xml"), "t"),
    (e) => e instanceof BadRequestException
  );
  await assert.rejects(
    () => service.storeDirectUpload(file(Buffer.alloc(0), "image/png"), "t"),
    (e) => e instanceof BadRequestException
  );
  assert.equal(await prisma.storedImage.count(), 0);
});

test("service des fichiers : nom invalide ou inconnu → 404", async () => {
  await assert.rejects(() => service.serveLocalFile("../../etc/passwd", fakeResponse() as never), (e) => e instanceof NotFoundException);
  await assert.rejects(
    () => service.serveLocalFile(`${"a".repeat(32)}.png`, fakeResponse() as never),
    (e) => e instanceof NotFoundException
  );
});
