import { randomBytes } from "node:crypto";

/** Identifiant URL-safe (~128 bits), non séquentiel. */
export function generatePublicRef(byteLength = 12): string {
  return randomBytes(byteLength).toString("base64url");
}
