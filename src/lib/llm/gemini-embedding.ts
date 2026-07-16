import { GoogleGenAI, ApiError } from "@google/genai";
import { EmbeddingProvider } from "./embedding-provider";

/**
 * Custom error thrown when the Gemini API rate limit is exceeded.
 */
export class GeminiRateLimitError extends Error {
  readonly status = 429;
  constructor(
    message: string,
    readonly retryDelaySec: number,
    readonly originalError?: any
  ) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

/**
 * Dynamically parses the retry delay from a Google API error.
 */
export function parseRetryDelay(error: any): number | null {
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
 * GeminiEmbeddingProvider implements the EmbeddingProvider interface using Google's 
 * official @google/genai SDK.
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
      } catch (error: any) {
        const isRateLimit = (error instanceof ApiError && error.status === 429) ||
                            (error instanceof Error && error.message?.includes("429"));
        if (isRateLimit) {
          const delaySec = parseRetryDelay(error) ?? 30; // fallback to 30s
          throw new GeminiRateLimitError(
            `Gemini API Rate Limit Exceeded: ${error.message || error}`,
            delaySec,
            error
          );
        }

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
