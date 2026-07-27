import { apiFetch } from "./api";
import { getApiBaseUrl } from "./api-base-url";

export type CloudinarySignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

/** Cloudinary configuré côté client (upload signé direct vers Cloudinary). */
export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
}

/** Upload fichier depuis le PC disponible (Cloudinary ou upload direct en dev). */
export function isFileUploadAvailable(): boolean {
  return cloudinaryConfigured() || process.env.NODE_ENV === "development";
}

async function uploadViaCloudinary(file: File, token: string): Promise<string> {
  const sig = await apiFetch<CloudinarySignature>("/uploads/signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: "POST",
    body: form
  });
  if (!res.ok) {
    throw new Error("Échec de l'upload de l'image.");
  }
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw new Error("Réponse d'upload invalide.");
  }
  return data.secure_url;
}

async function uploadViaApi(file: File, token: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${getApiBaseUrl()}/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    credentials: "include"
  });

  if (!response.ok) {
    const text = await response.text();
    let message = "Échec de l'upload de l'image.";
    try {
      const parsed = JSON.parse(text) as { message?: string | { message?: string } };
      if (typeof parsed.message === "string") {
        message = parsed.message;
      } else if (parsed.message && typeof parsed.message === "object" && typeof parsed.message.message === "string") {
        message = parsed.message.message;
      }
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Réponse d'upload invalide.");
  }
  return data.url;
}

/**
 * Upload photo candidat : Cloudinary si configuré, sinon upload direct via l'API (dev).
 * Renvoie l'URL à stocker dans photoUrl.
 */
export async function uploadCandidatePhoto(file: File, token: string): Promise<string> {
  if (cloudinaryConfigured()) {
    return uploadViaCloudinary(file, token);
  }
  return uploadViaApi(file, token);
}
