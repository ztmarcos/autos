type PdfToImgModule = typeof import("pdf-to-img");

let pdfToImgModule: PdfToImgModule | null = null;

async function loadPdfToImg(): Promise<PdfToImgModule> {
  if (pdfToImgModule) return pdfToImgModule;
  // tsc (module: commonjs) rewrites `import()` to `require()`, which breaks pdf-to-img (ESM + TLA).
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<PdfToImgModule>;
  pdfToImgModule = await dynamicImport("pdf-to-img");
  return pdfToImgModule;
}

export function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

export async function renderPdfThumbnail(buffer: Buffer): Promise<Buffer | null> {
  const pages = await renderAllPdfPages(buffer, 1.5, 1);
  return pages[0] ?? null;
}

export async function renderAllPdfPages(
  buffer: Buffer,
  scale = 1.2,
  maxPages = 40,
): Promise<Buffer[]> {
  try {
    const { pdf } = await loadPdfToImg();
    const document = await pdf(buffer, { scale });
    const pages: Buffer[] = [];
    for await (const page of document) {
      pages.push(Buffer.from(page));
      if (pages.length >= maxPages) break;
    }
    return pages;
  } catch (err) {
    console.warn("PDF page rendering failed:", err);
    return [];
  }
}

export function pdfPagesPrefix(storagePath: string): string {
  return storagePath.replace(/original\.[^/]+$/, "pages/");
}

export function pdfThumbPath(storagePath: string): string {
  return storagePath.replace(/original\.[^/]+$/, "thumb.jpg");
}
