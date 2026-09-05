import * as fs from "fs";
import * as path from "path";
import { LanceDBStore } from "../db/lancedb-store";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { GeminiChatProvider } from "../llm/gemini-chat";
import { Retriever } from "./retriever";
import { PromptBuilder } from "./prompt-builder";
import { ChatService } from "./chat-service";
import { DocumentChunk } from "../../types";

// Load .env.local manually without external dotenv dependency
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...vals] = trimmed.split("=");
        const value = vals.join("=").trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    }
  }
}

loadEnvFile();

async function runEndToEndLanceDBCitationTest() {
  console.log("\n========================================================");
  console.log("🧪 Running End-to-End Citation Test with LanceDB + Gemini");
  console.log("========================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for this end-to-end citation test.");
  }

  const embeddingProvider = new GeminiEmbeddingProvider({
    apiKey,
    normalizeVectors: true,
  });

  const chatProvider = new GeminiChatProvider({
    apiKey,
    maxRetries: 3,
    retryDelay: 1000,
  });

  const vectorStore = new LanceDBStore({
    uri: "./data/test-e2e-lancedb",
    namespace: "e2e_citation_chunks",
    embeddingDimension: 768,
  });

  await vectorStore.initialize();
  await vectorStore.clear();
  console.log("✓ Initialized & cleared test LanceDB table.\n");

  // Generate realistic embeddings for test documents
  console.log("Generating embeddings for test chunks...");
  const websiteContent =
    "The API allows up to 120 requests per minute per authenticated API key. Exceeding this limit returns HTTP 429 Too Many Requests.";
  const pdfContent =
    "All customer data stored at rest is encrypted using AES-256. All network data in transit is encrypted using TLS 1.3 protocol.";

  const [webEmbedding, pdfEmbedding] = await embeddingProvider.embedBatch([
    websiteContent,
    pdfContent,
  ]);

  const websiteChunk: DocumentChunk = {
    id: "chunk-website-policy",
    url: "https://example.com/docs/rate-limits",
    title: "API Rate Limiting Policy",
    content: websiteContent,
    chunkIndex: 0,
    totalChunks: 1,
    startOffset: 0,
    endOffset: websiteContent.length,
    sourceType: "website",
    sourceName: "API Rate Limiting Policy",
    sourceUrl: "https://example.com/docs/rate-limits",
    metadata: {
      sourceType: "website",
      sourceName: "API Rate Limiting Policy",
      sourceUrl: "https://example.com/docs/rate-limits",
    },
    embedding: webEmbedding,
  };

  const pdfChunk: DocumentChunk = {
    id: "chunk-pdf-security",
    url: "security_whitepaper.pdf",
    title: "Security & Compliance Whitepaper",
    content: pdfContent,
    chunkIndex: 3,
    totalChunks: 12,
    startOffset: 2400,
    endOffset: 2400 + pdfContent.length,
    sourceType: "file",
    sourceName: "Security & Compliance Whitepaper",
    fileName: "security_whitepaper.pdf",
    fileType: "pdf",
    pageNumber: 14,
    metadata: {
      sourceType: "file",
      sourceName: "Security & Compliance Whitepaper",
      fileName: "security_whitepaper.pdf",
      fileType: "pdf",
      pageNumber: 14,
      totalPages: 30,
    },
    embedding: pdfEmbedding,
  };

  await vectorStore.upsert([websiteChunk, pdfChunk]);
  console.log("✓ Upserted website and PDF chunks into LanceDB.\n");

  const retriever = new Retriever(embeddingProvider, vectorStore);
  const promptBuilder = new PromptBuilder();
  const chatService = new ChatService(retriever, promptBuilder, chatProvider);

  // TEST 1: PDF Chunk Retrieval & Page Number Citation
  console.log("--- Test Case 1: PDF Document & Page Citation ---");
  const query1 = "What is the encryption standard for data at rest?";
  console.log(`Question: "${query1}"`);
  const response1 = await chatService.ask(query1, { topK: 1 });

  console.log(`\nGenerated Answer:\n${response1.answer}\n`);
  console.log(`Citations Returned (${response1.sources.length}):`);
  console.dir(response1.sources, { depth: null });

  if (response1.sources.length === 0) {
    throw new Error("❌ Test Case 1 failed: No citations returned.");
  }
  const topCitation1 = response1.sources[0];
  if (topCitation1.sourceType !== "file") {
    throw new Error(`❌ Test Case 1 failed: expected sourceType 'file', got '${topCitation1.sourceType}'`);
  }
  if (topCitation1.fileName !== "security_whitepaper.pdf") {
    throw new Error(`❌ Test Case 1 failed: expected fileName 'security_whitepaper.pdf', got '${topCitation1.fileName}'`);
  }
  if (topCitation1.pageNumber !== 14) {
    throw new Error(`❌ Test Case 1 failed: expected pageNumber 14, got '${topCitation1.pageNumber}'`);
  }
  console.log("✓ Test Case 1 Passed: Correct PDF citation and page number verified!\n");

  // TEST 2: Website Chunk Retrieval & URL Citation
  console.log("--- Test Case 2: Website & URL Citation ---");
  const query2 = "How many requests per minute are allowed on the API?";
  console.log(`Question: "${query2}"`);
  const response2 = await chatService.ask(query2, { topK: 1 });

  console.log(`\nGenerated Answer:\n${response2.answer}\n`);
  console.log(`Citations Returned (${response2.sources.length}):`);
  console.dir(response2.sources, { depth: null });

  if (response2.sources.length === 0) {
    throw new Error("❌ Test Case 2 failed: No citations returned.");
  }
  const topCitation2 = response2.sources[0];
  if (topCitation2.sourceType !== "website") {
    throw new Error(`❌ Test Case 2 failed: expected sourceType 'website', got '${topCitation2.sourceType}'`);
  }
  if (topCitation2.url !== "https://example.com/docs/rate-limits") {
    throw new Error(`❌ Test Case 2 failed: expected URL 'https://example.com/docs/rate-limits', got '${topCitation2.url}'`);
  }
  console.log("✓ Test Case 2 Passed: Correct website URL citation verified!\n");

  // Cleanup
  await vectorStore.clear();
  console.log("🎉 All End-to-End Citation Tests with LanceDB Passed Successfully!\n");
}

runEndToEndLanceDBCitationTest().catch((err) => {
  console.error("❌ End-to-end citation test failed:", err);
  process.exit(1);
});
