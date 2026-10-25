import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash } from "crypto";
import type { Response } from "express";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

const MAX_BYTES = 5 * 1024 * 1024;
const SAFE_FILENAME = /^[a-f0-9]{32}\.(jpe?g|png|webp|gif|bmp)$/i;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp"
};

const MAGIC_BYTES: Record<string, [number, readonly number[]][]> = {
  "image/jpeg": [[0, [0xFF, 0xD8]]],
  "image/png": [[0, [0x89, 0x50, 0x4E, 0x47]]],
  "image/webp": [[0, [0x52, 0x49, 0x46, 0x46]]],
  "image/gif": [[0, [0x47, 0x49, 0x46]]],
  "image/bmp": [[0, [0x42, 0x4D]]]
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp"
};

export type UploadedImageFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class UploadsService {
  private readonly folder = "candidates";
  // Anciens fichiers posés sur disque en développement : encore servis s'ils existent.
  private readonly localDir = join(process.cwd(), ".data", "uploads");

  constructor(private readonly prisma: PrismaService) {}

  /** Signature Cloudinary : sha1(params triés "k=v"&… + api_secret). Pure/testable. */
  static computeSignature(params: Record<string, string | number>, apiSecret: string): string {
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha1").update(toSign + apiSecret).digest("hex");
  }

  isCloudinaryConfigured(): boolean {
    return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  }

  /**
   * Signe un upload Cloudinary (folder + timestamp). Le fichier ne transite pas
   * par l'API : le navigateur uploade directement avec cette signature. 503 si
   * les creds ne sont pas configurées (l'app reste utilisable via coller-URL).
   */
  signUpload(): UploadSignature {
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException("Upload non configuré.");
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = UploadsService.computeSignature({ folder: this.folder, timestamp }, apiSecret);
    return { cloudName, apiKey, timestamp, folder: this.folder, signature };
  }

  /**
   * Import sans Cloudinary, dans tous les environnements : le fichier transite
   * par l'API et est stocké en base (table StoredImage), sans service de
   * fichiers externe. Type vérifié par signature binaire (JPEG, PNG, WebP, GIF,
   * BMP ; SVG refusé). Renvoie une URL relative `/api/v1/uploads/files/{id}.{ext}`,
   * servie par l'API et par le proxy Next.js.
   */
  async storeDirectUpload(file: UploadedImageFile | undefined, tenantId: string | null): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Fichier image requis.");
    }
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      throw new BadRequestException("L'image doit faire 5 Mo maximum.");
    }

    const ext = MIME_TO_EXT[file.mimetype];
    const magic = MAGIC_BYTES[file.mimetype];
    if (!ext || !magic) {
      throw new BadRequestException("Format d'image non pris en charge.");
    }
    const match = magic.some(([offset, sig]) => sig.every((b, i) => file.buffer[offset + i] === b));
    if (!match) {
      throw new BadRequestException("Le fichier ne correspond pas au format d'image déclaré.");
    }

    const id = randomBytes(16).toString("hex");
    await this.prisma.client.storedImage.create({
      data: { id, tenantId, mime: file.mimetype, size: file.buffer.length, bytes: new Uint8Array(file.buffer) }
    });
    return { url: `/api/v1/uploads/files/${id}${ext}` };
  }

  async serveLocalFile(filename: string, response: Response): Promise<void> {
    if (!SAFE_FILENAME.test(filename)) {
      throw new NotFoundException();
    }
    const id = filename.slice(0, 32).toLowerCase();
    const stored = await this.prisma.client.storedImage.findUnique({ where: { id } });
    let mime: string | undefined = stored?.mime;
    let bytes: Buffer | undefined = stored ? Buffer.from(stored.bytes) : undefined;

    if (!bytes) {
      // Repli : fichier posé sur disque par l'ancien import de développement.
      const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
      mime = EXT_TO_MIME[ext];
      if (!mime) throw new NotFoundException();
      try {
        bytes = await readFile(join(this.localDir, filename));
      } catch {
        throw new NotFoundException();
      }
    }

    response.setHeader("Content-Type", mime!);
    response.setHeader("X-Content-Type-Options", "nosniff");
    // Contenu immuable : l'identifiant change à chaque import.
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.send(bytes);
  }
}
