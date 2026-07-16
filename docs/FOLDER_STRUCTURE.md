# Folder Structure

This document explains the important folders and modules in the project.

## Root

- `package.json` - Application dependencies and scripts.
- `tsconfig.json` - TypeScript compiler configuration.
- `next.config.ts` - Next.js configuration, including server external package settings for `@lancedb/lancedb`.
- `README.md` - Project overview and quick start information.
- `.env.local` - Local environment variables (not tracked in source control).

## `src/`

The application source is organized into functional layers.

### `src/app/`

- `page.tsx` - Single-page UI component that manages website indexing, chat state, SSE consumption, and rendering.
- `layout.tsx` - Root application layout with global fonts and body structure.
- `api/` - Backend API routes for indexing and chat.

### `src/lib/`

This directory contains the core business logic and infrastructure components.

#### `src/lib/chat/`

- `chat-service.ts` - Orchestrates retrieval, prompt building, and LLM response generation.
- `retriever.ts` - Executes semantic retrieval using embeddings and vector similarity search.
- `prompt-builder.ts` - Constructs grounded prompts from retrieved document chunks.
- `factory.ts` - Dependency composition root for both chat service and indexing pipeline.
- `types.ts` - Chat-specific response and source type definitions.
- `index.ts` - Re-exports chat module public API.
- `test-*` scripts - Standalone integration and unit test runners for chat, prompt, retriever, and end-to-end verification.

#### `src/lib/crawler/`

- `crawler.ts` - Crawls a website using BFS, domain restrictions, and `robots.txt` rules.
- `index.ts` - Crawler interface and exports.
- `normalizer.ts` - URL normalization, relative link resolution, and domain validation.
- `parser.ts` - HTML title extraction and anchor link scraping using Cheerio.
- `robots.ts` - Robots.txt fetch and allow/deny evaluation using `robots-parser`.
- `test-*` scripts - Test runners for crawler behavior and utilities.

#### `src/lib/db/`

- `lancedb-store.ts` - LanceDB vector store implementation with schema, vector search, upsert, delete, clear, and count operations.
- `mock-store.ts` - In-memory test store exposing the same `VectorStore` interface.
- `index.ts` - Re-export for database adapters.
- `test-*` scripts - Standalone test runners for LanceDB and mock store behavior.

#### `src/lib/llm/`

- `embedding-provider.ts` - Embedding provider contract.
- `chat-provider.ts` - Chat provider contract.
- `gemini-embedding.ts` - Gemini embedding implementation and retry logic.
- `gemini-chat.ts` - Gemini chat completion implementation and retry logic.
- `index.ts` - Re-export for LLM modules.
- `test-*` scripts - Test runners for embedding and chat provider behavior.

#### `src/lib/rag/`

- `html-extractor.ts` - Extracts and cleans HTML content into semantic plain text.
- `chunker.ts` - Splits cleaned text into overlapping semantic chunks.
- `indexing-pipeline.ts` - Orchestrates crawling, extraction, chunking, embedding, and storage.
- `index.ts` - Re-export for RAG modules.
- `test-*` scripts - Test runners for chunking, extraction, indexing, and rate-limit behavior.

### `src/types/`

- `index.ts` - Core domain-level types and interface contracts used across the application.

## Why the Structure Exists

- `app/` contains UI and API endpoints since this is a Next.js App Router project.
- `lib/` contains reusable business logic and infrastructure components.
- `types/` centralizes shared contracts so multiple modules can stay decoupled.
- `docs/` holds architecture and onboarding documentation.

## Ownership

- UI and API behavior is owned by `src/app/`.
- Grounded chat orchestration is owned by `src/lib/chat/`.
- Website ingestion is owned by `src/lib/crawler/` and `src/lib/rag/`.
- Vector storage and database concerns are owned by `src/lib/db/`.
- External provider integrations are owned by `src/lib/llm/`.
- Shared data contracts and abstractions are owned by `src/types/`.
