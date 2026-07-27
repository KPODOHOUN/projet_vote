"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FileSpreadsheet, ListPlus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { apiFetch } from "../lib/api";
import { parseBulkCandidateCsv, parseBulkCandidateText } from "../lib/candidate-import";
import { showToast } from "../lib/toast";

type BulkImportResponse = {
  createdCount: number;
  errorCount: number;
  errors: Array<{ number: number; fullName: string; message: string }>;
};

type CandidateBulkImportProps = {
  eventId: string;
  token: string;
  isEn?: boolean;
  nextNumber?: number;
  onImported?: () => void;
};

export function CandidateBulkImport({
  eventId,
  token,
  isEn = false,
  nextNumber = 1,
  onImported
}: CandidateBulkImportProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"list" | "csv">("list");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    if (!text.trim()) return { rows: [], errors: [] as string[] };
    return mode === "csv" ? parseBulkCandidateCsv(text) : parseBulkCandidateText(text, nextNumber);
  }, [text, mode, nextNumber]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (preview.errors.length > 0) {
      setError(preview.errors.join(" "));
      return;
    }
    if (preview.rows.length === 0) {
      setError(isEn ? "Paste at least one candidate." : "Collez au moins un candidat.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await apiFetch<BulkImportResponse>(`/events/${eventId}/candidates/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidates: preview.rows })
      });
      showToast.success(
        isEn
          ? `${result.createdCount} candidate(s) added${result.errorCount ? `, ${result.errorCount} skipped` : ""}.`
          : `${result.createdCount} candidat(s) ajouté(s)${result.errorCount ? `, ${result.errorCount} ignoré(s)` : ""}.`
      );
      if (result.errorCount > 0) {
        setError(result.errors.map((e) => `#${e.number} ${e.fullName}: ${e.message}`).join(" · "));
      } else {
        setText("");
        setIsOpen(false);
      }
      onImported?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Import failed." : "Import impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="secondary" onClick={() => setIsOpen(true)}>
        <ListPlus className="mr-2 h-4 w-4" aria-hidden="true" />
        {isEn ? "Import several candidates" : "Importer plusieurs candidats"}
      </Button>
    );
  }

  return (
    <Card className="space-y-4 border border-border p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {isEn ? "Bulk import" : "Import en masse"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "Paste a list or CSV. Add photos individually after import."
              : "Collez une liste ou un CSV. Ajoutez les photos candidat par candidat après."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "list" ? "primary" : "secondary"} onClick={() => setMode("list")}>
            {isEn ? "List" : "Liste"}
          </Button>
          <Button type="button" size="sm" variant={mode === "csv" ? "primary" : "secondary"} onClick={() => setMode("csv")}>
            <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
            CSV
          </Button>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder={
            mode === "csv"
              ? isEn
                ? "1,Arielle K.\n2,Brice M.\n3,Chloé D."
                : "1,Arielle K.\n2,Brice M.\n3,Chloé D."
              : isEn
                ? "1; Arielle K.\n2; Brice M.\nChloé D.\n# comment"
                : "1; Arielle K.\n2; Brice M.\nChloé D.\n# commentaire"
          }
        />

        {preview.rows.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {isEn
              ? `${preview.rows.length} candidate(s) detected`
              : `${preview.rows.length} candidat(s) détecté(s)`}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={isSaving} disabled={preview.rows.length === 0}>
            {isEn ? "Import" : "Importer"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setIsOpen(false); setText(""); setError(""); }}>
            {isEn ? "Cancel" : "Annuler"}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : null}
    </Card>
  );
}
