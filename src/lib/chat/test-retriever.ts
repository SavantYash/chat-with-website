import * as fs from "fs";
import * as path from "path";
import { Retriever } from "./retriever";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { LanceDBStore } from "../db/lancedb-store";
import { IndexingPipeline } from "../rag/indexing-pipeline";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "../rag/html-extractor";
import { DocumentChunker } from "../rag/chunker";

/**
 * Programmatic .env.local loader for standalone runners.
 */
function loadEnvFile() {
  const envPaths = [".env.local", ".env"];
  for (const envFile of envPaths) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const firstEqual = trimmed.indexOf("=");
          if (firstEqual !== -1) {
            const key = trimmed.slice(0, firstEqual).trim();
            let value = trimmed.slice(firstEqual + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      });
      break;
    }
  }
}

loadEnvFile();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: GEMINI_API_KEY environment variable is not defined in .env.local.");
  process.exit(1);
}

// Local path for database testing
const dbPath = path.join(process.cwd(), "data", "test-retriever-db");

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running Retriever Integration Test");
  console.log("=========================================");

  try {
    // 1. Initialize Services
    console.log("\n1️⃣  Initializing components and vector store...");
    const embeddingProvider = new GeminiEmbeddingProvider({
      apiKey,
      normalizeVectors: true,
    });

    const vectorStore = new LanceDBStore({
      dbUri: dbPath,
      tableName: "retrieval_chunks",
      embeddingDimension: 768,
    });

    await vectorStore.initialize();

    // 2. Seeding DB with Indexing Pipeline (to ensure data exists)
    console.log("\n2️⃣  Seeding database with example.com...");
    const crawler = new WebsiteCrawler();
    const extractor = new HtmlExtractor();
    const chunker = new DocumentChunker({ chunkSize: 800, chunkOverlap: 150 });
    const indexingPipeline = new IndexingPipeline(
      crawler,
      extractor,
      chunker,
      embeddingProvider,
      vectorStore
    );

    await indexingPipeline.run("https://example.com", {
      maxPages: 1,
      maxDepth: 0,
      clearExisting: true,
    });

    // 3. Initialize Retriever
    console.log("\n3️⃣  Initializing Retriever...");
    const retriever = new Retriever(embeddingProvider, vectorStore);

    // 4. Run Semantic Queries
    const testQueries = [
      "What is this domain used for?",
      "Do I need to ask for permission to use this domain?",
      "Explain the purpose of example.com",
    ];

    console.log("\n4️⃣  Executing semantic search queries...");
    for (const query of testQueries) {
      console.log("\n-----------------------------------------");
      console.log(`🔍 Query: "${query}"`);
      console.log("-----------------------------------------");

      const topK = 2;
      const chunks = await retriever.retrieve(query, topK);

      console.log(`\n📄 Retrieved ${chunks.length} chunks (requested topK: ${topK}):`);
      chunks.forEach((chunk, index) => {
        console.log(`  Match #${index + 1}:`);
        console.log(`    - ID:       ${chunk.id}`);
        console.log(`    - URL:      ${chunk.url}`);
        console.log(`    - Title:    ${chunk.title}`);
        console.log(`    - Distance: ${chunk.score?.toFixed(5)}`);
        console.log(`    - Snippet:  "${chunk.content.substring(0, 200).replace(/\s+/g, " ").trim()}..."`);
      });

      if (chunks.length > 0) {
        console.log("\n✅ SUCCESS: Retrieved relevant matches!");
      } else {
        console.warn("\n⚠️ WARNING: No matches retrieved.");
      }
    }

    // 5. Clean up temporary DB folder
    console.log("\n🧹 Cleaning up test database...");
    await vectorStore.clear();
    console.log("=========================================");
    console.log("✅ SUCCESS: Retriever integration checks passed!");
    console.log("=========================================");

  } catch (error) {
    console.error("\n❌ Retriever test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
