/**
 * Interface defining the contract for a Chat Provider.
 * This establishes a clean boundary between the core LLM orchestration logic
 * and the specific LLM text generation API provider (e.g., Gemini, OpenAI).
 */
export interface ChatProvider {
  /**
   * Generates a text response for the given prompt query.
   * 
   * @param prompt The prompt instruction context.
   * @param options Configuration parameters for generation overrides.
   * @param options.temperature Controls randomness in generation (usually between 0.0 and 2.0).
   * @param options.maxOutputTokens Restricts maximum token length of generated content.
   * @returns A promise that resolves to the generated text response string.
   */
  generateResponse(
    prompt: string,
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
    }
  ): Promise<string>;

  /**
   * Returns the configuration identifier string for the model being used.
   */
  getModelName(): string;
}
