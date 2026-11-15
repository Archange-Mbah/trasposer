"use client";

import { layoutPdfPages, type PdfTextRun } from "./pdf-layout";

/**
 * Turns an uploaded file into plain text in the browser (nothing is uploaded
 * to a server). The result is fed into the same parser, preview and
 * correction step as pasted text.
 */

export type ImportKind = "pdf" | "docx" | "text";

export class ImportError extends Error {}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function detectKind(file: File): ImportKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "docx";
  if (name.endsWith(".doc")) throw new ImportError("Old .doc files aren’t supported. In Word, use “Save As → .docx” and try again.");
  if (file.type.startsWith("text/") || /\.(txt|cho|chordpro|crd|pro)$/.test(name)) return "text";
  return null;
}

export async function extractText(file: File): Promise<{ text: string; kind: ImportKind; pages?: number }> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError("That file is larger than 20 MB.");
  const kind = detectKind(file);
  if (!kind) throw new ImportError("Please choose a PDF, Word (.docx) or text file.");
  if (kind === "text") return { text: normalize(await file.text()), kind };
  if (kind === "docx") return { text: await extractDocx(file), kind };
  return { ...(await extractPdf(file)), kind };
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  let raw: string;
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    raw = result.value;
  } catch {
    throw new ImportError("This Word file couldn’t be read. Is it a valid .docx?");
  }
  // Mammoth ends every paragraph with "\n\n"; in lyric documents each line is usually
  // its own paragraph and an empty paragraph is a blank line. Map paragraphs back to lines.
  const paragraphs = raw.replace(/\r\n?/g, "\n").split("\n\n");
  if (paragraphs[paragraphs.length - 1] === "") paragraphs.pop();
  const text = normalize(paragraphs.join("\n"));
  if (!text.trim()) throw new ImportError("This Word file doesn’t contain any text.");
  return text;
}

async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  // The legacy build includes polyfills (e.g. Uint8Array#toHex) so PDFs also open in
  // older Safari/iPad and Chromium versions. The worker is copied to /public by the
  // postinstall script so its version always matches.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if ((e as Error).name === "PasswordException") throw new ImportError("This PDF is password-protected.");
    throw new ImportError("This PDF couldn’t be read.");
  }
  const pages: PdfTextRun[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const runs: PdfTextRun[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [a, b, , , x, y] = item.transform as number[];
      runs.push({ str: item.str, x, y, width: item.width, size: Math.hypot(a, b) || item.height || 10 });
    }
    pages.push(runs);
  }
  await task.destroy();
  const text = normalize(layoutPdfPages(pages));
  if (!text.trim()) {
    throw new ImportError(
      "This PDF has no selectable text — it’s probably a scan or photo. Copy the lyrics by hand, or run it through OCR first.",
    );
  }
  return { text, pages: pages.length };
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ") // non-breaking spaces
    .replace(/[\u200b\ufeff]/g, "") // zero-width chars / BOM
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
