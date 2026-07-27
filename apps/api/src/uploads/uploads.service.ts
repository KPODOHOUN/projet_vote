import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  "image/bmp": ".bmp",
  "image/heic": ".heic",
  "image/heif": ".heif"
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
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif"
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
  private readonly localDir = join(process.cwd(), ".data", "uploads");

  /** Signature Cloudinary : sha1(params triés "k=v"&… + api_secret). Pure/testable. */
  static computeSignature(params: Record<string, string | number>, apiSecret: string): string {
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha1").update(toSign + apiSecret).digest("hex");
  }

  isDirectUploadEnabled(): boolean {
    return env.NODE_ENV === "development";
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
   * Upload direct (dev local uniquement) : le fichier transite par l'API et est
   * stocké sur disque. Renvoie une URL relative `/api/v1/uploads/files/...`
   * compatible avec le proxy Next.js.
   */
  async storeDirectUpload(file: UploadedImageFile | undefined): Promise<{ url: string }> {
    if (!this.isDirectUploadEnabled()) {
      throw new ServiceUnavailableException("Upload direct indisponible.");
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Fichier image requis.");
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException("L'image doit faire 5 Mo maximum.");
    }

    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException("Format d'image non pris en charge.");
    }

    const magic = MAGIC_BYTES[file.mimetype];
    if (magic) {
      const match = magic.some(([offset, sig]) =>
        sig.every((b, i) => file.buffer[offset + i] === b)
      );
      if (!match) {
        throw new BadRequestException("Le fichier ne correspond pas au format d'image déclaré.");
      }
    }

    const filename = `${randomBytes(16).toString("hex")}${ext}`;
    await mkdir(this.localDir, { recursive: true });
    await writeFile(join(this.localDir, filename), file.buffer);

    return { url: `/api/v1/uploads/files/${filename}` };
  }

  async serveLocalFile(filename: string, response: Response): Promise<void> {
    if (!SAFE_FILENAME.test(filename)) {
      throw new NotFoundException();
    }
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (!mime) {
      throw new NotFoundException();
    }

    try {
      const bytes = await readFile(join(this.localDir, filename));
      response.setHeader("Content-Type", mime);
      response.setHeader("Cache-Control", "public, max-age=86400");
      response.send(bytes);
    } catch {
      throw new NotFoundException();
    }
  }
}
