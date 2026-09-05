import { ChatService } from "./chat-service";
import { Retriever } from "./retriever";
import { PromptBuilder } from "./prompt-builder";
import { GeminiChatProvider } from "../llm/gemini-chat";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { PgVectorStore } from "../db/pgvector-store";
import { LanceDBStore } from "../db/lancedb-store";
import { MockVectorStore } from "../db/mock-store";
import { IndexingPipeline } from "../rag/indexing-pipeline";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "../rag/html-extractor";
import { DocumentChunker } from "../rag/chunker";
import { WebsiteKnowledgeSource, WebsiteSourceOptions } from "../sources/website-source";
import { FileKnowledgeSource, FileInput } from "../sources/file-source";
import { ExtractorRegistry, defaultExtractorRegistry } from "../extractors";
import { VectorStore } from "../../types";

/**
 * Thread-safe cached initialization promise for the singleton VectorStore instance.
 * Ensures concurrent requests in Next.js share the exact same in-flight or resolved store.
 */
let vectorStorePromise: Promise<VectorStore> | null = null;

/**
 * Creates a VectorStore instance based on the VECTOR_DB environment variable.
 * Supported values:
 * - "lancedb" (or default): Local embedded LanceDB (zero-config, high-performance)
 * - "supabase" (or "pgvector"): Remote Supabase PostgreSQL pgvector
 * - "mock": In-memory store for unit tests
 */
export function createVectorStore(): VectorStore {
  const vectorDbEnv = (process.env.VECTOR_DB || "lancedb").trim().toLowerCase();

  // 1. Explicit Supabase selection
  if (vectorDbEnv === "supabase" || vectorDbEnv === "pgvector") {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error(
        "[VectorStoreFactory] VECTOR_DB=supabase requires SUPABASE_URL environment variable to be defined."
      );
    }
    if (!serviceRoleKey) {
      throw new Error(
        "[VectorStoreFactory] VECTOR_DB=supabase requires SUPABASE_SERVICE_ROLE_KEY environment variable to be defined."
      );
    }

    console.log(`[VectorStoreFactory] Using Supabase pgvector store at '${supabaseUrl}'`);
    return new PgVectorStore({
      uri: supabaseUrl,
      serviceRoleKey,
      namespace: process.env.VECTOR_DB_TABLE || "web_chunks",
      embeddingDimension: 768,
    });
  }

  // 2. Mock store selection
  if (vectorDbEnv === "mock") {
    console.log(`[VectorStoreFactory] Using in-memory MockVectorStore.`);
    return new MockVectorStore({
      uri: "mock://memory",
      embeddingDimension: 768,
    });
  }

  // 3. Default: Local LanceDB
  const lanceDbUri = process.env.LANCEDB_URI || "./data/lancedb";
  console.log(`[VectorStoreFactory] Using local LanceDB vector store at '${lanceDbUri}'`);
  return new LanceDBStore({
    uri: lanceDbUri,
    namespace: process.env.VECTOR_DB_TABLE || "web_chunks",
    embeddingDimension: 768,
  });
}

/**
 * Returns the initialized singleton VectorStore, ensuring thread-safe one-time initialization.
 */
export async function getOrInitVectorStore(): Promise<VectorStore> {
  if (!vectorStorePromise) {
    vectorStorePromise = (async () => {
      const store = createVectorStore();
      await store.initialize();
      return store;
    })().catch((error) => {
      // Reset promise on initialization failure to allow subsequent retries
      vectorStorePromise = null;
      throw error;
    });
  }
  return vectorStorePromise;
}

/**
 * Reset helper for testing environments.
 */
export function resetVectorStoreCache(): void {
  vectorStorePromise = null;
}

/**
 * Creates and initializes a ChatService instance by resolving all DI dependencies.
 */
export async function createChatService(): Promise<ChatService> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[ChatServiceFactory] GEMINI_API_KEY environment variable is not defined."
    );
  }

  const embeddingProvider = new GeminiEmbeddingProvider({
    apiKey,
    normalizeVectors: true,
  });

  const vectorStore = await getOrInitVectorStore();

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

  const vectorStore = await getOrInitVectorStore();

  return new IndexingPipeline(
    crawler,
    extractor,
    chunker,
    embeddingProvider,
    vectorStore
  );
}

export function createWebsiteSource(options: WebsiteSourceOptions): WebsiteKnowledgeSource {
  return new WebsiteKnowledgeSource(options);
}

export function createFileSource(
  files: FileInput[],
  registry?: ExtractorRegistry
): FileKnowledgeSource {
  return new FileKnowledgeSource({ files, registry: registry ?? defaultExtractorRegistry });
}
