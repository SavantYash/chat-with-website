# Abstraction Audit

## Summary

The project demonstrates a deliberate abstraction-based architecture for the core RAG flow. Key runtime components depend on interfaces for:

- `VectorStore`
- `EmbeddingProvider`
- `ChatProvider`
- `Crawler`

The composition root in `src/lib/chat/factory.ts` centralizes concrete instantiation. This is a strong foundation for provider-agnostic extension.

However, the architecture is not fully complete: several pipeline helpers are concrete classes without explicit interface contracts, and provider selection is hard-coded in the factory rather than configured externally.

## What is Abstracted Well

### 1. Retrieval / Storage Boundary

- `src/types/index.ts` defines `VectorStore`, `SearchOptions`, and `MetadataFilter`.
- `Retriever` depends on `EmbeddingProvider` and `VectorStore` only.
- `LanceDBStore` implements `VectorStore`, and `MockVectorStore` provides a test substitute.
- `IndexingPipeline` depends on `VectorStore` for persistence, not knowledge of LanceDB internals.

### 2. Embedding Provider Boundary

- `src/lib/llm/embedding-provider.ts` defines `EmbeddingProvider`.
- `GeminiEmbeddingProvider` implements it.
- `Retriever` and `IndexingPipeline` use the provider through the interface.

### 3. Chat Provider Boundary

- `src/lib/llm/chat-provider.ts` defines `ChatProvider`.
- `GeminiChatProvider` implements it.
- `ChatService` uses `ChatProvider` only.

### 4. Crawler Boundary

- `src/lib/crawler/index.ts` defines the `Crawler` interface.
- `WebsiteCrawler` implements it.
- `IndexingPipeline` accepts a `Crawler` instance.

### 5. Composition Root

- `src/lib/chat/factory.ts` is the central place where concrete dependencies are wired.
- `src/app/api/chat/route.ts` and `src/app/api/index/route.ts` use factory functions to instantiate services.
- `LanceDBStore.initialize()` is called in the factory before the store is passed to consumers.

## Concrete Dependencies

The app currently wires the following concrete implementations in the composition root:

- `GeminiEmbeddingProvider`
- `GeminiChatProvider`
- `LanceDBStore`
- `WebsiteCrawler`
- `HtmlExtractor`
- `DocumentChunker`
- `PromptBuilder`

## Missing or Weak Abstractions

### 1. `HtmlExtractor`

- `IndexingPipeline` receives an `HtmlExtractor` instance, but there is no exported `Extractor` interface.
- This means the pipeline is still loosely coupled by structural typing, not by an explicit contract.

### 2. `DocumentChunker`

- `IndexingPipeline` is built around `DocumentChunker` and even creates `new DocumentChunker(...)` internally when chunk config overrides are supplied.
- This internal `new` is a hidden concrete dependency that reduces configurability.

### 3. `PromptBuilder`

- `ChatService` depends on a concrete `PromptBuilder` class.
- There is no `PromptBuilder` interface to explicitly support alternative prompt formatting strategies.

### 4. Provider Composition is Hard-Coded

- The factory hard-codes provider implementations and their config values.
- A different provider requires editing `src/lib/chat/factory.ts` rather than selecting through environment/configuration.

### 5. Logging and Configuration

- Logging is implemented directly with `console.log` / `console.warn` / `console.error`.
- There is no logger abstraction for replacing or suppressing logging in different environments.
- Configuration values are read directly from environment variables and constructor options rather than a dedicated config abstraction.

## Provider Swap Matrix

| Component | Current Abstraction | Can swap without code changes? | Notes |
|---|---|---|---|
| Embedding Provider | `EmbeddingProvider` | Yes, in code via factory only | Replace with any implementation of `EmbeddingProvider`; requires factory edit. |
| Chat Provider | `ChatProvider` | Yes, in code via factory only | Replace with any implementation of `ChatProvider`; requires factory edit. |
| Vector Store | `VectorStore` | Yes, in code via factory only | `MockVectorStore` already proves swap capability. |
| Crawler | `Crawler` | Yes, in code via factory only | `WebsiteCrawler` is the only provided implementation. |
| HTML Extraction | No explicit interface | Mostly yes via structural typing, but not documented | Add an `Extractor` interface for clarity. |
| Chunking | No explicit interface | Mostly yes via structural typing, but pipeline instantiates `DocumentChunker` internally | Add a `Chunker` interface and remove internal instantiation. |
| Prompt Formatting | No explicit interface | No | Add a `PromptBuilder` interface to support alternate prompt styles. |
| Logging | No abstraction | No | Add a logging adapter interface to remove console dependency. |

## Abstraction Completeness Score

- Core RAG boundary abstractions: 8/10
- Helper component abstractions: 5/10
- Configuration / runtime provider selection: 4/10
- Overall architecture completeness: 6.5/10

This score reflects a strong core design with room to improve peripheral and orchestration abstractions.

## Key Recommendations

1. Add explicit interfaces for:
   - `Extractor` / `HtmlExtractor`
   - `Chunker` / `DocumentChunker`
   - `PromptFormatter` / `PromptBuilder`
   - Optional: `Logger`

2. Remove internal concrete instantiation from `IndexingPipeline`.
   - Accept chunking strategy entirely through dependency injection.
   - Allow config overrides to be applied by wrapping the injected chunker or passing a factory.

3. Make provider selection configurable.
   - Use environment variables or a configuration object to choose `EmbeddingProvider`, `ChatProvider`, and `VectorStore` implementations.
   - Keep the factory as the composition root, but make it decision-driven rather than fixed.

4. Keep the composition root and avoidance of direct concrete use in core services.
   - The current `ChatService`, `Retriever`, and `IndexingPipeline` designs are solid.
   - Avoid adding new `new` expressions outside the factory for core dependencies.

5. Consider abstraction for cross-cutting concerns.
   - Logging
   - Metrics / telemetry
   - Abort / cancellation handling (already good via AbortSignal)

## Conclusion

The project has achieved a strong abstraction-based architecture for the core retrieval and generation paths. The most important boundaries are cleanly defined and used correctly.

Remaining work is largely about making pipeline helpers and configuration/provider selection explicit and extensible. Once those gaps are addressed, the system will be much closer to a fully provider-agnostic architecture.
