import mammoth from "mammoth";
import { v4 as uuidv4 } from "uuid";
import { DocumentExtractor, NormalizedDocument } from "../../types";

/**
 * DocxExtractor extracts clean text from Word (.docx) documents using mammoth.
 */
export class DocxExtractor implements DocumentExtractor {
  private readonly minChars: number;

  constructor(options: { minChars?: number } = {}) {
    this.minChars = options.minChars ?? 20;
  }

  supports(fileType: string, mimeType?: string): boolean {
    const ext = fileType.toLowerCase().replace(/^\./, "");
    if (ext === "docx") return true;
    if (
      mimeType &&
      (mimeType.includes("wordprocessingml") || mimeType.includes("docx"))
    ) {
      return true;
    }
    return false;
  }

  async extract(
    fileBuffer: Buffer,
    fileName: string,
    _options?: Record<string, unknown>
  ): Promise<NormalizedDocument[]> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error(`[DocxExtractor] DOCX file buffer is empty: ${fileName}`);
    }

    let rawText = "";
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value || "";
    } catch (error: any) {
      throw new Error(
        `[DocxExtractor] Failed to extract text from DOCX file '${fileName}': ${error.message}`
      );
    }

    const cleanContent = this.cleanWhitespace(rawText);

    if (cleanContent.length < this.minChars) {
      throw new Error(
        `[DocxExtractor] Extracted text from '${fileName}' is below threshold limit (<${this.minChars} chars).`
      );
    }

    return [
      {
        id: uuidv4(),
        title: fileName,
        content: cleanContent,
        metadata: {
          sourceType: "file",
          sourceName: fileName,
          fileName,
          fileType: "docx",
          fileSize: fileBuffer.length,
        },
      },
    ];
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
