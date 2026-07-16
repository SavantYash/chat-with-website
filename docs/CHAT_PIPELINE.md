# Chat Pipeline

This document explains the query-time chat pipeline used to answer user questions.

## Chat Pipeline Overview

The chat pipeline retrieves context from the indexed vector store and generates a grounded answer using Gemini.

```mermaid
graph TD
  User[User Query] --> UI[Next.js UI]
  UI --> API[/api/chat]
  API --> ChatService[ChatService]
  ChatService --> Retriever[Retriever]
  Retriever --> GeminiEmbeddingProvider[EmbeddingProvider]
  Retriever --> LanceDBStore[VectorStore]
  ChatService --> PromptBuilder[PromptBuilder]
  PromptBuilder --> GeminiChatProvider[ChatProvider]
  GeminiChatProvider --> Gemini API
  Gemini API --> ChatService
  ChatService --> API
  API --> UI
```

## Components

### `ChatService`

- Location: `src/lib/chat/chat-service.ts`
- Role: Orchestrates the full chat request.
- Tasks:
  - retrieve relevant chunks using `Retriever`
  - build the grounded prompt using `PromptBuilder`
  - call `GeminiChatProvider`
  - map retrieved chunks into `ChatSource`

### `Retriever`

- Location: `src/lib/chat/retriever.ts`
- Role: Retrieves semantically relevant chunks from the vector store.
- Tasks:
  - convert user query to a vector embedding
  - query the vector store with `similaritySearch`
  - preserve retrieval score/distance values

### `PromptBuilder`

- Location: `src/lib/chat/prompt-builder.ts`
- Role: Formats the final prompt for the LLM.
- Tasks:
  - add system instructions and grounding rules
  - iterate retrieved chunks into numbered source sections
  - separate `CONTEXT`, `QUESTION`, and `ANSWER` blocks

### `GeminiChatProvider`

- Location: `src/lib/llm/gemini-chat.ts`
- Role: Calls Gemini text generation.
- Tasks:
  - apply `temperature` and `maxOutputTokens` if provided
  - retry transient errors
  - return generated text

### `LanceDBStore` retrieval

- The store returns `DocumentChunk` objects with `score` derived from the LanceDB `_distance` field.
- Search is limited by `topK` and can include filters, though standard chat queries use only the query embedding.

## Request/Response Flow

1. `POST /api/chat` receives JSON body: `message`, optional `topK`, `temperature`, `maxOutputTokens`.
2. The route validates inputs and calls `createChatService()`.
3. `ChatService.ask()` retrieves relevant chunks.
4. The prompt builder formats instructions and context.
5. The chat provider generates an answer.
6. The API responds with `ChatResponse`.

## Response Model

- `answer`: generated text from Gemini.
- `sources`: array of `ChatSource` objects.

## Prompt Constraints

The prompt builder explicitly instructs the model to:

- answer only from provided context
- avoid using outside knowledge
- return a fixed fallback if the answer is unavailable
- cite sources using numbered references

## Grounding and Citations

- Each retrieved chunk is presented as `[Source N]` with title, URL, and chunk metadata.
- This encourages the model to ground answers on retrieved content and provide transparent citations.

## Failure and Resilience

- Input validation returns `400` errors for malformed requests.
- Provider errors are caught and returned as `500` server errors.
- The service logs stage timings without exposing raw user prompts in internal debug logs.
