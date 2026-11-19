// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — client-side PDF text extraction.
//
// Teachers live in PDFs. Rather than shipping their files to a server (or
// being forced onto the cloud tier), the text layer is extracted IN the
// browser with pdf.js — the result feeds the same import path as pasted text,
// so it works with the on-device tier too, fully offline.
//
// The pdf.js worker is served from /pdf.worker.min.mjs (public/) so nothing
// is fetched from a CDN — offline-first stays true.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import type { PdfDocument } from "./pdfTypes";

/** Lazy-loaded pdf.js module (keeps it out of the initial bundle). */
async function loadPdfjs(): Promise<PdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs as unknown as PdfDocument;
}

export interface PdfExtractResult {
  ok: boolean;
  /** Extracted text (ok=true) or a teacher-friendly error (ok=false). */
  text: string;
  pages: number;
}

/** Reads a PDF in the browser and returns its text layer. Scanned PDFs
 *  (images without a text layer) are detected and rejected with guidance. */
export async function extractPdfText(
  file: File,
  maxPages = 30,
): Promise<PdfExtractResult> {
  let pdfjs: PdfDocument;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    return {
      ok: false,
      text: "The PDF reader could not load in this browser. Try pasting the text instead.",
      pages: 0,
    };
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    const chunks: string[] = [];
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: { str?: string }) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) chunks.push(pageText);
    }
    const text = chunks.join("\n\n");
    if (text.trim().length < 80) {
      return {
        ok: false,
        text: "This PDF looks like scanned images (no text layer). Photograph the pages with the Photo tab instead — the AI reads images directly.",
        pages: doc.numPages,
      };
    }
    return { ok: true, text, pages: doc.numPages };
  } catch {
    return {
      ok: false,
      text: "Could not read that PDF. It may be corrupted or password-protected.",
      pages: 0,
    };
  }
}
