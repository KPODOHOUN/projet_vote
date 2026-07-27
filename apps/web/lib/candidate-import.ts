export type ParsedCandidateRow = {
  fullName: string;
  number?: number;
  photoUrl?: string;
};

export type ParseBulkCandidatesResult = {
  rows: ParsedCandidateRow[];
  errors: string[];
};

/**
 * Parse une liste collée : une ligne = candidat.
 * Formats acceptés :
 *   - `1; Arielle K.` ou `1, Arielle K.` (numéro optionnel)
 *   - `Arielle K.` (sans numéro)
 */
export function parseBulkCandidateText(text: string, startNumber = 1): ParseBulkCandidatesResult {
  const rows: ParsedCandidateRow[] = [];
  const errors: string[] = [];
  let autoNumber = startNumber;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]?.trim() ?? "";
    if (!raw || raw.startsWith("#")) continue;

    const parts = raw.split(/[;,|\t]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const maybeNumber = Number.parseInt(parts[0] ?? "", 10);
      const fullName = parts.slice(1).join(" ").trim();
      if (Number.isFinite(maybeNumber) && maybeNumber > 0) {
        if (fullName.length < 2) {
          errors.push(`Ligne ${index + 1} : nom trop court.`);
          continue;
        }
        rows.push({ fullName, number: maybeNumber });
        autoNumber = Math.max(autoNumber, maybeNumber + 1);
        continue;
      }
    }

    const nameOnly = parts.length >= 2 ? parts.join(" ").trim() : (parts[0] ?? raw);
    if (nameOnly.length < 2) {
      errors.push(`Ligne ${index + 1} : nom trop court.`);
      continue;
    }
    rows.push({ fullName: nameOnly });
    autoNumber += 1;
  }

  const seen = new Set<number>();
  for (const row of rows) {
    if (row.number == null) continue;
    if (seen.has(row.number)) {
      errors.push(`Numéro en double : ${row.number}.`);
    }
    seen.add(row.number);
  }

  return { rows, errors };
}

/** Parse CSV : fullName OU number,fullName[,photoUrl] */
export function parseBulkCandidateCsv(text: string): ParseBulkCandidatesResult {
  const rows: ParsedCandidateRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (cells.length === 1) {
      const fullName = cells[0] ?? "";
      if (fullName.length < 2) {
        errors.push(`Ligne ${index + 1} : nom trop court.`);
        continue;
      }
      rows.push({ fullName });
      continue;
    }
    if (cells.length < 2) {
      errors.push(`Ligne ${index + 1} : format CSV invalide.`);
      continue;
    }
    const first = cells[0] ?? "";
    const second = cells[1] ?? "";
    const photoUrl = cells[2]?.trim();
    const asNumber = Number.parseInt(first, 10);
    if (Number.isFinite(asNumber) && asNumber > 0 && second.length >= 2) {
      rows.push({
        fullName: second,
        number: asNumber,
        ...(photoUrl ? { photoUrl } : {})
      });
      continue;
    }
    if (first.length >= 2) {
      rows.push({
        fullName: [first, second, ...cells.slice(2)].filter(Boolean).join(", "),
        ...(photoUrl ? { photoUrl } : {})
      });
      continue;
    }
    errors.push(`Ligne ${index + 1} : ligne invalide.`);
  }

  return { rows, errors };
}
