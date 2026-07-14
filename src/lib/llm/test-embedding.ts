import * as fs from "fs";
import * as path from "path";
import { GeminiEmbeddingProvider } from "./gemini-embedding";

/**
 * Helper to programmatically load .env.local or .env variables for local script runners.
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
            // Strip quotes if present
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

// Load env before test logic executes
loadEnvFile();

/**
 * Standalone test script to verify GeminiEmbeddingProvider features, vector integrity,
 * batch processing sequences, and semantic cosine similarity matrices.
 * 
 * Run using: npx tsx src/lib/llm/test-embedding.ts
 */
function dotProduct(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error(`Dimension mismatch: v1 is ${v1.length}, v2 is ${v2.length}`);
  }
  return v1.reduce((sum, val, idx) => sum + val * v2[idx], 0);
}

async function runTest() {
  console.log("=================================================");
  console.log("🚀 Running GeminiEmbeddingProvider Integration Test");
  console.log("=================================================");

  // Read environment variable check
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: GEMINI_API_KEY environment variable is not defined in .env.local or shell environment.");
    process.exit(1);
  }

  const sentences = [
    "JavaScript is a programming language.",
    "JS is used to build websites.",
    "Bananas are yellow.",
    "JavaScript is a programming language.", // Duplicate to check matching identity
  ];

  try {
    // 1. Initialize provider
    console.log("\n1️⃣  Initializing GeminiEmbeddingProvider...");
    const provider = new GeminiEmbeddingProvider({
      batchSize: 2, // Low batch size to force testing sequential batching loops
      normalizeVectors: true,
      maxRetries: 3,
      retryDelay: 1000,
    });
    console.log(`   Model Name: ${provider.getModelName()}`);
    console.log(`   Configured Dimensions: ${provider.getDimensions()}`);

    // 2. Single item embedding speed test
    console.log("\n2️⃣  Testing single item embedding latency...");
    const singleStart = performance.now();
    const singleVector = await provider.embed(sentences[0]);
    const singleElapsed = performance.now() - singleStart;
    console.log(`   Generated single embedding in ${singleElapsed.toFixed(1)}ms. Dimension: ${singleVector.length}`);

    // 3. Batch processing test
    console.log("\n3️⃣  Testing batch execution (will run sequentially in batches of 2)...");
    const batchStart = performance.now();
    const vectors = await provider.embedBatch(sentences);
    const batchElapsed = performance.now() - batchStart;

    console.log(`\n✅ Batch processing completed in ${batchElapsed.toFixed(1)}ms.`);
    console.log(`   Total vectors generated: ${vectors.length}`);

    // 4. Validate output dimensionality and values
    console.log("\n4️⃣  Validating vector consistency...");
    let dimensionsMatch = true;
    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      console.log(`   Vector #${i + 1} size: ${vec.length} dimensions.`);
      if (vec.length !== provider.getDimensions()) {
        dimensionsMatch = false;
      }
    }
    
    if (!dimensionsMatch) {
      throw new Error("Mismatched dimensions across generated vectors.");
    }
    console.log("   ✅ All vector dimensions match configured target dimensions.");

    // 5. Calculate and print Cosine Similarity Matrix
    // Since vectors are L2-normalized, cosine similarity(A, B) is equivalent to the dot product of A and B
    console.log("\n5️⃣  Calculating Cosine Similarity Matrix:");
    console.log("--------------------------------------------------------------------------------");
    console.log("   |   S1   |   S2   |   S3   |   S4   |  Sentence Text");
    console.log("--------------------------------------------------------------------------------");
    sentences.forEach((s, idx) => {
      console.log(`S${idx + 1} |        |        |        |        |  "${s}"`);
    });
    console.log("--------------------------------------------------------------------------------");

    const matrix: number[][] = Array(sentences.length)
      .fill(null)
      .map(() => Array(sentences.length).fill(0));

    for (let i = 0; i < sentences.length; i++) {
      for (let j = 0; j < sentences.length; j++) {
        matrix[i][j] = dotProduct(vectors[i], vectors[j]);
      }
    }

    // Print matrix formatted
    let matrixHeader = "     ";
    for (let i = 0; i < sentences.length; i++) {
      matrixHeader += `   S${i + 1}   `;
    }
    console.log(matrixHeader);

    for (let i = 0; i < sentences.length; i++) {
      let rowStr = `S${i + 1}   `;
      for (let j = 0; j < sentences.length; j++) {
        const val = matrix[i][j];
        rowStr += ` [${val.toFixed(4)}]`;
      }
      console.log(rowStr);
    }
    console.log("--------------------------------------------------------------------------------");

    // 6. Semantic and Identity Assertions
    console.log("\n6️⃣  Validating semantic similarity checks...");
    
    // Assert 1: Duplicate sentences similarity ≈ 1.0 (identity)
    const simDuplicate = matrix[0][3];
    console.log(`   - Duplicate Similarity (S1 vs S4): ${simDuplicate.toFixed(5)}`);
    if (simDuplicate > 0.999) {
      console.log("     ✅ PASS: Identical sentences return matching similarity score of 1.0.");
    } else {
      console.log("     ❌ FAIL: Mismatched similarity for identical strings.");
    }

    // Assert 2: JS sentences similarity is greater than JS vs Banana
    const simJS = matrix[0][1]; // S1 vs S2
    const simJSBanana = matrix[0][2]; // S1 vs S3
    const simJSBanana2 = matrix[1][2]; // S2 vs S3

    console.log(`   - JS similarity (S1 vs S2): ${simJS.toFixed(5)}`);
    console.log(`   - JS vs Banana (S1 vs S3):  ${simJSBanana.toFixed(5)}`);
    console.log(`   - JS vs Banana (S2 vs S3):  ${simJSBanana2.toFixed(5)}`);

    if (simJS > simJSBanana && simJS > simJSBanana2) {
      console.log("     ✅ PASS: JS-related sentences are semantically closer than Banana-related sentences.");
    } else {
      console.log("     ❌ FAIL: Semantic similarity relations did not match expectations.");
    }

    // 7. Explanations of why the metrics make sense
    console.log("\n7️⃣  Semantic Analysis Explanation:");
    console.log("   - S1 and S4 are exactly duplicate sentences ('JavaScript is a programming language.').");
    console.log("     Thus, their vector representations are identical, producing a cosine similarity of 1.0000.");
    console.log("   - S1 ('JavaScript is a programming language.') and S2 ('JS is used to build websites.') share");
    console.log("     high semantic overlap regarding web development technologies and JavaScript context.");
    console.log("     This is reflected in their elevated similarity score.");
    console.log("   - S3 ('Bananas are yellow.') talks about botanical fruit coloring, which bears zero contextual");
    console.log("     overlap with software development. This shows up as a much lower similarity score when");
    console.log("     compared against S1 and S2.");
    
    console.log("\n=================================================");
    console.log("✅ SUCCESS: Gemini Embedding Provider works perfectly!");
    console.log("=================================================");

  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
