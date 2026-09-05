import { 
  VectorStore, 
  IndexingConfig, 
  IndexingSummary, 
  PageIndexingResult, 
  DocumentChunk, 
  EmbeddedDocumentChunk,
  IndexingProgressEvent,
  KnowledgeSource,
  NormalizedDocument
} from "../../types";
import { Crawler } from "../crawler";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "./html-extractor";
import { DocumentChunker } from "./chunker";
import { EmbeddingProvider } from "../llm/embedding-provider";
import { WebsiteKnowledgeSource } from "../sources/website-source";

/**
 * IndexingPipeline orchestrates the unified RAG indexing pipeline.
 * 
 * Flow:
 * KnowledgeSource -> NormalizedDocument[] -> Divide into chunks -> Batch embeddings -> Store vectors
 * 
 * Features:
 * 1. Source Agnostic: Accepts any KnowledgeSource (Website, File, etc.) or NormalizedDocument[].
 * 2. Dependency Injection: Accept implementations for chunker, embedding provider, and database store.
 * 3. Idempotence: Option clearExisting purges database before indexing.
 * 4. Configuration Validation: Enforces strict limits at runtime.
 * 5. Graceful Error Handling: Individual document failures do not block the indexing run.
 * 6. Cancellation Support: AbortSignal checks stop process threads quickly.
 * 7. Telemetry: Monitors sub-stage timing breakdowns.
 * 8. Ingestion Batching: Memory-efficient batched embeddings and database writing.
 */
export class IndexingPipeline {
  private readonly chunker: DocumentChunker;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorStore: VectorStore;
  private readonly crawler?: Crawler;
  private readonly extractor?: HtmlExtractor;

  constructor(
    crawlerOrChunker: Crawler | DocumentChunker,
    extractorOrEmbeddingProvider: HtmlExtractor | EmbeddingProvider,
    chunkerOrVectorStore: DocumentChunker | VectorStore,
    embeddingProvider?: EmbeddingProvider,
    vectorStore?: VectorStore
  ) {
    if (embeddingProvider && vectorStore) {
      // Legacy 5-argument constructor: (crawler, extractor, chunker, embeddingProvider, vectorStore)
      this.crawler = crawlerOrChunker as Crawler;
      this.extractor = extractorOrEmbeddingProvider as HtmlExtractor;
      this.chunker = chunkerOrVectorStore as DocumentChunker;
      this.embeddingProvider = embeddingProvider;
      this.vectorStore = vectorStore;
    } else {
      // 3-argument constructor: (chunker, embeddingProvider, vectorStore)
      this.chunker = crawlerOrChunker as DocumentChunker;
      this.embeddingProvider = extractorOrEmbeddingProvider as EmbeddingProvider;
      this.vectorStore = chunkerOrVectorStore as VectorStore;
    }
  }

  /**
   * Runs the indexing pipeline for a given KnowledgeSource or legacy website URL string.
   * 
   * @param source KnowledgeSource implementation or starting website URL string.
   * @param config Runtime parameters override.
   * @returns Telemetry summary report.
   */
  async run(
    source: KnowledgeSource | string,
    config?: IndexingConfig
  ): Promise<IndexingSummary> {
    const signal = config?.signal;
    const onProgress = config?.onProgress;

    // 1. Resolve KnowledgeSource
    let activeSource: KnowledgeSource;
    if (typeof source === "string") {
      activeSource = new WebsiteKnowledgeSource({
        url: source,
        maxPages: config?.maxPages,
        maxDepth: config?.maxDepth,
        crawler: (this.crawler as WebsiteCrawler) || new WebsiteCrawler({ maxPages: config?.maxPages }),
        extractor: this.extractor || new HtmlExtractor(),
      });
    } else {
      activeSource = source;
    }

    // 2. Pre-flight Validation Check
    onProgress?.({
      stage: "initialize",
      message: `Initializing ingestion from ${activeSource.sourceName}...`,
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

    // 3. Ingest documents from KnowledgeSource
    const extractionStart = performance.now();
    const documents = await activeSource.ingest(onProgress, signal);
    const extractionDuration = performance.now() - extractionStart;

    // 4. Process normalized documents through common RAG pipeline
    return this.process(documents, config, { extractionDuration });
  }

  /**
   * Processes an array of NormalizedDocuments through the common RAG pipeline:
   * (Clear DB -> Chunk -> Batch Embed -> Store Chunks)
   * 
   * @param documents Normalized document array.
   * @param config Pipeline configuration options.
   * @param telemetryOverrides Optional stage durations from upstream extraction.
   * @returns Telemetry summary report.
   */
  async process(
    documents: NormalizedDocument[],
    config?: IndexingConfig,
    telemetryOverrides?: { extractionDuration?: number }
  ): Promise<IndexingSummary> {
    const pipelineStartTime = performance.now();

    const chunkSize = config?.chunkSize ?? 1000;
    const chunkOverlap = config?.chunkOverlap ?? 200;
    const embeddingBatchSize = config?.embeddingBatchSize ?? 50;
    const clearExisting = config?.clearExisting ?? false;
    const signal = config?.signal;
    const onProgress = config?.onProgress;

    this.validateConfig({ chunkSize, chunkOverlap, embeddingBatchSize });

    if (signal?.aborted) {
      this.handleAbort(onProgress);
      throw new DOMException("Indexing aborted by user.", "AbortError");
    }

    // 1. Clear Database (Idempotency)
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

    const pageResults: PageIndexingResult[] = [];
    const allChunks: DocumentChunk[] = [];
    let chunkingDuration = 0;
    let skippedPages = 0;

    const activeChunker = (config?.chunkSize !== undefined || config?.chunkOverlap !== undefined)
      ? new DocumentChunker({ chunkSize, chunkOverlap })
      : this.chunker;

    // 2. Chunk Normalized Documents
    const chunkingStart = performance.now();
    for (const doc of documents) {
      if (signal?.aborted) {
        this.handleAbort(onProgress);
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      try {
        const chunksList = activeChunker.chunk(doc);
        if (chunksList.length === 0) {
          throw new Error("Zero semantic chunks generated from document.");
        }

        allChunks.push(...chunksList);
        pageResults.push({
          url: doc.metadata.sourceUrl || doc.metadata.fileName || doc.title,
          success: true,
          chunks: chunksList.length,
        });

        onProgress?.({
          stage: "chunk",
          message: `Created ${chunksList.length} chunks from ${doc.title}`,
          details: {
            sourceName: doc.title,
            chunksCount: chunksList.length,
            totalChunks: allChunks.length,
          },
        });
      } catch (error: any) {
        skippedPages++;
        pageResults.push({
          url: doc.metadata.sourceUrl || doc.metadata.fileName || doc.title,
          success: false,
          stage: "chunk",
          chunks: 0,
          failureReason: error.message || String(error),
        });
        console.warn(`[IndexingPipeline] ⚠️ Chunking skipped for ${doc.title}: ${error.message}`);
      }
    }
    chunkingDuration = performance.now() - chunkingStart;

    // 3. Batched Embeddings & Vector Storage
    let chunksStored = 0;
    let embeddingDuration = 0;
    let storageDuration = 0;

    const totalChunksCreated = allChunks.length;
    const totalBatches = Math.ceil(totalChunksCreated / embeddingBatchSize) || 1;

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

      onProgress?.({
        stage: "embed",
        message: `Embedding batch ${batchIndex}/${totalBatches}`,
        details: { action: "embed", batch: batchIndex, totalBatches, itemsCount: chunkBatch.length, totalChunks: totalChunksCreated },
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
            
            const waitSec = Math.round(retryDelaySec);

            onProgress?.({
              stage: "embed",
              message: `Gemini rate limit reached. Waiting ${waitSec} seconds before retrying...`,
              details: { 
                action: "rate_limit",
                batch: batchIndex, 
                totalBatches, 
                retry: rateLimitAttempts,
                maxRetries: maxRateLimitRetries,
                waitSeconds: waitSec,
                remainingSec: waitSec,
              },
            });

            const waitMs = retryDelaySec * 1000;
            let elapsedMs = 0;
            const intervalMs = 1000;

            while (elapsedMs < waitMs) {
              if (signal?.aborted) {
                this.handleAbort(onProgress);
                throw new DOMException("Indexing aborted by user.", "AbortError");
              }
              const stepMs = Math.min(intervalMs, waitMs - elapsedMs);
              await new Promise((resolve) => setTimeout(resolve, stepMs));
              elapsedMs += stepMs;

              const remainingSec = Math.max(0, Math.round((waitMs - elapsedMs) / 1000));
              onProgress?.({
                stage: "embed",
                message: `Gemini rate limit reached. Waiting ${remainingSec} seconds before retrying...`,
                details: {
                  action: "rate_limit_tick",
                  batch: batchIndex,
                  totalBatches,
                  retry: rateLimitAttempts,
                  maxRetries: maxRateLimitRetries,
                  waitSeconds: waitSec,
                  remainingSec,
                },
              });
            }

            cumulativeWaitTimeSec += retryDelaySec;

            onProgress?.({
              stage: "embed",
              message: `Retrying embedding batch (${batchIndex}/${totalBatches})...`,
              details: { action: "rate_limit_retry", batch: batchIndex, totalBatches, retry: rateLimitAttempts },
            });

            continue;
          }

          const errorType = getCategorizedErrorType(error);
          console.error(`[IndexingPipeline] ❌ Embedding generation failed on Batch ${batchIndex} due to ${errorType}: ${error.message}`);
          this.markBatchAsFailed(pageResults, chunkBatch, "embed", `${errorType}: ${error.message}`);
          break;
        }

        if (embeddingsSuccess && rateLimitAttempts > 0) {
          onProgress?.({
            stage: "embed",
            message: "✓ Retry successful. Continuing indexing...",
            details: {
              action: "rate_limit_success",
              batch: batchIndex,
              totalBatches,
            },
          });
        }
      }

      if (!embeddingsSuccess) {
        continue;
      }

      // 4. Convert DocumentChunk array to EmbeddedDocumentChunk array
      const embeddedChunks: EmbeddedDocumentChunk[] = chunkBatch.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddingsList[idx],
      }));

      const storeStart = performance.now();
      try {
        await this.vectorStore.upsert(embeddedChunks);
        storageDuration += performance.now() - storeStart;
        chunksStored += embeddedChunks.length;

        onProgress?.({
          stage: "store",
          message: `Stored ${embeddedChunks.length} vectors`,
          details: {
            action: "store",
            batch: batchIndex,
            totalBatches,
            storedChunks: chunksStored,
            totalChunks: totalChunksCreated,
          },
        });
      } catch (error: any) {
        console.error(`[IndexingPipeline] ❌ Vector storage write failed on Batch ${batchIndex}: ${error.message}`);
        this.markBatchAsFailed(pageResults, chunkBatch, "store", error.message);
        continue;
      }
    }

    const finalIndexedCount = pageResults.filter((r) => r.success).length;
    const finalSkippedCount = documents.length - finalIndexedCount;
    const extractionDuration = telemetryOverrides?.extractionDuration ?? 0;
    const pipelineDuration = performance.now() - pipelineStartTime + extractionDuration;

    onProgress?.({
      stage: "complete",
      message: `Pipeline execution complete. Documents Processed: ${documents.length}, Chunks Stored: ${chunksStored}.`,
    });

    const summary: IndexingSummary = {
      pagesVisited: documents.length,
      pagesIndexed: finalIndexedCount,
      skippedPages: finalSkippedCount,
      chunksCreated: totalChunksCreated,
      chunksStored,
      crawlDuration: 0,
      extractionDuration,
      chunkingDuration,
      embeddingDuration,
      storageDuration,
      totalDuration: pipelineDuration,
      pages: pageResults,
    };

    console.log("\n=========================================");
    console.log("🏁 Indexing Pipeline Run Summary:");
    console.log(`  - Documents Processed: ${summary.pagesVisited}`);
    console.log(`  - Documents Indexed:   ${summary.pagesIndexed}`);
    console.log(`  - Skipped/Failed:      ${summary.skippedPages}`);
    console.log(`  - Chunks Created:      ${summary.chunksCreated}`);
    console.log(`  - Chunks Stored:       ${summary.chunksStored}`);
    console.log(`  - Total Duration:      ${summary.totalDuration.toFixed(1)}ms`);
    console.log("=========================================");

    return summary;
  }

  private validateConfig(config: {
    chunkSize: number;
    chunkOverlap: number;
    embeddingBatchSize: number;
  }): void {
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

  private handleAbort(onProgress?: (event: IndexingProgressEvent) => void): void {
    console.log("[IndexingPipeline] Indexing operation aborted by AbortSignal.");
    onProgress?.({
      stage: "cancel",
      message: "Indexing run was cancelled via AbortSignal.",
    });
  }

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
