import { DocumentExtractor } from "../../types";
import { PdfExtractor } from "./pdf-extractor";
import { DocxExtractor } from "./docx-extractor";
import { MarkdownExtractor } from "./markdown-extractor";
import { TextExtractor } from "./text-extractor";

/**
 * ExtractorRegistry manages the set of available DocumentExtractors
 * and selects the appropriate strategy based on file format.
 */
export class ExtractorRegistry {
  private readonly extractors: DocumentExtractor[] = [];

  constructor(extractors?: DocumentExtractor[]) {
    if (extractors && extractors.length > 0) {
      this.extractors.push(...extractors);
    } else {
      // Register standard default extractors
      this.register(new PdfExtractor());
      this.register(new DocxExtractor());
      this.register(new MarkdownExtractor());
      this.register(new TextExtractor());
    }
  }

  /**
   * Registers a new DocumentExtractor implementation.
   */
  register(extractor: DocumentExtractor): this {
    this.extractors.push(extractor);
    return this;
  }

  /**
   * Finds the first registered extractor supporting the file extension or MIME type.
   */
  getExtractor(fileTypeOrExtension: string, mimeType?: string): DocumentExtractor {
    const ext = fileTypeOrExtension.toLowerCase().replace(/^\./, "");
    for (const extractor of this.extractors) {
      if (extractor.supports(ext, mimeType)) {
        return extractor;
      }
    }
    throw new Error(
      `[ExtractorRegistry] No extractor registered for file type '.${ext}' (MIME: ${mimeType || "unknown"}). Supported formats: PDF, DOCX, Markdown (.md), Plain Text (.txt).`
    );
  }

  /**
   * Checks if a file type is supported.
   */
  isSupported(fileTypeOrExtension: string, mimeType?: string): boolean {
    const ext = fileTypeOrExtension.toLowerCase().replace(/^\./, "");
    return this.extractors.some((extractor) => extractor.supports(ext, mimeType));
  }
}

/**
 * Default global singleton instance.
 */
export const defaultExtractorRegistry = new ExtractorRegistry();
