/**
 * Domain types and abstractions for the Chat with a Website RAG application.
 * Follows SOLID design principles by separating interfaces (contracts) from implementations.
 */

/**
 * Represents a raw crawled web page containing the original HTML content.
 */
export interface WebPage {
  /** Source URL of the page */
  url: string;
  
  /** Title of the web page */
  title: string;
  
  /** Complete raw HTML content of the page */
  html: string;
}

/**
 * Configuration options for the Website Crawler.
 */
export interface CrawlerConfig {
  /** Maximum number of pages to crawl overall. Helps prevent infinite loops on large sites. */
  maxPages?: number;

  /** Maximum depth of the crawl relative to the starting URL (0-indexed). */
  maxDepth?: number;

  /** Delay in milliseconds between subsequent HTTP requests to prevent rate-limiting/DOS. */
  requestDelay?: number;

  /** Custom User-Agent string to pass in request headers. Used also for robots.txt checking. */
  userAgent?: string;
}

/**
 * Represents a semantic chunk of a crawled web page.
 * This is the core model stored in the vector database and retrieved during chat queries.
 */
export interface DocumentChunk {
  /**
   * Unique identifier for the chunk.
   * Typically a UUID or a content-hash.
   */
  id: string;

  /**
   * The source URL of the web page from which this chunk was extracted.
   */
  url: string;

  /**
   * The title of the source web page.
   */
  title: string;

  /**
   * The raw textual content of the chunk.
   */
  content: string;

  /**
   * The zero-based index of this chunk within the original document.
   * Useful for reconstructing adjacent context (e.g. sliding window).
   */
  chunkIndex: number;

  /**
   * The total number of chunks generated for the source document.
   */
  totalChunks: number;

  /**
   * The character index where this chunk starts in the clean source content.
   */
  startOffset: number;

  /**
   * The character index where this chunk ends in the clean source content.
   */
  endOffset: number;

  /**
   * The high-dimensional dense vector representing the semantic content of the chunk.
   * Optional because chunking occurs prior to embedding generation.
   */
  embedding?: number[];

  /**
   * Optional similarity score (e.g., L2 distance, cosine similarity)
   * populated only when returned from a search query.
   */
  score?: number;
}

/**
 * Interface defining the operations for a vector database.
 * This acts as the boundary abstraction (Dependency Inversion Principle),
 * preventing the application core from being tightly coupled to a specific database implementation.
 */
export interface VectorStore {
  /**
   * Initializes the database connection, ensures schema definitions, and establishes initial connections.
   */
  initialize(): Promise<void>;

  /**
   * Inserts or updates an array of document chunks in the database.
   * @param documents Array of chunks to index.
   */
  addDocuments(documents: DocumentChunk[]): Promise<void>;

  /**
   * Performs a similarity search based on the provided query vector.
   * Returns the top-k most similar document chunks, including their similarity scores.
   * 
   * @param queryEmbedding The semantic vector embedding of the user's query.
   * @param limit The maximum number of results to return (k).
   * @param options Optional database-specific overrides or filtering parameters.
   */
  similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: Record<string, unknown>
  ): Promise<DocumentChunk[]>;

  /**
   * Resets the store by clearing all documents or dropping the active tables.
   */
  clear(): Promise<void>;
}

/**
 * Represents a processed, cleaned web page ready for chunking and embedding.
 * Boilerplates like navigation, scripts, footer, and styling are stripped.
 */
export interface ProcessedPage {
  /** The source URL of the page */
  url: string;
  
  /** The title of the page */
  title: string;
  
  /** Clean, semantic, markdown-like textual content of the page */
  content: string;
}

/**
 * Represents a document chunk that has a generated embedding vector.
 * Extends DocumentChunk to guarantee that the embedding property is defined.
 */
export interface EmbeddedDocumentChunk extends DocumentChunk {
  embedding: number[];
}

