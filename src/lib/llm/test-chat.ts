import * as fs from "fs";
import * as path from "path";
import { GeminiChatProvider } from "./gemini-chat";

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

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running GeminiChatProvider Integration Test");
  console.log("=========================================");

  try {
    // 1. Initialize GeminiChatProvider
    console.log("\n1️⃣  Initializing GeminiChatProvider...");
    const provider = new GeminiChatProvider({
      apiKey,
      maxRetries: 3,
      retryDelay: 1000,
    });

    console.log(`   Model Name: ${provider.getModelName()}`);

    // 2. Perform Single Response Generation
    const testPrompt = "Explain what a primary key is in database design in one sentence.";
    console.log(`\n2️⃣  Sending test prompt to Gemini: "${testPrompt}"...`);

    const response = await provider.generateResponse(testPrompt, {
      temperature: 0.1,
      maxOutputTokens: 100,
    });

    console.log("\n💬 Gemini Response:");
    console.log("-----------------------------------------");
    console.log(response.trim());
    console.log("-----------------------------------------");

    if (response && response.trim().length > 0) {
      console.log("\n   ✅ SUCCESS: Response generated successfully!");
    } else {
      console.log("\n   ❌ FAILURE: Response returned empty or undefined.");
      process.exit(1);
    }

    console.log("\n=========================================");
    console.log("🎉 All integration tests passed successfully!");
    console.log("=========================================");

  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
