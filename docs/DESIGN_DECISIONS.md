# Design Decisions

This document explains the key architectural choices in the project.

## Dependency Injection

The project uses constructor-based dependency injection to keep classes decoupled from concrete implementations.

- `ChatService` depends on `Retriever`, `PromptBuilder`, and `ChatProvider`.
- `Retriever` depends on `EmbeddingProvider` and `VectorStore`.
- `IndexingPipeline` depends on `Crawler`, `HtmlExtractor`, `DocumentChunker`, `EmbeddingProvider`, and `VectorStore`.

This makes each component easier to test and replace.

## Factory Pattern

- `src/lib/chat/factory.ts` creates and initializes concrete objects.
- It centralizes configuration and ensures consistent database and provider setup.
- Factories are used at API boundaries to keep the core domain logic implementation-agnostic.

## Interface-based Architecture

The system defines interfaces for each major external dependency.

- `VectorStore` for vector database storage and retrieval.
- `EmbeddingProvider` for embedding generation.
- `ChatProvider` for model completion.
- `Crawler` for website crawling.

This allows future alternative implementations without changing the orchestration logic.

## Provider Abstraction

- Gemini-specific code is isolated in `src/lib/llm/`.
- The rest of the solution relies only on provider interfaces.
- This abstraction enables future support for OpenAI, Cohere, or local embedding and chat providers.

## VectorStore Abstraction

- Using `VectorStore` isolates the RAG logic from LanceDB details.
- It allows the chat pipeline to only depend on `similaritySearch()`.
- Metadata filtering is supported generically so new stores can support the same query patterns.

## Retrieval-Augmented Generation (RAG)

- The application uses retrieved document chunks as the single source of truth for answers.
- The prompt template enforces grounding and avoids hallucination.
- RAG decouples the knowledge source from the LLM model.

## Modular Services

- The architecture separates ingestion, storage, retrieval, and generation.
- Frontend logic is separate from backend orchestration.
- Each folder and class has a focused responsibility.

## Practical choices

- **LanceDB** is chosen for embedded vector storage in a local prototype.
- **Gemini** is chosen as the LLM and embedding provider using `@google/genai`.
- **Mozilla Readability + Cheerio** are used for robust HTML extraction.
- **No test framework** is used; instead, standalone script-based test runners are provided.

## Why These Decisions

- The chosen architecture supports rapid prototyping while remaining extensible.
- Interfaces make it easy to adopt new providers or databases.
- The split between indexing and chat paths aligns with RAG best practices.
- Local file-backed storage simplifies deployment for proof-of-concept use cases.
