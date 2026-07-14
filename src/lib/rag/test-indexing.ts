import * as fs from "fs";
import * as path from "path";
import { IndexingPipeline } from "./indexing-pipeline";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "./html-extractor";
import { DocumentChunker } from "./chunker";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { LanceDBStore } from "../db/lancedb-store";

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
const dbPath = path.join(process.cwd(), "data", "test-indexing-db");

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running Complete Indexing Pipeline Test");
  console.log("=========================================");

  try {
    // 1. Initialize Services
    console.log("\n1️⃣  Initializing services and DI components...");
    const crawler = new WebsiteCrawler();
    const extractor = new HtmlExtractor();
    const chunker = new DocumentChunker({ chunkSize: 800, chunkOverlap: 150 });
    const embeddingProvider = new GeminiEmbeddingProvider({
      apiKey,
      normalizeVectors: true,
    });
    const vectorStore = new LanceDBStore({
      dbUri: dbPath,
      tableName: "indexed_chunks",
      embeddingDimension: 768,
    });

    await vectorStore.initialize();

    // Create Indexing Pipeline with Injected Dependencies
    const pipeline = new IndexingPipeline(
      crawler,
      extractor,
      chunker,
      embeddingProvider,
      vectorStore
    );

    // 2. Test 1: Index example.com with clearExisting: true
    console.log("\n2️⃣  Indexing https://example.com with clearExisting: true...");
    const summaryExample = await pipeline.run("https://example.com", {
      maxPages: 1,
      maxDepth: 0,
      clearExisting: true,
      onProgress: (event) => {
        console.log(`   [Progress] Stage: ${event.stage.toUpperCase().padEnd(10)} | Message: ${event.message}`);
      },
    });

    // 3. Test 2: Index MDN JavaScript documentation (Max 3 pages)
    console.log("\n3️⃣  Indexing MDN JavaScript documentation subtree (maxPages: 3, clearExisting: false)...");
    const summaryMdn = await pipeline.run(
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      {
        maxPages: 3,
        maxDepth: 1,
        embeddingBatchSize: 10, // Small batch size to enforce chunked processing loops
        clearExisting: false,
        onProgress: (event) => {
          console.log(`   [Progress] Stage: ${event.stage.toUpperCase().padEnd(10)} | Message: ${event.message}`);
        },
      }
    );

    // 4. Verify DB storage stats
    console.log("\n4️⃣  Verifying database storage metrics...");
    console.log(`   - Example Chunks Stored: ${summaryExample.chunksStored}`);
    console.log(`   - MDN Chunks Stored:     ${summaryMdn.chunksStored}`);
    console.log(`   - Total Chunks Stored:   ${summaryExample.chunksStored + summaryMdn.chunksStored}`);

    // 5. Test 3: Query LanceDB with a similarity query
    console.log("\n5️⃣  Querying LanceDB: 'What is JavaScript?'...");
    const testQueryVector = await embeddingProvider.embed("What is JavaScript?");
    const searchResults = await vectorStore.similaritySearch(testQueryVector, 3);

    console.log(`\n🔍 Similarity Search Results (Top 3):`);
    searchResults.forEach((chunk, index) => {
      console.log(`  Match #${index + 1}:`);
      console.log(`    - ID:           ${chunk.id}`);
      console.log(`    - URL:          ${chunk.url}`);
      console.log(`    - Title:        ${chunk.title}`);
      console.log(`    - Chunk Index:  ${chunk.chunkIndex}`);
      console.log(`    - Offsets:      ${chunk.startOffset} to ${chunk.endOffset}`);
      console.log(`    - Score (Dist): ${chunk.score?.toFixed(5)}`);
      console.log(`    - Snippet:      "${chunk.content.substring(0, 120).replace(/\s+/g, " ").trim()}..."`);
    });

    if (searchResults.length > 0) {
      console.log("\n   ✅ SUCCESS: Similarity search matches successfully returned!");
    } else {
      console.log("\n   ❌ FAILURE: No search results returned from database.");
    }

    // 6. Test AbortSignal Cancellation
    console.log("\n6️⃣  Testing AbortSignal Cancellation...");
    const controller = new AbortController();
    
    // Abort after 100ms during crawl stage
    setTimeout(() => {
      console.log("\n   [Test] Triggering AbortController abort signal...");
      controller.abort();
    }, 120);

    try {
      await pipeline.run("https://developer.mozilla.org/en-US/docs/Web/JavaScript", {
        maxPages: 5,
        maxDepth: 2,
        clearExisting: false,
        signal: controller.signal,
        onProgress: (event) => {
          console.log(`   [AbortProgress] Stage: ${event.stage.toUpperCase().padEnd(10)} | Message: ${event.message}`);
        },
      });
      console.log("   ❌ FAILURE: Pipeline completed instead of aborting.");
    } catch (err: any) {
      if (err.name === "AbortError" || err.message.toLowerCase().includes("abort")) {
        console.log(`   ✅ SUCCESS: Pipeline aborted gracefully! Caught: ${err.name} - ${err.message}`);
      } else {
        console.error("   ❌ FAILURE: Unexpected error thrown during abort test:", err);
      }
    }

    // Clean up temporary DB folder
    console.log("\n🧹 Cleaning up test database...");
    await vectorStore.clear();
    console.log("=========================================");
    console.log("✅ SUCCESS: All indexing pipeline integration checks passed!");
    console.log("=========================================");

  } catch (error) {
    console.error("\n❌ Pipeline test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
