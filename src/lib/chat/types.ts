/**
 * Represents a document source cited in a chat response.
 */
export interface ChatSource {
  /** Title of the cited webpage */
  title: string;

  /** Source URL of the cited webpage */
  url: string;

  /** 1-based index of this chunk within the original document */
  chunkNumber: number;

  /** Total number of chunks generated for the source document */
  totalChunks: number;

  /** Raw vector search distance score from the vector database */
  distance?: number;
}

/**
 * Represents the final response from the chat orchestration service.
 */
export interface ChatResponse {
  /** The generated natural language answer */
  answer: string;

  /** List of document source chunks cited for grounding the answer */
  sources: ChatSource[];
}
