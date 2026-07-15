import { Retriever } from "./retriever";
import { PromptBuilder } from "./prompt-builder";
import { ChatProvider } from "../llm";
import { ChatResponse, ChatSource } from "./types";

/**
 * ChatService orchestrates the complete RAG question-answering workflow.
 * 
 * Flow:
 * Question -> Retriever.retrieve() -> PromptBuilder.buildPrompt() -> ChatProvider.generateResponse() -> ChatResponse
 * 
 * Design Features:
 * 1. Dependency Injection: Decouples retrieval, prompting, and generation using interfaces and classes.
 * 2. Privacy-Conscious Logging: Tracks stages and latencies without logging raw user prompts.
 * 3. Citation Mapping: Captures chunks in retriever-defined priority and formats them as ChatSources.
 */
export class ChatService {
  constructor(
    private readonly retriever: Retriever,
    private readonly promptBuilder: PromptBuilder,
    private readonly chatProvider: ChatProvider
  ) {}

  /**
   * Handles user queries by retrieving context, prompting the model, and returning structured outputs.
   * 
   * @param question The natural language question query.
   * @param options Configuration options.
   * @returns Generated answer string and cited document sources list.
   */
  async ask(
    question: string,
    options?: {
      topK?: number;
      temperature?: number;
      maxOutputTokens?: number;
    }
  ): Promise<ChatResponse> {
    const totalStart = performance.now();
    console.log(`[ChatService] ask() initiated for question: "${question}"`);

    // 1. Retrieve grounding context chunks
    console.log(`[ChatService] Stage 1: Retrieving context (topK: ${options?.topK ?? 3})...`);
    const retrievalStart = performance.now();
    const chunks = await this.retriever.retrieve(question, options?.topK);
    const retrievalTime = performance.now() - retrievalStart;
    console.log(`[ChatService] Stage 1 complete. Retrieved ${chunks.length} chunks in ${retrievalTime.toFixed(1)}ms.`);

    // 2. Format grounded prompt
    console.log(`[ChatService] Stage 2: Constructing prompt...`);
    const promptStart = performance.now();
    const prompt = this.promptBuilder.buildPrompt(question, chunks);
    const promptTime = performance.now() - promptStart;
    console.log(`[ChatService] Stage 2 complete. Prompt built in ${promptTime.toFixed(1)}ms.`);

    // 3. Request LLM text completion
    console.log(`[ChatService] Stage 3: Contacting LLM provider: ${this.chatProvider.getModelName()}...`);
    const generationStart = performance.now();
    let answer = "";
    try {
      answer = await this.chatProvider.generateResponse(prompt, {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxOutputTokens,
      });
    } catch (error: any) {
      console.error(`[ChatService] ❌ LLM generation failed: ${error.message}`);
      throw error;
    }
    const generationTime = performance.now() - generationStart;
    console.log(`[ChatService] Stage 3 complete. Response generated in ${generationTime.toFixed(1)}ms.`);

    // 4. Map citations in exact retriever order
    const sources: ChatSource[] = chunks.map((chunk) => ({
      title: chunk.title,
      url: chunk.url,
      chunkNumber: chunk.chunkIndex + 1,
      totalChunks: chunk.totalChunks,
      distance: chunk.score,
    }));

    const totalDuration = performance.now() - totalStart;
    console.log(`[ChatService] ask() request completed successfully in ${totalDuration.toFixed(1)}ms total.`);

    return {
      answer,
      sources,
    };
  }
}
