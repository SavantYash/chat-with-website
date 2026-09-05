import { DocumentChunker } from "./chunker";
import { IndexingPipeline } from "./indexing-pipeline";
import { MockVectorStore } from "../db/mock-store";
import { EmbeddingProvider } from "../llm/embedding-provider";
import { FileKnowledgeSource } from "../sources/file-source";
import { PromptBuilder } from "../chat/prompt-builder";

// Mock Embedding Provider for offline testing
class MockEmbeddingProvider implements EmbeddingProvider {
  getModelName(): string {
    return "mock-embedding-model";
  }
  getDimensions(): number {
    return 768;
  }
  async embed(_text: string): Promise<number[]> {
    return new Array(768).fill(0.1);
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(768).fill(0.1));
  }
}

async function runMultiSourceTest() {
  console.log("=== Testing Multi-Source Ingestion Pipeline ===");

  const chunker = new DocumentChunker({ chunkSize: 300, chunkOverlap: 50 });
  const embeddingProvider = new MockEmbeddingProvider();
  const vectorStore = new MockVectorStore({
    uri: "mock://memory",
    embeddingDimension: 768,
  });
  await vectorStore.initialize();

  const pipeline = new IndexingPipeline(chunker, embeddingProvider, vectorStore);

  // 1. Ingest File Knowledge Source
  console.log("\n1. Ingesting Project Documentation via FileKnowledgeSource:");
  const sampleDoc = `# Antigravity RAG System
The system supports multi-source ingestion including websites and local files.
Documents are parsed into NormalizedDocuments before chunking and embedding.
This enables a generic architecture without duplicating retrieval or chat logic.`;

  const fileSource = new FileKnowledgeSource({
    files: [
      {
        buffer: Buffer.from(sampleDoc, "utf-8"),
        fileName: "Architecture.md",
        mimeType: "text/markdown",
      },
    ],
  });

  const summary = await pipeline.run(fileSource, { clearExisting: true });
  console.log("✓ Ingestion Summary:", {
    documentsProcessed: summary.pagesVisited,
    documentsIndexed: summary.pagesIndexed,
    chunksCreated: summary.chunksCreated,
    chunksStored: summary.chunksStored,
  });

  if (summary.chunksStored === 0) {
    throw new Error("❌ Failed: 0 chunks stored in vector store.");
  }

  // 2. Perform Vector Search & Prompt Grounding Test
  console.log("\n2. Testing Similarity Search & Prompt Grounding:");
  const mockQueryVector = new Array(768).fill(0.1);
  const retrievedChunks = await vectorStore.similaritySearch(mockQueryVector, 2);

  console.log(`✓ Retrieved ${retrievedChunks.length} chunk(s) from MockVectorStore:`);
  console.log("  - Chunk 1 metadata:", retrievedChunks[0].metadata);

  const promptBuilder = new PromptBuilder();
  const prompt = promptBuilder.buildPrompt(
    "How does the multi-source ingestion work?",
    retrievedChunks
  );

  console.log("\n3. Generated LLM Grounding Prompt:\n");
  console.log("-----------------------------------------");
  console.log(prompt);
  console.log("-----------------------------------------");

  if (!prompt.includes("File: Architecture.md") || !prompt.includes("knowledge base")) {
    throw new Error("❌ Prompt does not contain expected file citations or generalized instructions.");
  }

  console.log("\n🎉 Multi-source RAG integration test completed successfully!");
}

runMultiSourceTest().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});
