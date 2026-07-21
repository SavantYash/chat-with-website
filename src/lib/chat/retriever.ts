import { VectorStore, DocumentChunk } from "../../types";
import { EmbeddingProvider } from "../llm/embedding-provider";
import { normalizeQuery } from "./query-normalizer";

/**
 * Retriever orchestrates the semantic query retrieval process in the RAG system.
 * 
 * Flow:
 * User Question -> EmbeddingProvider.embed() -> VectorStore.similaritySearch() -> DocumentChunk[]
 * 
 * Features:
 * 1. Dependency Injection: Accepts generic EmbeddingProvider and VectorStore contracts.
 * 2. Performance Tracking: Measures and prints internal latency metrics for embedding and database lookup.
 * 3. Minimal Responsibility: Focuses exclusively on retrieval and logging, leaving prompt building to downstream layers.
 */
export class Retriever {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly vectorStore: VectorStore
  ) {}

  /**
   * Retrieves relevant document chunks for a natural language question.
   * 
   * @param question The user's query/question string.
   * @param topK The number of nearest neighbor document chunks to retrieve (defaults to 3).
   * @returns A promise resolving to the closest matching DocumentChunks, preserving database distance scores.
   */
  async retrieve(question: string, topK: number = 3): Promise<DocumentChunk[]> {
    const retrievalStart = performance.now();
    const normalizedQuestion = normalizeQuery(question);

    console.log(`[Retriever] Starting retrieval for query: "${question}" (normalized: "${normalizedQuestion}", topK: ${topK})`);

    // 1. Generate query embedding vector
    const embedStart = performance.now();
    let queryEmbedding: number[];
    try {
      console.log(`[Retriever] Requesting vector embedding from provider: ${this.embeddingProvider.getModelName()}...`);
      queryEmbedding = await this.embeddingProvider.embed(normalizedQuestion || question);
    } catch (error: any) {
      console.error(`[Retriever] ❌ Failed to generate embedding for query: ${error.message}`);
      throw error;
    }
    const embeddingTime = performance.now() - embedStart;
    console.log(`[Retriever] Embedding generated successfully in ${embeddingTime.toFixed(1)}ms.`);

    // 2. Perform similarity search in LanceDB vector store
    const searchStart = performance.now();
    let chunks: DocumentChunk[];
    try {
      console.log(`[Retriever] Performing similarity search against vector store (topK: ${topK})...`);
      chunks = await this.vectorStore.similaritySearch(queryEmbedding, topK);
    } catch (error: any) {
      console.error(`[Retriever] ❌ Similarity search failed: ${error.message}`);
      throw error;
    }
    const searchTime = performance.now() - searchStart;
    const totalTime = performance.now() - retrievalStart;

    console.log(
      `[Retriever] Search finished. Retrieved ${chunks.length} chunks. Timing metrics:\n` +
      `  - Embedding Time: ${embeddingTime.toFixed(1)}ms\n` +
      `  - Search Time:    ${searchTime.toFixed(1)}ms\n` +
      `  - Total Time:     ${totalTime.toFixed(1)}ms`
    );

    return chunks;
  }
}
