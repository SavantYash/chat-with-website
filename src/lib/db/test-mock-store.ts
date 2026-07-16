import { MockVectorStore } from "./mock-store";
import { DocumentChunk } from "../../types";

/**
 * Unit test for MockVectorStore to verify correctness of in-memory search and operations.
 * Run using: npx tsx src/lib/db/test-mock-store.ts
 */
async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running MockVectorStore Unit Test");
  console.log("=========================================");

  const store = new MockVectorStore({
    uri: "mock://test",
    embeddingDimension: 3,
  });

  try {
    // 1. Initialize
    await store.initialize();
    console.log("   ✅ Mock store initialized.");
    console.log(`   ✅ Capabilities: ${JSON.stringify(store.capabilities)}`);

    // 2. Insert chunks
    const chunks: DocumentChunk[] = [
      {
        id: "doc-1",
        url: "https://example.com/one",
        title: "Document One",
        content: "This is document one content.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 29,
        embedding: [1.0, 0.0, 0.0],
      },
      {
        id: "doc-2",
        url: "https://example.com/two",
        title: "Document Two",
        content: "This is document two content.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 29,
        embedding: [0.0, 1.0, 0.0],
      },
      {
        id: "doc-3",
        url: "https://example.com/three",
        title: "Document Three",
        content: "This is document three content.",
        chunkIndex: 0,
        totalChunks: 1,
        startOffset: 0,
        endOffset: 31,
        embedding: [0.0, 0.0, 1.0],
      },
    ];

    await store.upsert(chunks);
    console.log(`   ✅ Inserted ${await store.count()} chunks.`);

    // 3. Test upsert update
    console.log("   Updating doc-1...");
    const updatedDoc1 = {
      ...chunks[0],
      content: "This is updated document one content.",
    };
    await store.upsert([updatedDoc1]);
    const countAfterUpdate = await store.count();
    console.log(`   count after update: ${countAfterUpdate} (Expected: 3)`);
    if (countAfterUpdate !== 3) throw new Error("upsert update duplicated records");

    // 4. Test similaritySearch
    console.log("   Testing similarity search...");
    const query = [0.9, 0.1, 0.0];
    const results = await store.similaritySearch(query, 1);
    console.log(`   Top result ID: ${results[0].id} (Expected: doc-1)`);
    console.log(`   Top result content: "${results[0].content}"`);
    if (results[0].id !== "doc-1") throw new Error("similarity search failed to return closest vector");

    // 5. Test similaritySearch with metadata filters
    console.log("   Testing similarity search with EQ filter...");
    const filteredResults = await store.similaritySearch(query, 3, {
      filters: [{ field: "url", operator: "eq", value: "https://example.com/two" }],
    });
    console.log(`   Filtered result count: ${filteredResults.length} (Expected: 1)`);
    console.log(`   Filtered result ID: ${filteredResults[0].id} (Expected: doc-2)`);
    if (filteredResults.length !== 1 || filteredResults[0].id !== "doc-2") {
      throw new Error("similarity search metadata filtering failed");
    }

    // 6. Test delete with filters
    console.log("   Testing generic delete by URL filter...");
    await store.delete({
      filters: [{ field: "url", operator: "eq", value: "https://example.com/two" }],
    });
    const countAfterDeleteUrl = await store.count();
    console.log(`   count after delete url: ${countAfterDeleteUrl} (Expected: 2)`);
    if (countAfterDeleteUrl !== 2) throw new Error("delete URL filter failed");

    // 7. Test delete by IDs
    console.log("   Testing generic delete by ID filter...");
    await store.delete({
      filters: [{ field: "id", operator: "in", value: ["doc-3"] }],
    });
    const countAfterDeleteIds = await store.count();
    console.log(`   count after delete IDs: ${countAfterDeleteIds} (Expected: 1)`);
    if (countAfterDeleteIds !== 1) throw new Error("delete ID filter failed");

    // 8. Test clear
    console.log("   Testing clear...");
    await store.clear();
    const finalCount = await store.count();
    console.log(`   final count after clear: ${finalCount} (Expected: 0)`);
    if (finalCount !== 0) throw new Error("clear failed");

    console.log("\n=========================================");
    console.log("🎉 MockVectorStore tests completed successfully!");
    console.log("=========================================");
  } catch (error) {
    console.error("\n❌ MockVectorStore test failed with error:", error);
    process.exit(1);
  }
}

runTest();
