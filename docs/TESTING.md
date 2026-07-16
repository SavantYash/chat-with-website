# Testing

This document describes current test utilities and how to execute them.

## Test scripts

The repository does not use a formal test runner like Jest or Vitest.
Instead, there are standalone TypeScript scripts in the `src/lib/` folders.

### Key test scripts

- `src/lib/db/test-mock-store.ts` - validates in-memory vector store operations.
- `src/lib/db/test-lancedb.ts` - validates LanceDB store integration.
- `src/lib/llm/test-embedding.ts` - validates Gemini embedding provider behavior.
- `src/lib/llm/test-chat.ts` - validates Gemini chat provider behavior.
- `src/lib/crawler/test-crawler.ts` - validates crawler page discovery and normalization.
- `src/lib/crawler/test-normalizer.ts` - validates URL normalization logic.
- `src/lib/rag/test-chunker.ts` - verifies chunking boundaries and overlap behavior.
- `src/lib/rag/test-extractor.ts` - validates HTML extraction logic.
- `src/lib/rag/test-indexing.ts` - verifies the full indexing pipeline integration.
- `src/lib/rag/test-rate-limit.ts` - validates retry and rate-limit handling.
- `src/lib/chat/test-chat-service.ts` - validates ChatService end-to-end behavior.
- `src/lib/chat/test-end-to-end.ts` - runs a complete indexing and chat verification sequence.
- `src/lib/chat/test-prompt.ts` - validates prompt formatting and grounding instructions.
- `src/lib/chat/test-retriever.ts` - validates query embedding and retrieval logic.

## How to execute

Use `npx tsx` or any TypeScript execution tool in the repository root.

Example:

```bash
npx tsx src/lib/db/test-mock-store.ts
npx tsx src/lib/llm/test-embedding.ts
npx tsx src/lib/chat/test-end-to-end.ts
```

## What each validates

| Script | Purpose |
|---|---|
| `test-mock-store.ts` | Verifies in-memory vector store operations, similarity search, metadata filtering, delete, and clear. |
| `test-lancedb.ts` | Verifies LanceDB schema creation, upsert, similarity search, and store behavior. |
| `test-embedding.ts` | Validates Gemini embedding API integration and vector dimension checks. |
| `test-chat.ts` | Validates Gemini chat provider integration and generation response handling. |
| `test-crawler.ts` | Checks crawler behavior, link extraction, and filtering. |
| `test-normalizer.ts` | Validates URL normalization and resolution logic. |
| `test-chunker.ts` | Verifies chunk boundary selection and overlap semantics. |
| `test-extractor.ts` | Tests HTML extraction and content cleaning. |
| `test-indexing.ts` | Runs the indexing pipeline against live sites and inspects summary results. |
| `test-rate-limit.ts` | Tests retry behavior under rate limit conditions. |
| `test-chat-service.ts` | Tests chat orchestration with Gemini and retrieval. |
| `test-end-to-end.ts` | Runs the full RAG workflow from crawl to chat response. |
| `test-prompt.ts` | Verifies prompt construction and grounding text generation. |
| `test-retriever.ts` | Tests retrieval logic and embedding-vector search alignment. |

## Notes

- Many tests require `GEMINI_API_KEY` in `.env.local` or shell environment.
- Some test scripts use live external endpoints such as `example.com`, `developer.mozilla.org`, or Gemini APIs.
- Test execution may take time due to network calls and indexing operations.
- The repository currently lacks a centralized package script for tests.
