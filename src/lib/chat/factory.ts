import { ChatService } from "./chat-service";
import { Retriever } from "./retriever";
import { PromptBuilder } from "./prompt-builder";
import { GeminiChatProvider } from "../llm/gemini-chat";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { LanceDBStore } from "../db/lancedb-store";
import { IndexingPipeline } from "../rag/indexing-pipeline";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "../rag/html-extractor";
import { DocumentChunker } from "../rag/chunker";

/**
 * Creates and initializes a ChatService instance by resolving all DI dependencies.
 * Ensures the exact same database path and table defaults are reused to synchronize
 * with the indexing pipeline.
 * 
 * @returns A promise resolving to the initialized ChatService.
 */
export async function createChatService(): Promise<ChatService> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[ChatServiceFactory] GEMINI_API_KEY environment variable is not defined."
    );
  }

  // 1. Ingestion/Retrieval matching configurations
  const embeddingProvider = new GeminiEmbeddingProvider({
    apiKey,
    normalizeVectors: true,
  });

  // Reuses the exact same LanceDB dbUri and tableName as the indexing pipeline
  const vectorStore = new LanceDBStore({
    uri: "./data/lancedb",
    namespace: "web_chunks",
    embeddingDimension: 768, // Matches Gemini embedding dimension output size
  });

  // Pre-initialize connection schema mappings
  await vectorStore.initialize();

  // 2. Chat modules
  const retriever = new Retriever(embeddingProvider, vectorStore);
  const promptBuilder = new PromptBuilder();
  const chatProvider = new GeminiChatProvider({
    apiKey,
    maxRetries: 3,
    retryDelay: 1000,
  });

  return new ChatService(retriever, promptBuilder, chatProvider);
}

/**
 * Creates and initializes an IndexingPipeline instance by resolving all DI dependencies.
 * Reuses the same database configuration as the chat service to ensure consistency.
 * 
 * @returns A promise resolving to the initialized IndexingPipeline.
 */
export async function createIndexingPipeline(): Promise<IndexingPipeline> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[IndexingPipelineFactory] GEMINI_API_KEY environment variable is not defined."
    );
  }

  const crawler = new WebsiteCrawler();
  const extractor = new HtmlExtractor();
  const chunker = new DocumentChunker({ chunkSize: 800, chunkOverlap: 150 });
  const embeddingProvider = new GeminiEmbeddingProvider({
    apiKey,
    normalizeVectors: true,
  });

  const vectorStore = new LanceDBStore({
    uri: "./data/lancedb",
    namespace: "web_chunks",
    embeddingDimension: 768,
  });

  await vectorStore.initialize();

  return new IndexingPipeline(
    crawler,
    extractor,
    chunker,
    embeddingProvider,
    vectorStore
  );
}
