import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { ContractDocument } from "./contract-template";

export type ContractSignatureProof = {
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  otpVerifiedAt: Date;
  signerIp: string | null;
  contentHash: string;
  contractId: string;
  /** Signature tracée (facultative) ; sinon, mention « signé électroniquement ». */
  signatureImage?: Uint8Array | null;
};

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = { x: 56, top: 64, bottom: 72 };
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.42, 0.47);

/**
 * Les polices standard PDF ne couvrent que WinAnsi (Latin-1 + quelques signes) :
 * on normalise les espaces insécables et on remplace tout caractère hors jeu,
 * pour qu'aucun texte ne fasse échouer ni ne tronque le document.
 */
function winAnsi(text: string): string {
  return text
    .replace(/[\u00a0\u202f\u2009\u2007]/g, " ")
    .replace(/[\u2010-\u2012]/g, "-")
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u0152\u0153\u20ac\u2022\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of winAnsi(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Mot plus long que la ligne (ex. empreinte) : coupé en morceaux.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

class Layout {
  page!: PDFPage;
  y = 0;
  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: { regular: PDFFont; bold: PDFFont }
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN.top;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const leading = size * 1.45;
    for (const line of wrap(text, font, size, PAGE.width - MARGIN.x * 2)) {
      this.ensure(leading);
      this.page.drawText(line, { x: MARGIN.x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= leading;
    }
    this.y -= opts.gapAfter ?? 0;
  }
}

/**
 * PDF du contrat. Sans `proof` : projet à relire (mention « non signé »). Avec
 * `proof` : contrat signé, avec la signature et une page « Preuve de
 * signature ». Les métadonnées sont figées sur la date de signature (ou de
 * génération) : le même contrat produit toujours le même document.
 */
export async function renderContractPdf(
  doc: ContractDocument,
  opts: { generatedAt: Date; proof?: ContractSignatureProof }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fixedDate = opts.proof?.signedAt ?? opts.generatedAt;
  pdf.setTitle(winAnsi(doc.title));
  pdf.setAuthor("SHADOMA");
  pdf.setSubject(winAnsi(doc.reference));
  pdf.setProducer("SHADOMA");
  pdf.setCreator("SHADOMA");
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold)
  };
  const layout = new Layout(pdf, fonts);

  layout.text(doc.title, { size: 17, bold: true, gapAfter: 4 });
  layout.text(doc.reference, { size: 9, color: MUTED, gapAfter: 4 });
  if (!opts.proof) layout.text("PROJET — NON SIGNÉ. Ce document n'engage personne tant qu'il n'est pas signé.", { size: 9.5, bold: true, gapAfter: 4 });
  if (doc.notice) layout.text(doc.notice, { size: 9, color: MUTED, gapAfter: 4 });
  layout.y -= 8;

  for (const section of doc.sections) {
    layout.ensure(40);
    layout.text(section.title, { size: 12, bold: true, gapAfter: 3 });
    for (const paragraph of section.paragraphs) layout.text(paragraph, { gapAfter: 5 });
    layout.y -= 6;
  }

  if (opts.proof) {
    const proof = opts.proof;
    layout.ensure(150);
    layout.text("Signature de l'Organisateur", { size: 12, bold: true, gapAfter: 6 });
    if (proof.signatureImage?.length) {
      const image = await pdf.embedPng(proof.signatureImage);
      const scale = Math.min(220 / image.width, 90 / image.height, 1);
      layout.page.drawImage(image, {
        x: MARGIN.x,
        y: layout.y - image.height * scale,
        width: image.width * scale,
        height: image.height * scale
      });
      layout.y -= image.height * scale + 8;
    } else {
      const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      layout.page.drawText(winAnsi(proof.signerName), { x: MARGIN.x, y: layout.y - 22, size: 22, font: script, color: INK });
      layout.y -= 34;
    }
    layout.text(`${proof.signerName} — « Lu et approuvé », signé électroniquement (code email vérifié) le ${proof.signedAt.toISOString().replace("T", " à ").slice(0, 21)} (UTC).`, { size: 10 });

    layout.newPage();
    layout.text("Preuve de signature", { size: 15, bold: true, gapAfter: 8 });
    const rows: Array<[string, string]> = [
      ["Référence du contrat", proof.contractId],
      ["Signataire", proof.signerName],
      ["Email du compte", proof.signerEmail],
      ["Signé le (UTC)", proof.signedAt.toISOString()],
      ["Code email vérifié le (UTC)", proof.otpVerifiedAt.toISOString()],
      ["Adresse IP", proof.signerIp ?? "non disponible"],
      ["Empreinte SHA-256 du texte signé", proof.contentHash]
    ];
    for (const [label, value] of rows) {
      layout.text(label, { size: 9, color: MUTED });
      layout.text(value, { size: 10.5, gapAfter: 6 });
    }
    layout.text(
      "L'empreinte permet de vérifier que le texte signé n'a pas été modifié : SHADOMA conserve ce texte et recalcule son empreinte sur demande.",
      { size: 9, color: MUTED }
    );
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const footer = winAnsi(`SHADOMA — ${doc.reference} — page ${index + 1} / ${pages.length}`);
    page.drawText(footer, { x: MARGIN.x, y: 36, size: 8, font: fonts.regular, color: MUTED });
  });

  return pdf.save({ useObjectStreams: false });
}
