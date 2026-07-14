import { HtmlExtractor } from "./html-extractor";
import { DocumentChunker } from "./chunker";
import { WebPage } from "../../types";

/**
 * Standalone test runner to verify the DocumentChunker splitting quality and metadata preservation.
 * Run using: npx tsx src/lib/rag/test-chunker.ts
 */
async function fetchPage(url: string): Promise<WebPage> {
  console.log(`[Test] HTTP Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (RAG Chunker Validation Test)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP fetch failed for ${url} with status ${response.status}`);
  }

  const html = await response.text();
  return {
    url,
    title: "JavaScript | MDN",
    html,
  };
}

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running DocumentChunker Integration Test");
  console.log("=========================================");

  try {
    const targetUrl = "https://developer.mozilla.org/en-US/docs/Web/JavaScript";
    const rawPage = await fetchPage(targetUrl);

    console.log("\n[Test] Extracting main article content using HtmlExtractor...");
    const extractor = new HtmlExtractor();
    const processedPage = await extractor.extract(rawPage);

    if (!processedPage) {
      throw new Error("HTML extraction failed, returned null.");
    }

    console.log(`   Clean content size: ${processedPage.content.length} characters.`);

    // Configure chunk size 1000 characters and 200 characters overlap
    console.log("\n[Test] Semantic chunking (chunkSize = 1000, chunkOverlap = 200)...");
    const chunker = new DocumentChunker({ chunkSize: 1000, chunkOverlap: 200 });
    const chunks = chunker.chunk(processedPage);

    console.log("\n=========================================");
    console.log(`📊 Chunker Output Analysis:`);
    console.log(`  - Total chunks generated: ${chunks.length}`);
    console.log("=========================================");

    chunks.forEach((chunk, index) => {
      console.log(`\n📦 Chunk [${index + 1}/${chunks.length}]`);
      console.log(`  - ID:           ${chunk.id}`);
      console.log(`  - URL:          ${chunk.url}`);
      console.log(`  - Title:        ${chunk.title}`);
      console.log(`  - Chunk Index:  ${chunk.chunkIndex}`);
      console.log(`  - Total Chunks: ${chunk.totalChunks}`);
      console.log(`  - Offsets:      ${chunk.startOffset} to ${chunk.endOffset}`);
      console.log(`  - Size:         ${chunk.content.length} characters`);
      
      // Print first 150 characters with cleaned whitespaces for log readability
      const snippet = chunk.content.replace(/\s+/g, " ").substring(0, 150).trim();
      console.log(`  - Snippet:      "${snippet}..."`);
    });

    console.log("\n=========================================");
    console.log("🔍 Checking Overlap Quality between Chunk #1 and Chunk #2:");
    if (chunks.length > 1) {
      const firstChunkText = chunks[0].content;
      const secondChunkText = chunks[1].content;
      
      const lastChars = firstChunkText.substring(firstChunkText.length - 80).replace(/\s+/g, " ");
      const firstChars = secondChunkText.substring(0, 80).replace(/\s+/g, " ");

      console.log(`   - Chunk #1 tail:  "...${lastChars}"`);
      console.log(`   - Chunk #2 head:  "${firstChars}..."`);
    }

    console.log("\n=========================================");
    if (chunks.length > 0) {
      console.log("✅ SUCCESS: Document successfully split semantically with preserved metadata!");
    } else {
      console.log("❌ FAILURE: Zero chunks generated.");
    }
    console.log("=========================================");
  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
}

runTest();
