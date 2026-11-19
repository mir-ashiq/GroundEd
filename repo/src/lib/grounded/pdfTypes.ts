// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — minimal structural types for the pdf.js ESM module.
//
// pdfjs-dist ships its own types, but its full typing surface drags DOM
// worker types that complicate the vitest/tsconfig setup. The two members we
// use are declared here; everything else stays opaque.
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfPage {
  getTextContent(): Promise<{
    items: { str?: string }[];
  }>;
}

export interface PdfDocProxy {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}

export interface PdfDocument {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: { data: Uint8Array }): {
    promise: Promise<PdfDocProxy>;
  };
}
