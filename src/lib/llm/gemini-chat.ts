import { GoogleGenAI, ApiError } from "@google/genai";
import { ChatProvider } from "./chat-provider";

/**
 * GeminiChatProvider implements the ChatProvider interface using Google's
 * official @google/genai SDK.
 * 
 * Features:
 * 1. Exponential Backoff Retries: Retries on 429, 500, 502, 503, 504 and transient fetch issues.
 * 2. Model Fallbacks: Default name resolves dynamically through GEMINI_CHAT_MODEL or defaults to gemini-2.5-flash.
 * 3. Structured Telemetry: Logs request initialization, execution latency, model name, and completion status.
 */
export class GeminiChatProvider implements ChatProvider {
  private readonly client: GoogleGenAI;
  private readonly modelName: string;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  /**
   * Constructs the GeminiChatProvider.
   * 
   * @param options Config options.
   * @param options.apiKey API key. Defaults to process.env.GEMINI_API_KEY.
   * @param options.modelName Model name override. Defaults to GEMINI_CHAT_MODEL or 'gemini-2.5-flash'.
   * @param options.maxRetries Max retry count for transient issues. Defaults to 3.
   * @param options.retryDelay Starting delay in milliseconds for backoff. Defaults to 1000.
   */
  constructor(options: {
    apiKey?: string;
    modelName?: string;
    maxRetries?: number;
    retryDelay?: number;
  } = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[GeminiChatProvider] API Key not configured. Please set the GEMINI_API_KEY environment variable."
      );
    }

    this.client = new GoogleGenAI({ apiKey });
    this.modelName = options.modelName || process.env.GEMINI_CHAT_MODEL || "gemini-3.1-flash-lite";
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  /**
   * Retrieves the current model name.
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Generates a text response for the given prompt instruction.
   * 
   * @param prompt The prompt context text.
   * @param options Configuration parameters.
   * @returns Generated text response string.
   */
  async generateResponse(
    prompt: string,
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
    }
  ): Promise<string> {
    const startTime = performance.now();
    console.log(`[GeminiChatProvider] Generation request started. Model: ${this.modelName}`);

    // Map options to SDK config
    const config: Record<string, any> = {};
    if (options?.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options?.maxOutputTokens !== undefined) {
      config.maxOutputTokens = options.maxOutputTokens;
    }

    try {
      const responseText = await this.retryWithBackoff(async () => {
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (!response.text) {
          throw new Error("Received empty text response from Gemini API.");
        }

        return response.text;
      });

      const latency = performance.now() - startTime;
      console.log(
        `[GeminiChatProvider] Generation completed successfully in ${latency.toFixed(1)}ms. Model: ${this.modelName}`
      );
      return responseText;
    } catch (error: any) {
      const latency = performance.now() - startTime;
      console.error(
        `[GeminiChatProvider] ❌ Generation failed after ${latency.toFixed(1)}ms. Error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Helper that executes an operation with exponential backoff.
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
          `[GeminiChatProvider] Retry attempt ${attempts}/${this.maxRetries} after ${httpStatus}. Retrying in ${delay}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  /**
   * Checks if an error is a transient status code or connection failure.
   */
  private checkIfErrorIsRetryable(error: unknown): boolean {
    if (error instanceof ApiError) {
      const retryableStatusCodes = [429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.status);
    }

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
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
}
