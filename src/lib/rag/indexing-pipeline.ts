import { 
  VectorStore, 
  IndexingConfig, 
  IndexingSummary, 
  PageIndexingResult, 
  DocumentChunk, 
  EmbeddedDocumentChunk,
  IndexingProgressEvent
} from "../../types";
import { Crawler } from "../crawler";
import { HtmlExtractor } from "./html-extractor";
import { DocumentChunker } from "./chunker";
import { EmbeddingProvider } from "../llm/embedding-provider";

/**
 * IndexingPipeline orchestrates the complete RAG indexing pipeline.
 * 
 * Flow:
 * Start URL -> Crawl website -> Extract clean text -> Divide into chunks -> Batch embeddings -> Store vectors
 * 
 * Features:
 * 1. Dependency Injection: Accept implementations for crawler, extractor, chunker, embedding provider, and database store.
 * 2. Idempotence: Option clearExisting purges database before crawlling.
 * 3. Configuration Validation: Enforces strict limits at runtime.
 * 4. Graceful Error Handling: Individual page failures do not block the indexing run.
 * 5. Cancellation Support: AbortSignal checks stop process threads quickly.
 * 6. Telemetry: Monitors sub-stage timing breakdowns.
 * 7. Ingestion Batching: Memory-efficient batched embeddings and database writing.
 */
export class IndexingPipeline {
  constructor(
    private readonly crawler: Crawler,
    private readonly extractor: HtmlExtractor,
    private readonly chunker: DocumentChunker,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly vectorStore: VectorStore
  ) {}

  /**
   * Runs the complete indexing pipeline.
   * 
   * @param startUrl Starting website URL.
   * @param config Runtime parameters override.
   * @returns Telemetry summary report.
   */
  async run(startUrl: string, config?: IndexingConfig): Promise<IndexingSummary> {
    const pipelineStartTime = performance.now();

    // Default configuration limits
    const maxPages = config?.maxPages ?? 10;
    const maxDepth = config?.maxDepth ?? 3;
    const chunkSize = config?.chunkSize ?? 1000;
    const chunkOverlap = config?.chunkOverlap ?? 200;
    const embeddingBatchSize = config?.embeddingBatchSize ?? 50;
    const clearExisting = config?.clearExisting ?? false;
    const signal = config?.signal;
    const onProgress = config?.onProgress;

    // 1. Validation Checks
    this.validateConfig({ maxPages, maxDepth, chunkSize, chunkOverlap, embeddingBatchSize });

    onProgress?.({
      stage: "initialize",
      message: "Orchestration initialized. Validated configurations.",
    });

    onProgress?.({
      stage: "validate",
      message: "Validating vector store connectivity and configuration before indexing...",
    });

    try {
      await this.vectorStore.validate();
      onProgress?.({
        stage: "validate",
        message: "Vector store validation completed successfully.",
      });
    } catch (error: any) {
      const message = error.message || String(error);
      onProgress?.({
        stage: "validate",
        message: `Vector store validation failed: ${message}`,
      });
      throw new Error(`Indexing aborted due to vector store validation failure: ${message}`);
    }

    if (signal?.aborted) {
      this.handleAbort(onProgress);
      throw new DOMException("Indexing aborted by user.", "AbortError");
    }

    // 2. Clear Database (Idempotency)
    if (clearExisting) {
      onProgress?.({
        stage: "initialize",
        message: "Clearing existing vectors from database table...",
      });
      console.log("[IndexingPipeline] clearExisting set to true. Resetting database tables...");
      const clearStart = performance.now();
      await this.vectorStore.clear();
      console.log(`[IndexingPipeline] Database reset completed in ${(performance.now() - clearStart).toFixed(1)}ms.`);
    }

    // 3. Website Crawling
    onProgress?.({
      stage: "crawl",
      message: `Crawling site: ${startUrl} (Max Pages: ${maxPages}, Max Depth: ${maxDepth})...`,
    });
    console.log(`[IndexingPipeline] Crawl starting on: ${startUrl}...`);

    const crawlStart = performance.now();
    const pages = await this.crawler.crawl(startUrl, maxPages);
    const crawlDuration = performance.now() - crawlStart;
    
    console.log(`[IndexingPipeline] Crawl finished. Explored ${pages.length} URLs in ${crawlDuration.toFixed(1)}ms.`);

    const pageResults: PageIndexingResult[] = [];
    const allChunks: DocumentChunk[] = [];
    
    let extractionDuration = 0;
    let chunkingDuration = 0;
    let skippedPages = 0;

    // Use override settings for Chunker if specified, otherwise fall back to injected class
    const activeChunker = (config?.chunkSize !== undefined || config?.chunkOverlap !== undefined)
      ? new DocumentChunker({ chunkSize, chunkOverlap })
      : this.chunker;

    // 4. Extraction & Chunking Loop (Graceful boundary checks)
    for (const page of pages) {
      if (signal?.aborted) {
        this.handleAbort(onProgress);
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      console.log(`[IndexingPipeline] Processing URL: ${page.url}`);

      // 4A. Clean HTML
      const extractStart = performance.now();
      let processedPage;
      try {
        onProgress?.({
          stage: "extract",
          message: `Cleaning content for: ${page.url}`,
          details: { url: page.url },
        });
        processedPage = await this.extractor.extract(page);
        extractionDuration += performance.now() - extractStart;

        if (!processedPage) {
          throw new Error("Page content below threshold limit (<100 characters).");
        }
      } catch (error: any) {
        skippedPages++;
        pageResults.push({
          url: page.url,
          success: false,
          stage: "extract",
          chunks: 0,
          failureReason: error.message || String(error),
        });
        console.warn(`[IndexingPipeline] ⚠️ Extraction skipped for ${page.url}: ${error.message}`);
        continue;
      }

      // 4B. Boundary Chunking
      const chunkingStart = performance.now();
      let chunksList: DocumentChunk[] = [];
      try {
        onProgress?.({
          stage: "chunk",
          message: `Chunking content for: ${page.url}`,
          details: { url: page.url },
        });
        chunksList = activeChunker.chunk(processedPage);
        chunkingDuration += performance.now() - chunkingStart;

        if (chunksList.length === 0) {
          throw new Error("Zero semantic chunks generated from page.");
        }
      } catch (error: any) {
        skippedPages++;
        pageResults.push({
          url: page.url,
          success: false,
          stage: "chunk",
          chunks: 0,
          failureReason: error.message || String(error),
        });
        console.warn(`[IndexingPipeline] ⚠️ Chunking skipped for ${page.url}: ${error.message}`);
        continue;
      }

      // Page successfully parsed and partitioned
      allChunks.push(...chunksList);
      pageResults.push({
        url: page.url,
        success: true,
        chunks: chunksList.length,
      });
    }

    // 5. Batched Embeddings & Vector Storage
    let chunksStored = 0;
    let embeddingDuration = 0;
    let storageDuration = 0;

    const totalChunksCreated = allChunks.length;
    const totalBatches = Math.ceil(totalChunksCreated / embeddingBatchSize);

    console.log(
      `[IndexingPipeline] Total chunks: ${totalChunksCreated}. Ingesting in batches of ${embeddingBatchSize} (${totalBatches} batches total)...`
    );

    for (let i = 0; i < totalChunksCreated; i += embeddingBatchSize) {
      if (signal?.aborted) {
        this.handleAbort(onProgress);
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      const batchIndex = Math.floor(i / embeddingBatchSize) + 1;
      const chunkBatch = allChunks.slice(i, i + embeddingBatchSize);

      console.log(`[IndexingPipeline] Batch Ingestion [${batchIndex}/${totalBatches}] (Size: ${chunkBatch.length})...`);

      // 5A. Generate Batch Embeddings
      onProgress?.({
        stage: "embed",
        message: `Embedding batch ${batchIndex}/${totalBatches}...`,
        details: { batch: batchIndex, totalBatches, itemsCount: chunkBatch.length },
      });

      const batchTexts = chunkBatch.map((c) => c.content);
      const maxRateLimitRetries = config?.maxRateLimitRetries ?? 5;
      const maxCumulativeWaitTimeSec = config?.maxCumulativeWaitTimeSec ?? 300;
      let rateLimitAttempts = 0;
      let cumulativeWaitTimeSec = 0;
      let embeddingsSuccess = false;
      let embeddingsList: number[][] = [];

      while (!embeddingsSuccess) {
        if (signal?.aborted) {
          this.handleAbort(onProgress);
          throw new DOMException("Indexing aborted by user.", "AbortError");
        }

        const embedStart = performance.now();
        try {
          embeddingsList = await this.embeddingProvider.embedBatch(batchTexts);
          embeddingDuration += performance.now() - embedStart;
          embeddingsSuccess = true;
        } catch (error: any) {
          const isRateLimit = error.name === "GeminiRateLimitError" || 
                              error.status === 429 || 
                              error.message?.includes("429");

          if (isRateLimit) {
            const retryDelaySec = error.retryDelaySec ?? parseRetryDelay(error) ?? 30;
            rateLimitAttempts++;

            if (rateLimitAttempts > maxRateLimitRetries) {
              console.error(`[IndexingPipeline] ❌ Exceeded maximum rate limit retries (${maxRateLimitRetries}) on Batch ${batchIndex}.`);
              this.markBatchAsFailed(pageResults, chunkBatch, "embed", `Rate limit retries exhausted: ${error.message}`);
              break;
            }

            if (cumulativeWaitTimeSec + retryDelaySec > maxCumulativeWaitTimeSec) {
              console.error(`[IndexingPipeline] ❌ Exceeded maximum cumulative wait time (${maxCumulativeWaitTimeSec}s) on Batch ${batchIndex}.`);
              this.markBatchAsFailed(pageResults, chunkBatch, "embed", `Rate limit cumulative wait time exceeded: ${error.message}`);
              break;
            }

            console.warn(`[IndexingPipeline] Rate limit hit (429) on Batch ${batchIndex}. Waiting ${retryDelaySec}s before retry ${rateLimitAttempts}/${maxRateLimitRetries}...`);
            
            onProgress?.({
              stage: "embed",
              message: `Embedding rate limit reached. Waiting ${Math.round(retryDelaySec)} seconds before retrying batch ${batchIndex}/${totalBatches}...`,
              details: { 
                batch: batchIndex, 
                totalBatches, 
                rateLimitAttempt: rateLimitAttempts,
                maxRateLimitRetries,
                retryDelaySec
              },
            });

            const waitMs = retryDelaySec * 1000;
            let elapsedMs = 0;
            const intervalMs = 1000; // responsive 1s tick

            while (elapsedMs < waitMs) {
              if (signal?.aborted) {
                this.handleAbort(onProgress);
                throw new DOMException("Indexing aborted by user.", "AbortError");
              }
              const stepMs = Math.min(intervalMs, waitMs - elapsedMs);
              await new Promise((resolve) => setTimeout(resolve, stepMs));
              elapsedMs += stepMs;

              const remainingSec = Math.max(0, Math.round((waitMs - elapsedMs) / 1000));
              if (remainingSec > 0 && remainingSec % 5 === 0) {
                onProgress?.({
                  stage: "embed",
                  message: `Embedding rate limit reached. Waiting ${remainingSec} seconds before retrying batch ${batchIndex}/${totalBatches}...`,
                  details: { batch: batchIndex, totalBatches, remainingSec },
                });
              }
            }

            cumulativeWaitTimeSec += retryDelaySec;

            onProgress?.({
              stage: "embed",
              message: `Retrying embedding batch (${batchIndex}/${totalBatches})...`,
              details: { batch: batchIndex, totalBatches, rateLimitAttempt: rateLimitAttempts },
            });

            continue;
          }

          const errorType = getCategorizedErrorType(error);
          console.error(`[IndexingPipeline] ❌ Embedding generation failed on Batch ${batchIndex} due to ${errorType}: ${error.message}`);
          this.markBatchAsFailed(pageResults, chunkBatch, "embed", `${errorType}: ${error.message}`);
          break;
        }
      }

      if (!embeddingsSuccess) {
        continue;
      }

      // Convert DocumentChunk array to EmbeddedDocumentChunk array
      const embeddedChunks: EmbeddedDocumentChunk[] = chunkBatch.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddingsList[idx],
      }));

      // 5B. Write Batch to Vector Store
      onProgress?.({
        stage: "store",
        message: `Storing batch ${batchIndex}/${totalBatches} in ${this.vectorStore.constructor.name}...`,
        details: { batch: batchIndex, totalBatches, itemsCount: embeddedChunks.length },
      });

      const storeStart = performance.now();
      try {
        await this.vectorStore.upsert(embeddedChunks);
        storageDuration += performance.now() - storeStart;
        chunksStored += embeddedChunks.length;
        console.log(`[IndexingPipeline] Batch [${batchIndex}/${totalBatches}] persisted in ${(performance.now() - storeStart).toFixed(1)}ms.`);
      } catch (error: any) {
        console.error(`[IndexingPipeline] ❌ Vector storage write failed on Batch ${batchIndex}: ${error.message}`);
        this.markBatchAsFailed(pageResults, chunkBatch, "store", error.message);
        continue;
      }
    }

    // Recalculate page results telemetry in case of post-chunk errors (Partial success handling)
    const finalIndexedCount = pageResults.filter((r) => r.success).length;
    const finalSkippedCount = pages.length - finalIndexedCount;
    const pipelineDuration = performance.now() - pipelineStartTime;

    onProgress?.({
      stage: "complete",
      message: `Pipeline execution complete. Pages Visited: ${pages.length}, Chunks Stored: ${chunksStored}.`,
    });

    const summary: IndexingSummary = {
      pagesVisited: pages.length,
      pagesIndexed: finalIndexedCount,
      skippedPages: finalSkippedCount,
      chunksCreated: totalChunksCreated,
      chunksStored,
      crawlDuration,
      extractionDuration,
      chunkingDuration,
      embeddingDuration,
      storageDuration,
      totalDuration: pipelineDuration,
      pages: pageResults,
    };

    console.log("\n=========================================");
    console.log("🏁 Indexing Pipeline Run Summary:");
    console.log(`  - Total Pages Visited: ${summary.pagesVisited}`);
    console.log(`  - Pages Indexed:       ${summary.pagesIndexed}`);
    console.log(`  - Skipped/Failed:      ${summary.skippedPages}`);
    console.log(`  - Chunks Created:      ${summary.chunksCreated}`);
    console.log(`  - Chunks Stored:       ${summary.chunksStored}`);
    console.log(`  - Total Duration:      ${summary.totalDuration.toFixed(1)}ms`);
    console.log("=========================================");

    return summary;
  }

  /**
   * Helper that throws errors if configuration parameters violate bounds.
   */
  private validateConfig(config: {
    maxPages: number;
    maxDepth: number;
    chunkSize: number;
    chunkOverlap: number;
    embeddingBatchSize: number;
  }): void {
    if (config.maxPages <= 0) {
      throw new Error("[IndexingPipeline] maxPages must be strictly greater than 0.");
    }
    if (config.maxDepth < 0) {
      throw new Error("[IndexingPipeline] maxDepth must be greater than or equal to 0.");
    }
    if (config.chunkSize <= 0) {
      throw new Error("[IndexingPipeline] chunkSize must be strictly greater than 0.");
    }
    if (config.chunkOverlap < 0) {
      throw new Error("[IndexingPipeline] chunkOverlap must be greater than or equal to 0.");
    }
    if (config.chunkOverlap >= config.chunkSize) {
      throw new Error("[IndexingPipeline] chunkOverlap must be strictly smaller than chunkSize.");
    }
    if (config.embeddingBatchSize <= 0) {
      throw new Error("[IndexingPipeline] embeddingBatchSize must be strictly greater than 0.");
    }
  }

  /**
   * Helper to broadcast cancellation signals.
   */
  private handleAbort(onProgress?: (event: IndexingProgressEvent) => void): void {
    console.log("[IndexingPipeline] Indexing operation aborted by AbortSignal.");
    onProgress?.({
      stage: "cancel",
      message: "Indexing run was cancelled via AbortSignal.",
    });
  }

  /**
   * Helper that marks all parent URLs associated with a batch of failed chunks as failed.
   */
  private markBatchAsFailed(
    results: PageIndexingResult[],
    batch: DocumentChunk[],
    stage: "embed" | "store",
    reason: string
  ): void {
    const urlsInBatch = new Set(batch.map((c) => c.url));
    for (const r of results) {
      if (urlsInBatch.has(r.url) && r.success) {
        r.success = false;
        r.stage = stage;
        r.failureReason = `Batch execution failed during [${stage}] stage: ${reason}`;
      }
    }
  }
}

/**
 * Dynamically parses the retry delay from a Google API error.
 */
function parseRetryDelay(error: any): number | null {
  if (!error) return null;
  const details = error.errorDetails || error.statusDetails || error.details || error.error?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (detail && typeof detail === "object") {
        if (detail.retryDelay) {
          if (typeof detail.retryDelay === "string") {
            const seconds = parseFloat(detail.retryDelay);
            if (!isNaN(seconds)) return seconds;
          } else if (typeof detail.retryDelay === "object" && typeof detail.retryDelay.seconds === "number") {
            return detail.retryDelay.seconds;
          }
        }
        if (detail.metadata && detail.metadata.retryDelay) {
          const seconds = parseFloat(detail.metadata.retryDelay);
          if (!isNaN(seconds)) return seconds;
        }
      }
    }
  }
  const msg = error.message || (typeof error === "string" ? error : "");
  if (msg) {
    const regexes = [
      /retry in ([\d\.]+)\s*s(econds?)?/i,
      /retry after ([\d\.]+)\s*s(econds?)?/i,
      /retryInfo\s*retryDelay:\s*([\d\.]+)s/i
    ];
    for (const regex of regexes) {
      const match = msg.match(regex);
      if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        if (!isNaN(seconds)) return seconds;
      }
    }
  }
  return null;
}

/**
 * Returns a human-friendly string categorizing the failure type.
 */
function getCategorizedErrorType(error: any): string {
  if (error.status === 429 || error.message?.includes("429")) {
    return "Rate limit (429)";
  }
  const msg = error.message?.toLowerCase() || "";
  if (
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("network error")
  ) {
    return "Network failure";
  }
  if (error.status >= 500 && error.status <= 599) {
    return "Server error";
  }
  return "Transient error";
}
