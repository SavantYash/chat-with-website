import { DocumentChunk, VectorStore, SearchOptions, MetadataFilter, VectorStoreConfig, VectorStoreCapabilities } from "../../types";

/**
 * Helper to compute cosine similarity between two numeric vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: vector A is ${a.length}, vector B is ${b.length}`);
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * MockVectorStore implements VectorStore using an in-memory array.
 * Highly suitable for unit testing, avoiding local file writes and external API dependencies.
 */
export class MockVectorStore implements VectorStore {
  readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsUpsert: true,
    supportsDelete: true
  };
  
  private chunks: DocumentChunk[] = [];
  private isInitialized = false;
  private readonly dimensions: number;

  constructor(config: VectorStoreConfig) {
    this.dimensions = config.embeddingDimension;
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  private checkInitialized() {
    if (!this.isInitialized) {
      throw new Error("MockVectorStore is not initialized. Call initialize() first.");
    }
  }

  private matchesFilter(chunk: DocumentChunk, filter: MetadataFilter): boolean {
    const fieldVal = (chunk as any)[filter.field];
    const targetVal = filter.value;

    switch (filter.operator) {
      case "eq":
        return fieldVal === targetVal;
      case "neq":
        return fieldVal !== targetVal;
      case "gt":
        return fieldVal > targetVal;
      case "lt":
        return fieldVal < targetVal;
      case "contains":
        if (typeof fieldVal === "string" && typeof targetVal === "string") {
          return fieldVal.includes(targetVal);
        }
        return fieldVal === targetVal;
      case "in":
        if (Array.isArray(targetVal)) {
          return targetVal.includes(fieldVal);
        }
        return false;
      default:
        return false;
    }
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: SearchOptions
  ): Promise<DocumentChunk[]> {
    this.checkInitialized();

    if (queryEmbedding.length !== this.dimensions) {
      throw new Error(
        `Query embedding dimension (${queryEmbedding.length}) does not match store dimension (${this.dimensions}).`
      );
    }

    // 1. Filter chunks based on options
    let filtered = this.chunks;
    if (options?.filters && options.filters.length > 0) {
      filtered = filtered.filter(chunk =>
        options.filters!.every(filter => this.matchesFilter(chunk, filter))
      );
    }

    // 2. Map and calculate similarity score
    const results = filtered.map(chunk => {
      if (!chunk.embedding) {
        return { ...chunk, score: 0 };
      }
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      return { ...chunk, score };
    });

    // 3. Sort by score descending (higher cosine similarity is better)
    results.sort((a, b) => b.score! - a.score!);

    // 4. Return top-k
    return results.slice(0, limit);
  }

  async upsert(documents: DocumentChunk[]): Promise<void> {
    this.checkInitialized();

    for (const doc of documents) {
      if (!doc.embedding) {
        throw new Error(`Document chunk with ID ${doc.id} is missing its embedding.`);
      }
      if (doc.embedding.length !== this.dimensions) {
        throw new Error(
          `Document chunk embedding dimension (${doc.embedding.length}) does not match store dimension (${this.dimensions}).`
        );
      }

      // Check if it already exists, remove it, then push (simulating upsert)
      this.chunks = this.chunks.filter(c => c.id !== doc.id);
      
      // Store a deep copy to prevent external mutation issues
      this.chunks.push({
        ...doc,
        embedding: [...doc.embedding],
      });
    }
  }

  async delete(options: SearchOptions): Promise<void> {
    this.checkInitialized();
    if (!options.filters || options.filters.length === 0) {
      throw new Error("delete options must include filters to prevent accidental full table wipe.");
    }

    this.chunks = this.chunks.filter(chunk =>
      !options.filters!.every(filter => this.matchesFilter(chunk, filter))
    );
  }

  async count(): Promise<number> {
    this.checkInitialized();
    return this.chunks.length;
  }

  async clear(): Promise<void> {
    this.checkInitialized();
    this.chunks = [];
  }
}
