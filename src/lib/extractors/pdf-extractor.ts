import { PDFParse } from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import { DocumentExtractor, NormalizedDocument } from "../../types";

/**
 * PdfExtractor extracts clean text from PDF documents using pdf-parse (v2).
 * It preserves page boundaries to enrich NormalizedDocuments with exact page numbers.
 */
export class PdfExtractor implements DocumentExtractor {
  private readonly minChars: number;

  constructor(options: { minChars?: number } = {}) {
    this.minChars = options.minChars ?? 20;
  }

  supports(fileType: string, mimeType?: string): boolean {
    const ext = fileType.toLowerCase().replace(/^\./, "");
    if (ext === "pdf") return true;
    if (mimeType && mimeType.toLowerCase().includes("pdf")) return true;
    return false;
  }

  async extract(
    fileBuffer: Buffer,
    fileName: string,
    _options?: Record<string, unknown>
  ): Promise<NormalizedDocument[]> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error(`[PdfExtractor] PDF file buffer is empty: ${fileName}`);
    }

    let parser: PDFParse | null = null;
    let textResult: any;

    try {
      parser = new PDFParse({ data: fileBuffer });
      textResult = await parser.getText();
    } catch (error: any) {
      throw new Error(`[PdfExtractor] Failed to parse PDF file '${fileName}': ${error.message}`);
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }

    const totalPages = textResult?.total || textResult?.pages?.length || 1;
    const documents: NormalizedDocument[] = [];

    if (textResult?.pages && Array.isArray(textResult.pages) && textResult.pages.length > 0) {
      for (const page of textResult.pages) {
        const cleaned = this.cleanWhitespace(page.text || "");
        if (cleaned.length >= this.minChars) {
          documents.push({
            id: uuidv4(),
            title: `${fileName} (Page ${page.num})`,
            content: cleaned,
            metadata: {
              sourceType: "file",
              sourceName: fileName,
              fileName,
              fileType: "pdf",
              pageNumber: page.num,
              totalPages,
              fileSize: fileBuffer.length,
            },
          });
        }
      }
    }

    // If per-page extraction yielded nothing, fallback to full document text
    if (documents.length === 0 && textResult?.text) {
      const fullText = this.cleanWhitespace(textResult.text);
      if (fullText.length >= this.minChars) {
        documents.push({
          id: uuidv4(),
          title: fileName,
          content: fullText,
          metadata: {
            sourceType: "file",
            sourceName: fileName,
            fileName,
            fileType: "pdf",
            pageNumber: 1,
            totalPages,
            fileSize: fileBuffer.length,
          },
        });
      }
    }

    if (documents.length === 0) {
      throw new Error(
        `[PdfExtractor] No extractable text found in PDF: ${fileName}. Note that scanned image PDFs without OCR are not supported.`
      );
    }

    return documents;
  }

  private cleanWhitespace(text: string): string {
    return text
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
