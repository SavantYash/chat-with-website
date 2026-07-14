/**
 * Interface defining the Embedding Service component.
 * Responsible for converting text strings into high-dimensional vector representations.
 * By abstracting this, we can seamlessly swap between OpenAI, Gemini, Cohere, or local models.
 */
export interface EmbeddingService {
  /**
   * Generates a dense vector embedding for a single text query (e.g. user question).
   * 
   * @param text The input query string.
   * @returns A promise resolving to the embedding vector.
   */
  embedQuery(text: string): Promise<number[]>;

  /**
   * Generates dense vector embeddings for a batch of documents or chunks.
   * 
   * @param texts An array of document texts.
   * @returns A promise resolving to an array of embedding vectors.
   */
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/**
 * Interface defining the Language Model (LLM) Service.
 * Responsible for completing prompts and generating answers using retrieved context.
 */
export interface LLMService {
  /**
   * Generates a text response based on the prompt template and retrieved context.
   * 
   * @param prompt The user's query or instruction.
   * @param context The relevant retrieved text chunks.
   * @returns The generated response.
   */
  generateResponse(prompt: string, context: string): Promise<string>;
}

export * from "./embedding-provider";
export * from "./gemini-embedding";
