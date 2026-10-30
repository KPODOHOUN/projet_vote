import { createHash } from "node:crypto";

/**
 * Modèle de contrat organisateur ↔ SHADOMA — source UNIQUE et versionnée.
 *
 * Le contrat est produit à partir d'un instantané (ContractSnapshot) figé à la
 * génération ; le texte, son empreinte et le PDF en dérivent de façon
 * déterministe. Toute modification de ce fichier qui change le texte DOIT
 * changer CONTRACT_TEMPLATE_VERSION : un contrat déjà signé n'est jamais
 * régénéré avec une nouvelle version (il garde son texte et son PDF signés).
 *
 * Ce modèle n'est pas un document juridiquement validé : il doit être relu par
 * un juriste avant le lancement commercial (CONTRACT_TEMPLATE_LEGALLY_REVIEWED).
 */
export const CONTRACT_TEMPLATE_VERSION = "2026-10-30.1";

export type ContractIdentity = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  idDocumentType: string;
  idDocumentNumber: string;
  organizationName: string;
  organizationLegalId: string | null;
};

export type ContractSnapshot = {
  templateVersion: string;
  generatedAt: string;
  legallyReviewed: boolean;
  platform: {
    name: string;
    legalForm: string;
    address: string;
    registration: string;
    representative: string;
    email: string;
    jurisdiction: string;
    publicUrl: string;
  };
  organizer: ContractIdentity & { tenantId: string; userId: string };
  event: {
    id: string;
    title: string;
    publicUrl: string;
    startsAt: string;
    endsAt: string;
    voteUnitPriceCfa: number;
    candidateCount: number;
    ticketTypes: Array<{ name: string; priceCfa: number; quantity: number }>;
  };
  money: {
    commissionBps: number;
    heldBps: number;
    heldReleaseDelayHours: number;
  };
};

export type ContractSection = { title: string; paragraphs: string[] };
export type ContractDocument = { title: string; reference: string; notice: string | null; sections: ContractSection[] };

const MISSING = "[à renseigner par l'exploitant]";
const orMissing = (value: string) => (value.trim() ? value.trim() : MISSING);

/** Liste des informations légales de l'exploitant encore absentes (bloque la signature en production). */
export function missingPlatformLegalFields(platform: ContractSnapshot["platform"]): string[] {
  const labels: Array<[keyof ContractSnapshot["platform"], string]> = [
    ["name", "raison sociale (PLATFORM_LEGAL_NAME)"],
    ["legalForm", "forme juridique (PLATFORM_LEGAL_FORM)"],
    ["address", "siège (PLATFORM_LEGAL_ADDRESS)"],
    ["registration", "immatriculation RCCM/IFU (PLATFORM_LEGAL_REGISTRATION)"],
    ["representative", "représentant légal (PLATFORM_LEGAL_REPRESENTATIVE)"],
    ["email", "email juridique (PLATFORM_LEGAL_EMAIL)"],
    ["jurisdiction", "juridiction compétente (CONTRACT_JURISDICTION)"]
  ];
  return labels.filter(([key]) => !platform[key].trim()).map(([, label]) => label);
}

const percent = (bps: number) => {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(".", ",")} %`;
};
const cfa = (amount: number) => `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F CFA`;
const date = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} à ${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())} (UTC)`;
};

export function buildContractDocument(s: ContractSnapshot, contractId: string): ContractDocument {
  const p = s.platform;
  const o = s.organizer;
  const e = s.event;
  const m = s.money;
  const organizerParty = o.organizationLegalId
    ? `${o.organizationName}, identifiée sous le numéro ${o.organizationLegalId}, représentée par ${o.firstName} ${o.lastName}`
    : `${o.firstName} ${o.lastName}, agissant sous le nom « ${o.organizationName} »`;
  const tickets = e.ticketTypes.length
    ? e.ticketTypes.map((t) => `${t.name} : ${cfa(t.priceCfa)} (${t.quantity} places)`).join(" ; ")
    : "aucune billetterie à la date de signature";

  return {
    title: "Contrat d'organisation d'un concours sur SHADOMA",
    reference: `Contrat ${contractId} — modèle ${s.templateVersion}`,
    notice: s.legallyReviewed
      ? null
      : "Modèle en attente de validation juridique par l'exploitant de SHADOMA.",
    sections: [
      {
        title: "Article 1 — Les parties",
        paragraphs: [
          `SHADOMA : ${orMissing(p.name)}, ${orMissing(p.legalForm)}, siège : ${orMissing(p.address)}, immatriculation : ${orMissing(p.registration)}, représentée par ${orMissing(p.representative)}, contact : ${orMissing(p.email)}, exploitant la plateforme ${p.publicUrl}.`,
          `L'Organisateur : ${organizerParty}, domicilié(e) ${o.address}, pièce d'identité ${o.idDocumentType} n° ${o.idDocumentNumber}, téléphone ${o.phone}, email ${o.email}.`
        ]
      },
      {
        title: "Article 2 — Objet et concours",
        paragraphs: [
          `Le présent contrat permet à l'Organisateur de publier sur SHADOMA le concours « ${e.title} » (${e.publicUrl}), ouvert au vote du ${date(e.startsAt)} au ${date(e.endsAt)}.`,
          `Prix d'un vote : ${cfa(e.voteUnitPriceCfa)}, fixe jusqu'à la fin du concours. Billetterie à la signature : ${tickets}.`,
          "La publication ne requiert ni abonnement ni frais d'activation : elle intervient dès la signature du présent contrat."
        ]
      },
      {
        title: "Article 3 — Encaissement et commission",
        paragraphs: [
          "SHADOMA encaisse sur son propre compte la totalité des paiements du concours (votes et billets). L'Organisateur s'interdit de les encaisser par un autre moyen.",
          `SHADOMA perçoit une commission de ${percent(m.commissionBps)} du montant de chaque paiement confirmé, frais du prestataire de paiement inclus, arrondie au franc CFA inférieur. Cette commission appartient à SHADOMA et n'est jamais due à l'Organisateur. Son taux ne change pas pendant le concours.`
        ]
      },
      {
        title: "Article 4 — Part de l'Organisateur et retraits",
        paragraphs: [
          `Pour chaque paiement confirmé, l'Organisateur reçoit le montant payé diminué de la commission. ${percent(m.heldBps)} de cette part sont mis en réserve et deviennent retirables ${m.heldReleaseDelayHours} heures après la clôture du concours ; le reste est retirable tout de suite.`,
          "Les retraits sont demandés par l'Organisateur, validés par SHADOMA et versés sur le numéro Mobile Money qu'il a enregistré. Un retrait ne peut dépasser le solde disponible."
        ]
      },
      {
        title: "Article 5 — Engagements de l'Organisateur",
        paragraphs: [
          "L'Organisateur garantit l'exactitude des informations fournies, organise le concours de bonne foi selon les règles annoncées, remet les prix promis, ne provoque ni n'achète de votes frauduleux et répond aux réclamations des participants."
        ]
      },
      {
        title: "Article 6 — Engagements de SHADOMA",
        paragraphs: [
          "SHADOMA héberge la page du concours, encaisse les paiements, compte les votes payés, publie les résultats, tient à la disposition de l'Organisateur le relevé de chaque paiement et traite ses demandes de retrait conformément à l'article 4."
        ]
      },
      {
        title: "Article 7 — Fraude, suspension et fin du contrat",
        paragraphs: [
          "En cas de fraude, de paiement contesté ou de manquement grave, SHADOMA peut suspendre le concours et retenir les sommes concernées le temps de l'examen, en informant l'Organisateur.",
          "Le contrat prend effet à sa signature et prend fin au règlement de toutes les sommes du concours."
        ]
      },
      {
        title: "Article 8 — Signature électronique, preuve et litiges",
        paragraphs: [
          "Les parties conviennent que le présent contrat est valablement conclu par voie électronique, conformément à la loi n° 2017-20 portant Code du numérique en République du Bénin et à l'Acte uniforme OHADA relatif au droit commercial général. L'acceptation expresse du contrat, la saisie du nom de l'Organisateur et la validation du code reçu à l'adresse email de son compte valent signature et consentement, avec la même force qu'une signature manuscrite.",
          "Les enregistrements conservés par SHADOMA (texte signé et son empreinte numérique, date et heure, code de vérification, adresse IP) font foi entre les parties jusqu'à preuve contraire. Une copie du contrat signé est envoyée à l'Organisateur, qui peut la télécharger à tout moment.",
          `Le contrat est soumis au droit béninois. Les parties recherchent d'abord une solution amiable ; à défaut, le litige est porté devant ${orMissing(p.jurisdiction)}.`
        ]
      }
    ]
  };
}

/** Texte de référence du contrat : c'est lui que signe l'Organisateur et dont on garde l'empreinte. */
export function contractText(doc: ContractDocument): string {
  const lines = [doc.title, doc.reference];
  if (doc.notice) lines.push(doc.notice);
  for (const section of doc.sections) {
    lines.push("", section.title, ...section.paragraphs);
  }
  return lines.join("\n");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
