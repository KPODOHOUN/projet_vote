"use client";

import { ImageUploadField } from "./image-upload-field";
import { CandidatePhoto } from "./candidate-photo";

/**
 * Champ photo candidat : choix fichier (galerie, appareil photo, ordinateur),
 * glisser-déposer, aperçu et repli URL. Pilote toujours `value` (= photoUrl).
 */
export function PhotoUploadField({
  value,
  onChange,
  token,
  label,
  fullName
}: {
  value: string;
  onChange: (url: string) => void;
  token: string;
  label: string;
  fullName: string;
}) {
  return (
    <ImageUploadField
      value={value}
      onChange={onChange}
      token={token}
      label={label}
      preview={<CandidatePhoto photoUrl={value || null} fullName={fullName || "?"} size="sm" />}
    />
  );
}
