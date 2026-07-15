import { DocumentChunk } from "../../types";

/**
 * PromptBuilder is responsible for constructing prompt strings for the Gemini Chat Model.
 * 
 * It acts as a pure, deterministic formatter that structures system instructions,
 * retrieved source chunks, metadata citations, and the user question into a standard format.
 * 
 * Rules:
 * 1. Single Responsibility: Focused entirely on formatting the prompt. Does not call APIs or run retrieval.
 * 2. Grounding Constraints: Instructs the model to answer exclusively from the provided context or fallback.
 * 3. Citations Support: Numbers every source chunk explicitly (e.g., [Source 1]) so the LLM can cite references.
 * 4. Structured Dividers: Uses clear visual boundaries to separate Context, Question, and Answer blocks.
 */
export class PromptBuilder {
  /**
   * Constructs the grounded prompt for the LLM using the question and context chunks.
   * 
   * @param question The natural language question from the user.
   * @param chunks The array of document chunks retrieved for grounding.
   * @returns The fully constructed prompt string.
   */
  buildPrompt(question: string, chunks: DocumentChunk[]): string {
    const systemInstructions = [
      "## System Instructions",
      "",
      "You are an AI assistant that answers questions ONLY using the provided website context.",
      "",
      "Rules:",
      "- Do not use outside knowledge.",
      "- If the answer is not contained in the context, reply exactly:",
      "\"I couldn't find that information in the indexed website.\"",
      "- Do not fabricate or speculate on any information.",
      "- Cite the relevant source numbers (e.g., [Source 1], [Source 2]) when answering."
    ].join("\n");

    const contextHeader = [
      "========================",
      "CONTEXT",
      "========================"
    ].join("\n");

    let contextContent = "";
    if (chunks.length === 0) {
      contextContent = "No relevant context was retrieved.";
    } else {
      contextContent = chunks
        .map((chunk, idx) => {
          return [
            `[Source ${idx + 1}]`,
            `Title: ${chunk.title}`,
            `URL: ${chunk.url}`,
            `Chunk Number: ${chunk.chunkIndex + 1} of ${chunk.totalChunks}`,
            "",
            "Content:",
            chunk.content
          ].join("\n");
        })
        .join("\n\n------------------------\n\n");
    }

    const questionHeader = [
      "========================",
      "QUESTION",
      "========================"
    ].join("\n");

    const answerHeader = [
      "========================",
      "ANSWER",
      "========================"
    ].join("\n");

    return [
      systemInstructions,
      "",
      contextHeader,
      "",
      contextContent,
      "",
      questionHeader,
      "",
      question,
      "",
      answerHeader
    ].join("\n");
  }
}
