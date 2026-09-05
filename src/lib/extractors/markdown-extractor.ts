import { v4 as uuidv4 } from "uuid";
import { DocumentExtractor, NormalizedDocument } from "../../types";

/**
 * MarkdownExtractor extracts and cleans text from Markdown (.md, .markdown) files.
 * Handles frontmatter removal while preserving structural markdown (headers, code blocks, lists).
 */
export class MarkdownExtractor implements DocumentExtractor {
  private readonly minChars: number;

  constructor(options: { minChars?: number } = {}) {
    this.minChars = options.minChars ?? 10;
  }

  supports(fileType: string, mimeType?: string): boolean {
    const ext = fileType.toLowerCase().replace(/^\./, "");
    if (ext === "md" || ext === "markdown") return true;
    if (mimeType && (mimeType.includes("markdown") || mimeType.includes("text/x-markdown"))) {
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
      throw new Error(`[MarkdownExtractor] Markdown file buffer is empty: ${fileName}`);
    }

    const rawContent = fileBuffer.toString("utf-8");
    
    // Strip YAML frontmatter if present: ---\n...\n---
    const withoutFrontmatter = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const cleanContent = this.cleanWhitespace(withoutFrontmatter);

    if (cleanContent.length < this.minChars) {
      throw new Error(
        `[MarkdownExtractor] Extracted text from '${fileName}' is below threshold limit (<${this.minChars} chars).`
      );
    }

    // Try to find a primary H1 heading for the document title if available
    const h1Match = cleanContent.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1].trim() : fileName;

    return [
      {
        id: uuidv4(),
        title,
        content: cleanContent,
        metadata: {
          sourceType: "file",
          sourceName: fileName,
          fileName,
          fileType: "md",
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
