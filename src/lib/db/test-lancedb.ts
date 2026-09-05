import { LanceDBStore } from "./lancedb-store";
import { DocumentChunk } from "../../types";

async function runLanceDbTest() {
  console.log("=== Testing LanceDB Store Adapter ===");

  const store = new LanceDBStore({
    uri: "./data/test-lancedb",
    namespace: "test_chunks",
    embeddingDimension: 4,
  });

  await store.initialize();
  console.log("✓ Initialized LanceDB store.");

  await store.clear();
  console.log("✓ Cleared table.");

  const sampleChunks: DocumentChunk[] = [
    {
      id: "doc-1",
      url: "https://example.com/docs/api",
      title: "API Reference",
      content: "Endpoints and authentication documentation",
      chunkIndex: 0,
      totalChunks: 1,
      startOffset: 0,
      endOffset: 45,
      embedding: [1.0, 0.0, 0.0, 0.0],
    },
    {
      id: "doc-2",
      url: "Architecture.md",
      title: "System Architecture",
      content: "Modular design and RAG ingestion pipeline",
      chunkIndex: 0,
      totalChunks: 1,
      startOffset: 0,
      endOffset: 41,
      embedding: [0.0, 1.0, 0.0, 0.0],
    },
  ];

  await store.upsert(sampleChunks);
  console.log("✓ Upserted 2 sample chunks.");

  const count = await store.count();
  console.log(`✓ Stored chunk count: ${count}`);

  const results = await store.similaritySearch([1.0, 0.0, 0.0, 0.0], 1);
  console.log("✓ Search Result:", results[0]?.title);

  if (results[0]?.id !== "doc-1") {
    throw new Error("❌ LanceDB similarity search returned unexpected top result.");
  }

  await store.clear();
  console.log("\n🎉 LanceDBStore tests passed successfully!");
}

runLanceDbTest().catch((err) => {
  console.error("❌ LanceDB test failed:", err);
  process.exit(1);
});
