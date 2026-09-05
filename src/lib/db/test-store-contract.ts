import { VectorStore, DocumentChunk } from "../../types";
import { LanceDBStore } from "./lancedb-store";
import { MockVectorStore } from "./mock-store";

export async function verifyVectorStoreContract(
  storeName: string,
  store: VectorStore,
  embeddingDimension: number = 4
) {
  console.log(`\n========================================`);
  console.log(`🧪 Running VectorStore Contract Test for: [${storeName}]`);
  console.log(`========================================`);

  // 1. Initialize
  console.log(`1. Testing initialize()...`);
  await store.initialize();
  console.log(`   ✓ initialize() succeeded`);

  // 2. Validate
  console.log(`2. Testing validate()...`);
  await store.validate();
  console.log(`   ✓ validate() succeeded`);

  // 3. Clear initial data
  console.log(`3. Testing clear()...`);
  await store.clear();
  const initialCount = await store.count();
  if (initialCount !== 0) {
    throw new Error(`Expected count after clear() to be 0, got ${initialCount}`);
  }
  console.log(`   ✓ clear() reset count to 0`);

  // 4. Sample Chunks: Website + Multi-Page PDF File
  const sampleWebsiteChunk: DocumentChunk = {
    id: "chunk-web-1",
    url: "https://example.com/docs/auth",
    title: "Authentication Guide",
    content: "Use Bearer tokens in the Authorization header to authenticate requests.",
    chunkIndex: 0,
    totalChunks: 2,
    startOffset: 0,
    endOffset: 72,
    sourceType: "website",
    sourceName: "API Documentation",
    sourceUrl: "https://example.com/docs/auth",
    metadata: {
      sourceType: "website",
      sourceName: "API Documentation",
      sourceUrl: "https://example.com/docs/auth",
    },
    embedding: [1.0, 0.0, 0.0, 0.0],
  };

  const samplePdfChunk: DocumentChunk = {
    id: "chunk-pdf-1",
    url: "handbook.pdf",
    title: "Company Handbook",
    content: "Employees are eligible for remote work benefits and home office stipends.",
    chunkIndex: 2,
    totalChunks: 8,
    startOffset: 1200,
    endOffset: 1280,
    sourceType: "file",
    sourceName: "Company Handbook",
    fileName: "handbook.pdf",
    fileType: "pdf",
    pageNumber: 5,
    metadata: {
      sourceType: "file",
      sourceName: "Company Handbook",
      fileName: "handbook.pdf",
      fileType: "pdf",
      pageNumber: 5,
      totalPages: 24,
    },
    embedding: [0.0, 1.0, 0.0, 0.0],
  };

  // 5. Upsert Chunks
  console.log(`4. Testing upsert() with Website & PDF chunks...`);
  await store.upsert([sampleWebsiteChunk, samplePdfChunk]);
  const afterUpsertCount = await store.count();
  if (afterUpsertCount !== 2) {
    throw new Error(`Expected count after upsert to be 2, got ${afterUpsertCount}`);
  }
  console.log(`   ✓ upsert() stored 2 chunks successfully (count = ${afterUpsertCount})`);

  // 6. Similarity Search (Nearest Neighbor)
  console.log(`5. Testing similaritySearch() ranking...`);
  const webResults = await store.similaritySearch([1.0, 0.0, 0.0, 0.0], 1);
  if (webResults.length !== 1 || webResults[0].id !== "chunk-web-1") {
    throw new Error(`Expected top result to be 'chunk-web-1', got: ${JSON.stringify(webResults[0])}`);
  }
  console.log(`   ✓ Ranked website chunk closest to [1, 0, 0, 0]`);

  const pdfResults = await store.similaritySearch([0.0, 1.0, 0.0, 0.0], 1);
  if (pdfResults.length !== 1 || pdfResults[0].id !== "chunk-pdf-1") {
    throw new Error(`Expected top result to be 'chunk-pdf-1', got: ${JSON.stringify(pdfResults[0])}`);
  }
  console.log(`   ✓ Ranked PDF chunk closest to [0, 1, 0, 0]`);

  // 7. Metadata Round-Trip Fidelity Check
  console.log(`6. Testing Metadata Round-Trip Fidelity...`);
  const retrievedPdf = pdfResults[0];
  if (retrievedPdf.sourceType !== "file") {
    throw new Error(`Metadata mismatch: expected sourceType 'file', got '${retrievedPdf.sourceType}'`);
  }
  if (retrievedPdf.fileName !== "handbook.pdf") {
    throw new Error(`Metadata mismatch: expected fileName 'handbook.pdf', got '${retrievedPdf.fileName}'`);
  }
  if (retrievedPdf.pageNumber !== 5) {
    throw new Error(`Metadata mismatch: expected pageNumber 5, got '${retrievedPdf.pageNumber}'`);
  }
  if (retrievedPdf.fileType !== "pdf") {
    throw new Error(`Metadata mismatch: expected fileType 'pdf', got '${retrievedPdf.fileType}'`);
  }
  console.log(`   ✓ PDF Chunk metadata fully preserved (sourceType, fileName, fileType, pageNumber)`);

  const retrievedWeb = webResults[0];
  if (retrievedWeb.sourceType !== "website") {
    throw new Error(`Metadata mismatch: expected sourceType 'website', got '${retrievedWeb.sourceType}'`);
  }
  if (retrievedWeb.sourceUrl !== "https://example.com/docs/auth") {
    throw new Error(`Metadata mismatch: expected sourceUrl 'https://example.com/docs/auth', got '${retrievedWeb.sourceUrl}'`);
  }
  console.log(`   ✓ Website Chunk metadata fully preserved (sourceType, sourceUrl, sourceName)`);

  // 8. Filtered Search (if supported)
  if (store.capabilities.supportsMetadataFiltering) {
    console.log(`7. Testing Metadata Filtering...`);
    const filteredResults = await store.similaritySearch([1.0, 0.0, 0.0, 0.0], 5, {
      filters: [{ field: "sourceType", operator: "eq", value: "file" }],
    });
    if (filteredResults.length !== 1 || filteredResults[0].id !== "chunk-pdf-1") {
      throw new Error(`Filtering by sourceType=file failed. Got ${filteredResults.length} results.`);
    }
    console.log(`   ✓ Filtered search by sourceType=file correctly isolated PDF chunk`);
  }

  // 9. Deletion
  if (store.capabilities.supportsDelete) {
    console.log(`8. Testing delete() by filter...`);
    await store.delete({
      filters: [{ field: "id", operator: "eq", value: "chunk-web-1" }],
    });
    const countAfterDelete = await store.count();
    if (countAfterDelete !== 1) {
      throw new Error(`Expected count after delete to be 1, got ${countAfterDelete}`);
    }
    console.log(`   ✓ delete() decreased count to 1`);
  }

  // 10. Final Cleanup
  await store.clear();
  const finalCount = await store.count();
  if (finalCount !== 0) {
    throw new Error(`Expected final count to be 0, got ${finalCount}`);
  }
  console.log(`9. Testing clear() final reset...`);
  console.log(`   ✓ VectorStore Contract Verified Successfully for [${storeName}]!\n`);
}

async function runAllContractTests() {
  // Test MockVectorStore
  const mockStore = new MockVectorStore({
    uri: "mock://memory",
    embeddingDimension: 4,
  });
  await verifyVectorStoreContract("MockVectorStore", mockStore, 4);

  // Test LanceDBStore
  const lancedbStore = new LanceDBStore({
    uri: "./data/test-contract-lancedb",
    namespace: "contract_test_chunks",
    embeddingDimension: 4,
  });
  await verifyVectorStoreContract("LanceDBStore", lancedbStore, 4);

  console.log("🏆 All VectorStore implementations passed the contract tests!\n");
}

if (require.main === module || !process.env.TEST_IMPORT_ONLY) {
  runAllContractTests().catch((err) => {
    console.error("❌ Contract test failed:", err);
    process.exit(1);
  });
}
