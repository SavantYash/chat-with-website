import { IndexingPipeline } from "./indexing-pipeline";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "./html-extractor";
import { DocumentChunker } from "./chunker";
import { EmbeddingProvider } from "../llm/embedding-provider";
import { MockVectorStore } from "../db/mock-store";
import { DocumentChunk } from "../../types";

class RateLimitingMockEmbeddingProvider implements EmbeddingProvider {
  private callCount = 0;

  constructor(
    private readonly failAttempts: number,
    private readonly delaySec: number
  ) {}

  getModelName(): string {
    return "mock-rate-limiting-model";
  }

  getDimensions(): number {
    return 3;
  }

  async embed(text: string): Promise<number[]> {
    return [0.1, 0.2, 0.3];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.callCount++;
    console.log(`[RateLimitingMockEmbeddingProvider] embedBatch called. Call count: ${this.callCount}`);

    if (this.callCount <= this.failAttempts) {
      console.log(`[RateLimitingMockEmbeddingProvider] Simulating rate limit (HTTP 429) for call ${this.callCount}...`);
      // Simulate Google-like ApiError
      const error: any = new Error("Resource has been exhausted (e.g. check quota).");
      error.name = "GeminiRateLimitError";
      error.status = 429;
      error.retryDelaySec = this.delaySec; // Expose delay info
      throw error;
    }

    console.log(`[RateLimitingMockEmbeddingProvider] Batch embedding call ${this.callCount} succeeded!`);
    return texts.map(() => [0.5, 0.5, 0.5]);
  }
}

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running IndexingPipeline Rate Limit Integration Test");
  console.log("=========================================");

  // Mock components
  const crawler = new WebsiteCrawler();
  // Override crawl to return a dummy page result immediately
  crawler.crawl = async () => {
    return [
      {
        url: "https://mock-rate-limit.com/",
        title: "Mock Rate Limit",
        html: "<html><body><p>This is page body to embed. It needs to contain a reasonable length of words so that the HtmlExtractor does not skip it, because it checks if the length of the extracted clean text content is above the minimum threshold of 100 characters. Now it has enough characters.</p></body></html>",
        rawText: "This is page body to embed. It needs to contain a reasonable length of words so that the HtmlExtractor does not skip it, because it checks if the length of the extracted clean text content is above the minimum threshold of 100 characters. Now it has enough characters.",
      },
    ];
  };

  const extractor = new HtmlExtractor();
  const chunker = new DocumentChunker({ chunkSize: 100, chunkOverlap: 10 });
  
  // Inject mock provider that fails twice with 2-second rate limits, then succeeds on the 3rd call
  const failAttempts = 2;
  const retryDelaySec = 2;
  const embeddingProvider = new RateLimitingMockEmbeddingProvider(failAttempts, retryDelaySec);
  
  const vectorStore = new MockVectorStore({
    uri: "mock://rate-limit-test",
    embeddingDimension: 3,
  });
  await vectorStore.initialize();

  const pipeline = new IndexingPipeline(
    crawler,
    extractor,
    chunker,
    embeddingProvider,
    vectorStore
  );

  const progressEvents: string[] = [];

  try {
    const summary = await pipeline.run("https://mock-rate-limit.com/", {
      maxPages: 1,
      maxDepth: 0,
      clearExisting: true,
      maxRateLimitRetries: 5,
      maxCumulativeWaitTimeSec: 60,
      onProgress: (event) => {
        progressEvents.push(event.message);
        console.log(`   [Progress Event] Stage: ${event.stage.toUpperCase()} | Message: "${event.message}"`);
      },
    });

    console.log("\n📊 Pipeline Summary Results:");
    console.log(`   Pages Indexed:  ${summary.pagesIndexed}`);
    console.log(`   Chunks Stored:  ${summary.chunksStored}`);

    // Verification asserts
    if (summary.pagesIndexed !== 1) {
      throw new Error(`Expected 1 page indexed, got ${summary.pagesIndexed}`);
    }
    if (summary.chunksStored === 0) {
      throw new Error(`Expected chunks stored to be greater than 0, got ${summary.chunksStored}`);
    }

    // Verify rate limit messaging events are captured
    const rateLimitEvents = progressEvents.filter((msg) =>
      msg.toLowerCase().includes("rate limit")
    );
    const retryEvents = progressEvents.filter((msg) =>
      msg.toLowerCase().includes("retrying")
    );

    console.log(`\nRate limit logs captured:`, rateLimitEvents);
    console.log(`Retry logs captured:`, retryEvents);

    if (rateLimitEvents.length === 0) {
      throw new Error("No rate limit warning progress events surfaced to the progress handler.");
    }
    if (retryEvents.length === 0) {
      throw new Error("No retry progress events surfaced to the progress handler.");
    }

    console.log("\n=========================================");
    console.log("🎉 IndexingPipeline rate limit test passed successfully!");
    console.log("=========================================");
  } catch (error) {
    console.error("\n❌ Rate limit test failed with error:", error);
    process.exit(1);
  }
}

runTest();
