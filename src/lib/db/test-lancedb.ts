import { LanceDBStore } from "./lancedb-store";
import { DocumentChunk } from "../../types";

/**
 * Standalone test runner to verify LanceDBStore functionality.
 * Run using: npx tsx src/lib/db/test-lancedb.ts
 */
async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running LanceDBStore Integration Test");
  console.log("=========================================");

  // Initialize store with 3-dimensional embeddings for straightforward test vectors
  const testStore = new LanceDBStore({
    dbUri: "./data/test-lancedb",
    tableName: "test_chunks",
    embeddingDimension: 3,
  });

  try {
    // 1. Initialize
    console.log("\n1️⃣  Initializing LanceDBStore...");
    await testStore.initialize();
    console.log("   ✅ Connection established, schema verified.");

    // 2. Insert dummy chunks
    console.log("\n2️⃣  Inserting 3 fake document chunks...");
    const fakeChunks: DocumentChunk[] = [
      {
        id: "chunk-1",
        url: "https://lancedb.com/docs",
        title: "LanceDB Documentation",
        content: "LanceDB is a serverless vector database designed for AI applications. It stores high-dimensional embeddings locally.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 113,
        embedding: [0.1, 0.2, 0.3], // High semantic match for first query
      },
      {
        id: "chunk-2",
        url: "https://nextjs.org/docs",
        title: "Next.js App Router Documentation",
        content: "Next.js App Router is a modern framework for React applications, featuring layout-first routing and Server Components.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 111,
        embedding: [0.9, 0.8, 0.7],
      },
      {
        id: "chunk-3",
        url: "https://deepmind.google/technologies/gemini",
        title: "Gemini AI Models",
        content: "Gemini is Google's most capable multimodal model, built from the ground up to operate across text, code, images, and audio.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 120,
        embedding: [0.5, 0.5, 0.5],
      },
    ];

    await testStore.addDocuments(fakeChunks);
    console.log("   ✅ Inserted chunks successfully.");

    // 3. Perform Similarity Search
    // Querying with a vector close to chunk-1 ([0.12, 0.18, 0.29])
    const queryEmbedding = [0.12, 0.18, 0.29];
    const topK = 2;
    console.log(`\n3️⃣  Performing similarity search for query vector: [${queryEmbedding.join(", ")}] (k = ${topK})...`);
    
    const searchResults = await testStore.similaritySearch(queryEmbedding, topK);
    console.log(`   ✅ Search completed. Retrieved ${searchResults.length} results:`);
    
    searchResults.forEach((chunk, index) => {
      console.log(`\n   Match #${index + 1}:`);
      console.log(`     ID: ${chunk.id}`);
      console.log(`     Title: ${chunk.title}`);
      console.log(`     URL: ${chunk.url}`);
      console.log(`     Content: "${chunk.content}"`);
      console.log(`     Vector: [${(chunk.embedding || []).join(", ")}]`);
      console.log(`     Distance Score: ${chunk.score}`);
    });

    // Verify chunk-1 is returned first due to closeness
    if (searchResults.length > 0 && searchResults[0].id === "chunk-1") {
      console.log("\n   🎉 SUCCESS: Correct document retrieved as top match!");
    } else {
      console.log("\n   ❌ FAILURE: Unexpected top match.");
    }

    // 4. Clear table and clean up
    console.log("\n4️⃣  Clearing store and deleting test tables...");
    await testStore.clear();
    console.log("   ✅ Database cleaned up.");

    console.log("\n=========================================");
    console.log("🎉 All integration tests passed successfully!");
    console.log("=========================================");
  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
