import { GoogleGenAI, ApiError } from "@google/genai";
import { EmbeddingProvider } from "./embedding-provider";

/**
 * GeminiEmbeddingProvider implements the EmbeddingProvider interface using Google's 
 * official @google/genai SDK.
 * 
 * Why this class exists:
 * It bridges the gap between raw textual chunks and high-dimensional semantic search
 * queries by interfacing with Google's Gemini embeddings endpoint.
 * It encapsulates the following production features:
 * 1. Exponential Backoff Retries: Automatically retries transient issues (429, 500, 502, 503, 504)
 *    while throwing immediately on client-side setup failures (400, 401, 403).
 * 2. Sequential Batching: Avoids rate limits by slicing large inputs and querying them sequentially.
 * 3. Euclidean L2 Normalization: Adjusts vectors so their Euclidean length = 1, converting cosine
 *    similarity checks into efficient dot-product math in LanceDB.
 * 4. Runtime Dimension Integrity Check: Fails early if vectors return with mismatched or corrupt dimensions.
 * 5. Detailed Timing Telemetry: Logs processing latency metrics to optimize batch configurations.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly client: GoogleGenAI;
  private readonly modelName: string;
  private readonly batchSize: number;
  private readonly normalizeVectors: boolean;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly dimensions: number;

  /**
   * Constructs the GeminiEmbeddingProvider.
   * 
   * @param options Config options.
   * @param options.apiKey Optional API key. Defaults to process.env.GEMINI_API_KEY.
   * @param options.modelName Model identifier. Defaults to 'gemini-embedding-2'.
   * @param options.batchSize Number of texts to process in one API call. Defaults to 100.
   * @param options.normalizeVectors Whether to scale vectors to L2 unit length. Defaults to true.
   * @param options.maxRetries Maximum retry limit for retryable status codes. Defaults to 3.
   * @param options.retryDelay Starting delay in milliseconds for backoff. Defaults to 1000.
   * @param options.dimensions Target dimensions of output vector. Defaults to 768.
   */
  constructor(options: {
    apiKey?: string;
    modelName?: string;
    batchSize?: number;
    normalizeVectors?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    dimensions?: number;
  } = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[GeminiEmbeddingProvider] API Key not configured. Please set the GEMINI_API_KEY environment variable."
      );
    }

    this.client = new GoogleGenAI({ apiKey });
    this.modelName = options.modelName || "gemini-embedding-2";
    this.batchSize = options.batchSize ?? 100;
    this.normalizeVectors = options.normalizeVectors ?? true;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.dimensions = options.dimensions || 768;

    if (this.batchSize <= 0) {
      throw new Error("[GeminiEmbeddingProvider] batchSize must be strictly greater than 0.");
    }
  }

  /**
   * Retrieves the model name.
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Retrieves the configured vector dimension.
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Generates a single vector embedding.
   * 
   * @param text Text segment.
   * @returns L2-normalized vector array.
   */
  async embed(text: string): Promise<number[]> {
    if (!text || !text.trim()) {
      return Array(this.dimensions).fill(0);
    }

    const startTime = performance.now();
    
    const vector = await this.retryWithBackoff(async () => {
      const response = await this.client.models.embedContent({
        model: this.modelName,
        contents: text,
        config: {
          outputDimensionality: this.dimensions,
        },
      });

      const embeddingValues = response.embeddings?.[0]?.values;
      if (!embeddingValues || embeddingValues.length === 0) {
        throw new Error("Received empty embedding values array from Gemini API.");
      }

      return embeddingValues;
    });

    const elapsedMs = performance.now() - startTime;
    this.validateDimensions(vector);

    const finalVector = this.normalizeVectors ? this.l2Normalize(vector) : vector;
    
    console.log(
      `[GeminiEmbeddingProvider] Generated single embedding in ${elapsedMs.toFixed(1)}ms. Dimension: ${finalVector.length}`
    );

    return finalVector;
  }

  /**
   * Generates embeddings for a batch of strings, processing them sequentially.
   * 
   * @param texts Array of string elements to embed.
   * @returns Array of vector arrays.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const startTime = performance.now();
    const finalVectors: number[][] = [];
    const totalBatches = Math.ceil(texts.length / this.batchSize);

    console.log(
      `[GeminiEmbeddingProvider] Starting batch job. Total items: ${texts.length}, Batch Size: ${this.batchSize}, Total Batches: ${totalBatches}`
    );

    // Sequential batch iteration to remain within API rate limit windows
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const startIdx = batchIdx * this.batchSize;
      const endIdx = Math.min(startIdx + this.batchSize, texts.length);
      const batchSlice = texts.slice(startIdx, endIdx);

      const batchStartTime = performance.now();
      console.log(
        `[GeminiEmbeddingProvider] -> Processing Batch [${batchIdx + 1}/${totalBatches}] (Items: ${batchSlice.length}, Indices: ${startIdx}-${endIdx - 1})...`
      );

      const rawBatchVectors = await this.retryWithBackoff(async () => {
        const response = await this.client.models.embedContent({
          model: this.modelName,
          contents: batchSlice.map((t) => ({
            parts: [{ text: t }],
          })),
          config: {
            outputDimensionality: this.dimensions,
          },
        });

        const embeddings = response.embeddings;
        if (!embeddings || embeddings.length !== batchSlice.length) {
          throw new Error(
            `Embedding batch size mismatch: expected ${batchSlice.length} vectors, got ${embeddings?.length || 0}`
          );
        }

        return embeddings.map((e, elementIdx) => {
          const values = e.values;
          if (!values || values.length === 0) {
            throw new Error(`Empty embedding values inside batch result at index ${elementIdx}.`);
          }
          return values;
        });
      });

      const batchElapsedMs = performance.now() - batchStartTime;
      console.log(
        `[GeminiEmbeddingProvider] <- Batch [${batchIdx + 1}/${totalBatches}] completed in ${batchElapsedMs.toFixed(1)}ms.`
      );

      // Validate dimensions and normalize
      for (const vec of rawBatchVectors) {
        this.validateDimensions(vec);
        const finalVec = this.normalizeVectors ? this.l2Normalize(vec) : vec;
        finalVectors.push(finalVec);
      }
    }

    const totalElapsedMs = performance.now() - startTime;
    console.log(
      `[GeminiEmbeddingProvider] Batch job finished. Processed ${texts.length} items in ${totalElapsedMs.toFixed(1)}ms. Average: ${(totalElapsedMs / texts.length).toFixed(1)}ms/item.`
    );

    return finalVectors;
  }

  /**
   * Ensures that a vector meets model dimension bounds.
   * 
   * @param vector Vector to validate.
   */
  private validateDimensions(vector: number[]): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `[GeminiEmbeddingProvider] Vector dimension mismatch: model dimension is ${this.dimensions}, but received vector of size ${vector.length}`
      );
    }
  }

  /**
   * Helper that executes an operation with exponential backoff.
   * Retries are only triggered for retryable errors (429, 500, 502, 503, 504).
   */
  private async retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let delay = this.retryDelay;

    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        const isRetryable = this.checkIfErrorIsRetryable(error);

        if (!isRetryable || attempts > this.maxRetries) {
          throw error;
        }

        const httpStatus = error instanceof ApiError ? `HTTP ${error.status}` : "Network Exception";
        console.warn(
          `[GeminiEmbeddingProvider] Retry attempt ${attempts}/${this.maxRetries} after ${httpStatus}. Retrying in ${delay}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential spacing increase
      }
    }
  }

  /**
   * Checks if an error corresponds to a transient HTTP code or connection issue.
   * 
   * @param error Error thrown by the client.
   * @returns true if retryable, false otherwise.
   */
  private checkIfErrorIsRetryable(error: unknown): boolean {
    if (error instanceof ApiError) {
      const retryableStatusCodes = [429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.status);
    }

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Retry common connection drop outs
      if (
        msg.includes("fetch failed") ||
        msg.includes("timeout") ||
        msg.includes("econnrefused") ||
        msg.includes("network error")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Scales a vector array so its Euclidean length is exactly 1.
   * 
   * @param vector Original vector.
   * @returns L2-normalized vector array.
   */
  private l2Normalize(vector: number[]): number[] {
    const squareSum = vector.reduce((sum, val) => sum + val * val, 0);
    const norm = Math.sqrt(squareSum);
    if (norm === 0) {
      return vector;
    }
    return vector.map((val) => val / norm);
  }
}
