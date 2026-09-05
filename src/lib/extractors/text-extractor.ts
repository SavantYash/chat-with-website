import { v4 as uuidv4 } from "uuid";
import { DocumentExtractor, NormalizedDocument } from "../../types";

/**
 * TextExtractor extracts and normalizes raw text from plain text files (.txt, .log, .csv, etc.).
 */
export class TextExtractor implements DocumentExtractor {
  private readonly minChars: number;

  constructor(options: { minChars?: number } = {}) {
    this.minChars = options.minChars ?? 10;
  }

  supports(fileType: string, mimeType?: string): boolean {
    const ext = fileType.toLowerCase().replace(/^\./, "");
    if (["txt", "text", "log", "csv", "json"].includes(ext)) return true;
    if (mimeType && (mimeType.startsWith("text/") || mimeType.includes("json"))) {
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
      throw new Error(`[TextExtractor] Text file buffer is empty: ${fileName}`);
    }

    const rawContent = fileBuffer.toString("utf-8");
    const cleanContent = this.cleanWhitespace(rawContent);

    if (cleanContent.length < this.minChars) {
      throw new Error(
        `[TextExtractor] Text content from '${fileName}' is below threshold limit (<${this.minChars} chars).`
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
          fileType: "txt",
          fileSize: fileBuffer.length,
        },
      },
    ];
  }

  private cleanWhitespace(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
