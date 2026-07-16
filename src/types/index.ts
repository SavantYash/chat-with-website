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

export interface MetadataFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "in";
  value: any;
}

export interface SearchOptions {
  filters?: MetadataFilter[];
}

export interface VectorStoreCapabilities {
  supportsMetadataFiltering: boolean;
  supportsUpsert: boolean;
  supportsDelete: boolean;
}

export interface VectorStoreConfig {
  uri: string;
  namespace?: string;
  embeddingDimension: number;
}

/**
 * Interface defining the operations for a vector database.
 * This acts as the boundary abstraction (Dependency Inversion Principle),
 * preventing the application core from being tightly coupled to a specific database implementation.
 */
export interface VectorStore {
  /**
   * Describes the capabilities supported by this specific vector store adapter.
   */
  readonly capabilities: VectorStoreCapabilities;

  /**
   * Initializes the database connection, ensures schema definitions, and establishes initial connections.
   */
  initialize(): Promise<void>;

  /**
   * Validates that the vector database is reachable, configured correctly, and ready for indexing.
   * The indexing pipeline calls this as a pre-flight check before crawling or embedding work begins.
   */
  validate(): Promise<void>;

  /**
   * Performs a similarity search based on the provided query vector.
   * Returns the top-k most similar document chunks, including their similarity scores.
   * 
   * @param queryEmbedding The semantic vector embedding of the user's query.
   * @param limit The maximum number of results to return (k).
   * @param options Optional search parameters, including metadata filters.
   */
  similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: SearchOptions
  ): Promise<DocumentChunk[]>;

  /**
   * Inserts or updates an array of document chunks in the database.
   * @param documents Array of chunks to index.
   */
  upsert(documents: DocumentChunk[]): Promise<void>;

  /**
   * Deletes document chunks matching standard metadata filters.
   * 
   * @param options Filter options defining which documents to delete.
   */
  delete(options: SearchOptions): Promise<void>;

  /**
   * Returns the total number of document chunks currently indexed.
   */
  count(): Promise<number>;

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

/**
 * Result of indexing an individual webpage.
 */
export interface PageIndexingResult {
  /** The URL of the page */
  url: string;
  /** Whether the page was successfully processed and indexed */
  success: boolean;
  /** The stage where processing failed, if applicable */
  stage?: "crawl" | "extract" | "chunk" | "embed" | "store";
  /** Number of chunks created from this page */
  chunks: number;
  /** Failure details if processing failed */
  failureReason?: string;
}

/**
 * Summary details of a full website indexing pipeline execution.
 */
export interface IndexingSummary {
  /** Total number of unique pages discovered/visited by the crawler */
  pagesVisited: number;
  /** Total number of pages successfully parsed, chunked, and embedded */
  pagesIndexed: number;
  /** Pages skipped due to content length limits or parsing exceptions */
  skippedPages: number;
  /** Total number of document chunks created */
  chunksCreated: number;
  /** Total number of document chunks successfully stored in the vector database */
  chunksStored: number;
  /** Duration of crawling stage in milliseconds */
  crawlDuration: number;
  /** Duration of extraction stage in milliseconds */
  extractionDuration: number;
  /** Duration of chunking stage in milliseconds */
  chunkingDuration: number;
  /** Duration of embedding stage in milliseconds */
  embeddingDuration: number;
  /** Duration of storage stage in milliseconds */
  storageDuration: number;
  /** Pipeline total duration in milliseconds */
  totalDuration: number;
  /** Individual page status records */
  pages: PageIndexingResult[];
}

/**
 * Event broadcasted via onProgress callback.
 */
export interface IndexingProgressEvent {
  stage: "initialize" | "validate" | "crawl" | "extract" | "chunk" | "embed" | "store" | "complete" | "cancel";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Runtime config options for triggering the indexing pipeline.
 */
export interface IndexingConfig {
  /** Limit on crawled pages count */
  maxPages?: number;
  /** Limit on BFS depth level */
  maxDepth?: number;
  /** Chunker token character limit overrides */
  chunkSize?: number;
  /** Chunker overlap size overrides */
  chunkOverlap?: number;
  /** Bulk embedding provider batch size overrides */
  embeddingBatchSize?: number;
  /** Clear vector database before indexing */
  clearExisting?: boolean;
  /** Callback for progress events */
  onProgress?: (event: IndexingProgressEvent) => void;
  /** Signal for abortion */
  signal?: AbortSignal;
  /** Maximum retry attempts for rate limits (HTTP 429) */
  maxRateLimitRetries?: number;
  /** Maximum cumulative wait time in seconds for rate limits */
  maxCumulativeWaitTimeSec?: number;
}

