import { v4 as uuidv4 } from "uuid";
import { ProcessedPage, DocumentChunk } from "../../types";

/**
 * DocumentChunker segments cleaned page content (ProcessedPage)
 * into smaller, overlapping semantic chunks (DocumentChunks) suitable for embeddings.
 * 
 * Why this class exists:
 * Vector embedding models have hard limits on input context window sizes.
 * Simply cutting text at arbitrary character indexes degrades search performance
 * by cutting paragraphs, sentences, or code blocks in half. This class implements
 * a recursive-like character sliding window splitting strategy, prioritizing paragraph
 * splits, sentence bounds, and word boundaries to keep chunks semantically cohesive.
 */
export class DocumentChunker {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  /**
   * Constructs the DocumentChunker.
   * 
   * @param options Config settings.
   * @param options.chunkSize Target maximum character length of a single chunk (default 1000).
   * @param options.chunkOverlap Overlapping character length between consecutive chunks (default 200).
   */
  constructor(options: { chunkSize?: number; chunkOverlap?: number } = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error("[DocumentChunker] chunkOverlap must be strictly smaller than chunkSize.");
    }
  }

  /**
   * Transforms a ProcessedPage into an array of semantic DocumentChunks.
   * 
   * @param page Cleaned ProcessedPage metadata and text content.
   * @returns Array of DocumentChunk objects.
   */
  chunk(page: ProcessedPage): DocumentChunk[] {
    const { url, title, content } = page;
    
    if (!content || !content.trim()) {
      return [];
    }

    const tempChunks: { text: string; start: number; end: number }[] = [];
    let start = 0;

    while (start < content.length) {
      let end = start + this.chunkSize;

      if (end >= content.length) {
        end = content.length;
      } else {
        // Identify best semantic boundary split index within the overlap window: [end - chunkOverlap, end]
        const searchStart = Math.max(start, end - this.chunkOverlap);
        const searchRange = content.slice(searchStart, end);

        const bestDelimiterIdx = this.findBestDelimiter(searchRange);
        if (bestDelimiterIdx !== -1) {
          end = searchStart + bestDelimiterIdx;
        }
      }

      const chunkText = content.slice(start, end).trim();

      if (chunkText.length > 0) {
        tempChunks.push({
          text: chunkText,
          start,
          end,
        });
      }

      // Calculate overlapping start for the next chunk
      let nextStart = end - this.chunkOverlap;

      // Quality improvement: backtrack to the nearest space to ensure the next chunk starts on a word boundary
      if (nextStart > start && nextStart < content.length) {
        const lastSpace = content.lastIndexOf(" ", nextStart);
        if (lastSpace !== -1 && lastSpace > start) {
          nextStart = lastSpace + 1; // Start immediately after the space
        }
      }

      // Safeguard against infinite loops: next start must strictly advance
      if (nextStart > start) {
        start = nextStart;
      } else {
        start = end;
      }
    }

    // Map temp chunks into final DocumentChunks adding metadata records
    const totalChunks = tempChunks.length;
    const finalChunks: DocumentChunk[] = tempChunks.map((c, index) => ({
      id: uuidv4(),
      url,
      title,
      content: c.text,
      chunkIndex: index,
      totalChunks,
      startOffset: c.start,
      endOffset: c.end,
    }));

    return finalChunks;
  }

  /**
   * Helper that searches text from right-to-left for standard structural boundaries.
   * Preference Order:
   * 1. Paragraph boundary (\n\n)
   * 2. Line boundary (\n)
   * 3. Sentence boundary (. / ? / ! followed by space or newline)
   * 4. Word boundary (space)
   * 
   * @param text The overlapping search window text segment.
   * @returns Offset index to split at, or -1 if no match.
   */
  private findBestDelimiter(text: string): number {
    // 1. Paragraph splits (\n\n)
    const doubleNewlineIdx = text.lastIndexOf("\n\n");
    if (doubleNewlineIdx !== -1) {
      return doubleNewlineIdx + 2; // Split after newlines
    }

    // 2. Line splits (\n)
    const singleNewlineIdx = text.lastIndexOf("\n");
    if (singleNewlineIdx !== -1) {
      return singleNewlineIdx + 1; // Split after newline
    }

    // 3. Sentence splits (.?! followed by whitespace/end)
    const sentenceBoundaryMatches = [...text.matchAll(/[.!?](?=\s|$)/g)];
    if (sentenceBoundaryMatches.length > 0) {
      const lastMatch = sentenceBoundaryMatches[sentenceBoundaryMatches.length - 1];
      if (lastMatch.index !== undefined) {
        return lastMatch.index + 1; // Split after punctuation
      }
    }

    // 4. Word splits (space)
    const spaceIdx = text.lastIndexOf(" ");
    if (spaceIdx !== -1) {
      return spaceIdx + 1; // Split after space
    }

    return -1;
  }
}
