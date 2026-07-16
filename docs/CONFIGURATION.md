# Configuration

This document describes runtime configuration and environment variables.

## Required Environment Variables

### `GEMINI_API_KEY`

- Description: API key for Google Gemini services.
- Used by: `GeminiEmbeddingProvider`, `GeminiChatProvider`, `createChatService()`, and `createIndexingPipeline()`.
- Failure mode: the application throws an error if this variable is missing.

## Optional Environment Variables

### `GEMINI_CHAT_MODEL`

- Description: Overrides the default Gemini chat model.
- Default: `gemini-3.1-flash-lite`
- Used by: `GeminiChatProvider`

## Configuration in Code

### `src/lib/chat/factory.ts`

The factory constructs the core dependencies and reads `GEMINI_API_KEY` from `process.env`.

### `GeminiEmbeddingProvider`

Constructor options:
- `apiKey`
- `modelName` (default `gemini-embedding-2`)
- `batchSize` (default `100`)
- `normalizeVectors` (default `true`)
- `maxRetries` (default `3`)
- `retryDelay` (default `1000`)
- `dimensions` (default `768`)

### `GeminiChatProvider`

Constructor options:
- `apiKey`
- `modelName` (default `process.env.GEMINI_CHAT_MODEL` or `gemini-3.1-flash-lite`)
- `maxRetries` (default `3`)
- `retryDelay` (default `1000`)

### `WebsiteCrawler`

Crawler options:
- `maxPages` (default `20`)
- `maxDepth` (default `3`)
- `requestDelay` (default `200` ms)
- `userAgent` (default `AntigravityBot`)

### `DocumentChunker`

Chunking options:
- `chunkSize` (default `1000` characters)
- `chunkOverlap` (default `200` characters)

### `IndexingPipeline.run()`

Runtime config fields in `IndexingConfig`:
- `maxPages`
- `maxDepth`
- `chunkSize`
- `chunkOverlap`
- `embeddingBatchSize`
- `clearExisting`
- `onProgress`
- `signal`
- `maxRateLimitRetries`
- `maxCumulativeWaitTimeSec`

## Configuration Best Practices

- Use `.env.local` for local development.
- Do not commit `.env.local` to version control.
- Ensure the same `GEMINI_API_KEY` is available for both indexing and chat services.
- Use `GEMINI_CHAT_MODEL` to test alternate generation models without changing application code.

## Example `.env.local`

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
```
