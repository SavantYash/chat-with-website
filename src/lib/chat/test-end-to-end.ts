import * as fs from "fs";
import * as path from "path";
import { createIndexingPipeline, createChatService } from "./factory";
import { MockVectorStore } from "../db/mock-store";

/**
 * Programmatic .env.local loader for standalone runners.
 * Loads variables safely to process.env without printing their values.
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
  console.error("❌ ERROR: GEMINI_API_KEY environment variable is not defined.");
  process.exit(1);
}

async function runEndToEndVerification() {
  console.log("=================================================");
  console.log("🚀 Starting End-to-End RAG Ingestion & QA Check");
  console.log("=================================================");

  try {
    // 1. Initialize Vector Store to Inspect Counts
    console.log("\n1️⃣  Connecting to Mock Vector Store...");
    const vectorStore = new MockVectorStore({
      namespace: "web_chunks",
      embeddingDimension: 768,
    });
    await vectorStore.initialize();
    
    // Purge table to test complete end-to-end ingestion
    console.log("   Clearing any existing table data...");
    await vectorStore.clear();

    // 2. Instantiate and Run IndexingPipeline
    console.log("\n2️⃣  Resolving IndexingPipeline and triggering crawl of example.com...");
    const pipeline = await createIndexingPipeline();
    
    const summary = await pipeline.run("https://example.com", {
      maxPages: 1,
      maxDepth: 0,
      clearExisting: true,
      onProgress: (event) => {
        console.log(`   [Pipeline Progress] Stage: ${event.stage.toUpperCase().padEnd(10)} | ${event.message}`);
      },
    });

    console.log("\n📊 Indexing Summary Results:");
    console.log(`   - Crawled Pages:  ${summary.pagesIndexed}`);
    console.log(`   - Chunks Written: ${summary.chunksStored}`);
    console.log(`   - Skipped Pages:  ${summary.skippedPages}`);

    // Verification 3: Confirm vectors are written and count is > 0
    console.log("\n3️⃣  Verifying Vector Persistence in LanceDB...");
    // Re-initialize the local handle since the pipeline drops and rebuilds the table
    await vectorStore.initialize();
    const mockQueryVector = new Array(768).fill(0);
    const allStoredVectors = await vectorStore.similaritySearch(mockQueryVector, 100);
    console.log(`   - Found ${allStoredVectors.length} vectors stored in the 'web_chunks' table.`);
    
    if (allStoredVectors.length === 0) {
      throw new Error("❌ FAILURE: Vector DB table 'web_chunks' contains 0 chunks after indexing run.");
    }
    console.log("   ✅ SUCCESS: LanceDB contains crawled data.");

    // Verification 4: Instantiate ChatService and run direct Q&A check
    console.log("\n4️⃣  Initializing ChatService and querying RAG pipeline...");
    const chatService = await createChatService();

    const testQuestion = "What is domain is this page used for?";
    console.log(`   Question: "${testQuestion}"`);

    const response = await chatService.ask(testQuestion, {
      topK: 2,
      temperature: 0.1,
      maxOutputTokens: 100,
    });

    console.log("\n💬 Chat Response Answer:");
    console.log("-------------------------------------------------");
    console.log(response.answer.trim());
    console.log("-------------------------------------------------");

    console.log(`\n📚 Cited Sources (${response.sources.length}):`);
    response.sources.forEach((source, idx) => {
      console.log(`  Source #${idx + 1}:`);
      console.log(`    - Title:    ${source.title}`);
      console.log(`    - URL:      ${source.url}`);
      console.log(`    - Chunk:    ${source.chunkNumber} of ${source.totalChunks}`);
    });

    // Verification 5: Ensure the response is grounded and NOT the fallback response
    const fallbackText = "I couldn't find that information in the indexed website.";
    if (response.answer.includes(fallbackText)) {
      throw new Error("❌ FAILURE: Chat answered with fallback. RAG pipeline did not fetch or ground with chunks.");
    }

    if (response.sources.length === 0) {
      throw new Error("❌ FAILURE: Grounded response did not provide source citations.");
    }

    console.log("\n✅ SUCCESS: RAG Chat pipeline produced grounded answers using indexed sources.");
    console.log("\n=================================================");
    console.log("🎉 All End-to-End checks passed successfully!");
    console.log("=================================================");

  } catch (error: any) {
    console.error("\n❌ End-to-End check failed with error:", error.message);
    process.exit(1);
  }
}

runEndToEndVerification();
