import { DocumentChunk, WebPage } from "../../types";

/**
 * Interface defining the Document Chunker component.
 * Responsible for splitting a raw WebPage into smaller, semantically coherent segments (chunks).
 */
export interface DocumentChunker {
  /**
   * Splits a crawled WebPage into an array of DocumentChunks.
   * 
   * @param page The raw crawled webpage object.
   * @returns Array of DocumentChunk objects without embeddings.
   */
  chunk(page: WebPage): DocumentChunk[];
}

export * from "./html-extractor";
