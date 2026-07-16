# Review Notes

This document captures review findings from the codebase audit.

## Findings

### Critical

- `GEMINI_API_KEY` is required for both indexing and chat services, and missing configuration throws at runtime. This is expected but should be documented clearly.
- The application relies on local LanceDB persistence, which may lose data on ephemeral storage platforms.

### High

- There is no centralized test harness or npm script for running the standalone test scripts.
- Live external website dependencies are present in multiple test scripts, which can lead to brittle test runs.
- `GeminiEmbeddingProvider` and `GeminiChatProvider` use `@google/genai` but do not guard against missing network connectivity besides retries.

### Medium

- `LanceDBStore.upsert()` deletes existing rows before adding new rows, which may be expensive at scale.
- The `DocumentChunker` uses character-based chunking rather than tokenizer-based chunking.
- The UI does not expose query parameters such as `topK` or `temperature`.
- `PromptBuilder` assembles prompt text directly in code, which is fine for now, but no template abstraction exists.

### Low

- The `MockVectorStore` is only used in tests, but there is no documented mechanism to inject it in production code.
- Some classes are documented in comments but not included in external docs.
- The `next.config.ts` file is minimal and lacks any production-specific optimizations.

## Potential Improvements

- Add an application configuration layer to centralize environment and defaults.
- Add a `VectorStore` adapter interface for remote vector databases like Pinecone, Supabase, or Postgres.
- Add logging levels and structured logging for production observability.
- Use a more robust chunking algorithm that honors token-based model limits.
- Document the full set of test scripts and how they should be run.

## Observations

- The project is modular and follows a consistent DI-oriented architecture.
- Most of the critical logic is contained in clearly named classes and modules.
- The UI and API routes are separated well for a Next.js application.
- Comments and docstrings are present throughout the code, which aids understanding.
