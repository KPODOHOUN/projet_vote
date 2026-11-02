import { authedFetch, getApiBaseUrl } from "./api";
import { getStoredToken } from "./auth";

export type ContractStatus = "PENDING_SIGNATURE" | "SIGNED" | "SUPERSEDED";

export type ContractSummary = {
  id: string;
  eventId: string;
  status: ContractStatus;
  templateVersion: string;
  generatedAt: string;
  signedAt: string | null;
  signerName: string | null;
  supersededAt: string | null;
};

export type ContractDocument = {
  title: string;
  reference: string;
  notice: string | null;
  sections: Array<{ title: string; paragraphs: string[] }>;
};

export type ContractWithContent = ContractSummary & { contentHash: string; document: ContractDocument };

export type ContractIdentity = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  idDocumentType: string;
  idDocumentNumber: string;
  organizationName: string;
  organizationLegalId: string | null;
};

export type ContractOverview = {
  eventStatus: string;
  requirements: string[];
  platformLegalMissing: string[];
  current: ContractWithContent | null;
  history: ContractSummary[];
  prefill: Partial<ContractIdentity> & { email?: string };
};

const base = (eventId: string) => `/events/${encodeURIComponent(eventId)}/contract`;

export const getContractOverview = (eventId: string) => authedFetch<ContractOverview>(base(eventId));

export const generateContract = (eventId: string, identity: ContractIdentity) =>
  authedFetch<ContractWithContent>(base(eventId), { method: "POST", body: JSON.stringify(identity) });

export const sendSignatureCode = (eventId: string, contractId: string) =>
  authedFetch<{ sent: boolean; devCode?: string }>(`${base(eventId)}/${contractId}/code`, { method: "POST" });

export const signContract = (
  eventId: string,
  contractId: string,
  payload: { contentHash: string; signerName: string; accept: true; code: string; signatureImage?: string }
) =>
  authedFetch<{ contractId: string; signedAt: string; eventStatus: string }>(`${base(eventId)}/${contractId}/sign`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

/** Télécharge le PDF (original signé, ou projet à relire) sans exposer le jeton dans l'URL. */
export async function downloadContractPdf(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const contractPdfPath = (eventId: string, contractId: string) => `${base(eventId)}/${contractId}/pdf`;
