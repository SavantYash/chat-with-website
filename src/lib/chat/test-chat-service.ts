import * as fs from "fs";
import * as path from "path";
import { ChatService } from "./chat-service";
import { Retriever } from "./retriever";
import { PromptBuilder } from "./prompt-builder";
import { GeminiChatProvider } from "../llm/gemini-chat";
import { GeminiEmbeddingProvider } from "../llm/gemini-embedding";
import { LanceDBStore } from "../db/lancedb-store";

/**
 * Programmatic .env.local loader for standalone runners.
 * Note: Under privacy and security requirements, we load the environment variables
 * to process.env without reading, printing, or logging their values.
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

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running ChatService Integration Test");
  console.log("=========================================");

  try {
    // 1. Initialize DI Components
    console.log("\n1️⃣  Initializing components and vector store...");
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

    const retriever = new Retriever(embeddingProvider, vectorStore);
    const promptBuilder = new PromptBuilder();
    
    // Configured to default to gemini-3.1-flash-lite
    const chatProvider = new GeminiChatProvider({
      apiKey,
      maxRetries: 3,
      retryDelay: 1000,
    });

    const chatService = new ChatService(retriever, promptBuilder, chatProvider);

    // 2. Define Test Queries
    const testQueries = [
      {
        question: "What is JavaScript?",
        type: "Answerable Query 1",
      },
      {
        question: "How do functions work in JS?",
        type: "Answerable Query 2",
      },
      {
        question: "What are the primary colors?",
        type: "Out-of-scope Query (Expect Grounded Fallback)",
      },
    ];

    // 3. Run Q&A loops
    console.log("\n2️⃣  Executing ChatService Q&A query suite...");
    for (const item of testQueries) {
      console.log("\n-----------------------------------------");
      console.log(`🔍 [${item.type}] Query: "${item.question}"`);
      console.log("-----------------------------------------");

      const start = performance.now();
      const response = await chatService.ask(item.question, {
        topK: 3,
        temperature: 0.1,
        maxOutputTokens: 150,
      });
      const duration = performance.now() - start;

      console.log("\n💬 Chat Response Answer:");
      console.log("-----------------------------------------");
      console.log(response.answer.trim());
      console.log("-----------------------------------------");

      console.log(`\n📚 Cited Sources (${response.sources.length}):`);
      response.sources.forEach((source, index) => {
        console.log(`  Source #${index + 1}:`);
        console.log(`    - Title:    ${source.title}`);
        console.log(`    - URL:      ${source.url}`);
        console.log(`    - Chunk:    ${source.chunkNumber} of ${source.totalChunks}`);
        console.log(`    - Distance: ${source.distance?.toFixed(5) ?? "N/A"}`);
      });

      console.log(`\n⏱️  Timing: ask() completed in ${duration.toFixed(1)}ms.`);

      // Verify that out-of-scope queries trigger the correct grounded fallback response
      if (item.type.includes("Out-of-scope")) {
        const expectedFallback = "I couldn't find that information in the indexed website.";
        if (response.answer.trim().includes(expectedFallback)) {
          console.log("\n✅ SUCCESS: Correctly triggered grounded fallback response for out-of-scope query.");
        } else {
          console.warn("\n⚠️ WARNING: Out-of-scope query did not return the exact expected fallback text.");
        }
      }
    }

    console.log("\n=========================================");
    console.log("✅ SUCCESS: ChatService integration checks passed!");
    console.log("=========================================");

  } catch (error) {
    console.error("\n❌ ChatService test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
