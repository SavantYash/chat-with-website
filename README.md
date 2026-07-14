# Chat with a Website - RAG Backend Architecture

A high-performance, modular Retrieval-Augmented Generation (RAG) backend engine built with **Next.js (App Router)**, **TypeScript**, **Node.js**, **LanceDB**, and **Apache Arrow**.

This repository implements a clean architecture adhering strictly to SOLID principles, dependency injection, and separation of concerns.

---

## Project Status Checklist

- [x] ✅ Architecture (VectorStore & Service contracts defined)
- [x] ✅ Vector Store (LanceDB implementation)
- [x] ✅ Website Crawler (BFS, robots.txt, domain constraint)
- [x] ✅ Content Extractor (Mozilla Readability, Cheerio fallback)
- [x] ✅ Document Chunker (Semantic boundary splits)
- [x] ✅ Embedding Service
- [x] ✅ Indexing Pipeline
- [ ] ⬜ Retrieval Service
- [ ] ⬜ Prompt Builder
- [ ] ⬜ Chat API
- [ ] ⬜ Frontend
- [ ] ⬜ Deployment

---

## Vector Store (LanceDB)

### Responsibility
Encapsulates all database-specific vector search operations, schema validations, persistence, and semantic searches. It isolates the rest of the application from database details.

### Input
- Insertions: `DocumentChunk[]` (contains content text, offsets, and high-dimensional vector embeddings).
- Queries: `queryEmbedding: number[]` (semantic query vector) and `limit: number` (K results).
- Options: `Record<string, unknown>` (supporting SQL metadata filtering).

### Output
- Similarity Search: `Promise<DocumentChunk[]>` populated with metadata and similarity distance `score`.

### Pipeline Position
```text
Document Chunker
      ↓
Embedding Service
      ↓
[Vector Store (LanceDB)]
      ↓
Retrieval Service
```

### Design Decisions
- **Decoupled Configuration**: Exposes database path, table names, and vector dimensions via constructors to allow swapping or configuring embedding sizes.
- **Arrow Schema Verification**: Formulates an explicit Apache Arrow Schema (`Schema`, `Field`, `FixedSizeList`, `Float32`, `Int32`, `Utf8`) to ensure native columnar search performance.

### Why This Approach?
Rather than using key-value JSON stores, LanceDB utilizes a native vector format on disk via Arrow. Hardcoding schemas was avoided to allow extending the store to other providers with varying vector dimensions.

### Dependencies
- `@lancedb/lancedb`: Official Node.js bindings.
- `apache-arrow`: Used to construct and enforce strict type schemas.

### Edge Cases Considered
- **Table Exists Check**: Uses `connection.tableNames()` instead of try-catch flow controls to decide between `openTable()` and `createEmptyTable()`.
- **Zero Document Insertion**: Returns immediately if input lists are empty to avoid database block crashes.
- **Clear Store**: Drops tables completely and re-runs `initialize()` to reclaim disk sectors and reset indexes.

### Performance Considerations
- Columnar disk reads are optimized by Arrow.
- Inserting arrays of objects is bulk-buffered to avoid multiple file locks.

### Testing
- Checked using `src/lib/db/test-lancedb.ts` (inserts dummy 3D vectors, queries top matches close to query, asserts ranking, clears tables).

### Future Improvements
- Add native scalar index creation (e.g. on URL or title) to accelerate metadata filtering.

---

## Website Crawler

### Responsibility
Explores and indexes a target website recursively via a Breadth-First Search (BFS) queue. It enforces robots.txt rules, same-domain constraints, and request delay intervals.

### Input
- Start URL string (e.g. `https://example.com`).
- Configuration: `maxPages`, `maxDepth`, `requestDelay`, and `userAgent`.

### Output
- `Promise<WebPage[]>` where each page holds its origin `url`, HTML `<title>`, and raw `html` content.

### Pipeline Position
```text
Website URL
      ↓
[Website Crawler]
      ↓
Content Extractor
```

### Design Decisions
- **Collaborator Split**: Divided into single-responsibility classes:
  - `UrlNormalizer`: Cleans URLs and verifies domain bounds.
  - `HtmlParser`: Scrapes anchor tags.
  - `RobotsChecker`: Resolves and checks robots.txt files.
  - `WebsiteCrawler`: Runs the BFS queue.
- **Dependency Inversion**: Accepts components in the constructor (dependency injection) for test mocking.

### Why This Approach?
Splitting the logic prevents a single monolithic service that would be hard to maintain, debug, or mock. BFS is preferred over DFS for crawling to index pages closer to the root domain first.

### Dependencies
- `cheerio`: Fast DOM parsing.
- `robots-parser`: Robust robots.txt obedience checker.

### Edge Cases Considered
- **Blocked Crawling**: Skip paths matching disallow statements.
- **Protocol Filtering**: Discards `mailto:`, `javascript:`, or `ftp:` links.
- **Different Host**: Skip relative and absolute links pointing off-site.

### Performance Considerations
- Uses a `requestDelay` sleep block between requests to prevent triggering DDoS rate limiters.
- Maintains a memory set of visited links to prevent duplicate requests.

### Testing
- Verified using `src/lib/crawler/test-crawler.ts` crawling `https://example.com` under strict domain locks and delay intervals.

### Future Improvements
- Implement parallel crawling with limits (e.g., using `p-limit`) while respecting host restrictions.

---

## Content Extractor

### Responsibility
Converts messy, raw HTML pages into boilerplate-free, clean semantic content optimized for LLM readability.

### Input
- `WebPage` (origin url, raw html, scraped title).

### Output
- `ProcessedPage` (url, title, cleaned semantic content).

### Pipeline Position
```text
Website Crawler
      ↓
[Content Extractor]
      ↓
Document Chunker
```

### Design Decisions
- **Hybrid Extraction**: Tries Mozilla Readability on JSDOM first. Falls back to Cheerio stripping if Readability fails.
- **Structural Preservation**: Traverses elements recursively to convert tags into a clean layout:
  - Heading tags (`h1`-`h6`) $\rightarrow$ Markdown headings.
  - Bullet item tags (`li`) $\rightarrow$ Asterisk lists.
  - Code/pre tags $\rightarrow$ Markdown code blocks (backticks).

### Why This Approach?
Plain text extraction merges page content into a single block. Retaining headings, lists, and code blocks preserves semantic relationships, improving LLM generation quality.

### Dependencies
- `@mozilla/readability`: Main content extractor.
- `jsdom`: Simulated DOM implementation.
- `cheerio`: Fallback DOM queries.
- `domhandler`: Provides `AnyNode` type declarations for safe traversal.

### Edge Cases Considered
- **No Content Check**: Skips pages yielding less than 100 characters of clean content.
- **Nested Code**: Prevents duplicate markdown backticks on `<pre><code>` structures.
- **Missing Title**: Falls back to crawled metadata or placeholder strings.

### Performance Considerations
- Fallback parsing defaults to Cheerio which has low resource overhead.
- Collapses duplicate whitespaces and limits consecutive empty lines to a maximum of 2.

### Testing
- Verified using `src/lib/rag/test-extractor.ts` against `https://example.com` and `https://developer.mozilla.org/en-US/docs/Web/JavaScript` verifying markdown structure extraction.

### Future Improvements
- Support table layout extraction into standard Markdown table notation.

---

## Document Chunker

### Responsibility
Segments long clean content texts into small, overlapping semantic chunks that fit within model embedding token windows.

### Input
- `ProcessedPage` (url, title, cleaned semantic content).
- Configuration: `chunkSize` (max chunk length) and `chunkOverlap` (overlap size).

### Output
- `DocumentChunk[]` containing sequence indexes, offset bounds, and identifiers.

### Pipeline Position
```text
Content Extractor
      ↓
[Document Chunker]
      ↓
Embedding Service
```

### Design Decisions
- **Semantic Split Window**: Walks content using a sliding window. In the overlap boundary, it searches backwards for:
  - Paragraph endings (`\n\n` or `\n`).
  - Sentence punctuation (`. `, `? `, `! `).
  - Word space separations (` `).
- **Metadata Bundling**: Calculates offsets and total chunk counts in a single pass.

### Why This Approach?
Character splitters cut words or sentences in half, causing loss of context. By prioritizing paragraph and sentence splits, chunks maintain logical readability.

### Dependencies
- `uuid`: Generates globally unique identifiers for chunks.

### Edge Cases Considered
- **Infinite Loop Guard**: If no boundaries are detected in the overlap window, the splitter forces the cursor forward to prevent stalls.
- **Length Mismatch**: Returns empty lists if document text is empty.
- **Overlap Ceiling**: Validates that overlap is strictly smaller than chunk size.

### Performance Considerations
- Operates in-memory with $O(n)$ time complexity relative to page length.
- Attaches offsets and total chunk counts during partition to avoid secondary scans.

### Testing
- Tested using `src/lib/rag/test-chunker.ts` against MDN JavaScript content, verifying overlapping regions and boundary splits.

### Future Improvements
- Implement token-length splitting (using TikToken or similar) to match model limit boundaries.

---

## Embedding Service

### Responsibility
Generates high-dimensional dense vector representations of textual inputs using Google's Gemini API. It handles batch slicing, vector normalization, and exponential backoff retry policies for robust integration.

### Input
- Single: `embed(text: string)`
- Array: `embedBatch(texts: string[])`

### Output
- Single: `Promise<number[]>` representing a unit-length normalized float vector (default size 768).
- Array: `Promise<number[][]>` representing mapped list of normalized float vectors.

### Pipeline Position
```text
Document Chunker
      ↓
[Embedding Service]
      ↓
Vector Store (LanceDB)
```

### Design Decisions
- **Interface Decoupling**: Defined `EmbeddingProvider` interface to separate RAG orchestration logic from model providers.
- **Dimensionality Scaling**: Configures output dimensionality to 768 to match search indexing budgets.
- **Euclidean L2 Normalization**: Automatically normalizes vectors so their Euclidean distance equals 1. This converts expensive cosine similarity calculations into simple dot product equations.
- **Sequential Batches**: Sequences batch queries to guarantee rate limits are respected.

### Why This Approach?
The Google Gen AI SDK (`@google/genai`) was selected as the modern, unified SDK. Since `text-embedding-004` is discontinued in Gemini's developer API, we use the recommended `gemini-embedding-2` model configured with a 768 dimension limit.

### Dependencies
- `@google/genai`: Official Google generative AI client library.

### Edge Cases Considered
- **Network Fluctuation**: Retries only retryable HTTP errors (429, 500, 502, 503, 504) with backoffs.
- **Null/Blank Text**: Returns zero-vector pads if text content is blank.
- **Batch Slice Representation**: Maps string list arrays into structured `Content` objects with part blocks to prevent the API from combining multiple items.

### Performance Considerations
- Sequential batch iteration reduces rate-limit exhaustion.
- L2-normalized unit vectors allow LanceDB to skip calculation overheads during index retrieval.

### Testing
- Tested using `src/lib/llm/test-embedding.ts` verifying semantic cosine similarity thresholds and duplicate matching (similarity = 1.00000).

### Future Improvements
- Implement local caching or hashing strategies to bypass redundant API calls on repeated chunks.

---

## Indexing Pipeline

### Responsibility
Orchestrates the complete indexing workflow from website URL to vector database storage. It coordinates the crawling, HTML cleaning, semantic boundary snapping, batch vector embedding generation, and LanceDB writing.

### Input
- Starting entrypoint URL string (e.g., `https://example.com`)
- Configuration: `IndexingConfig` (including limits, overrides, clearing options, callbacks, and abort signals).

### Output
- `IndexingSummary` containing:
  - `pagesVisited`: Discovered count.
  - `pagesIndexed`: Successfully parsed and written count.
  - `skippedPages`: Skips/failures count.
  - `chunksCreated`: Total segments split.
  - `chunksStored`: Total chunks written.
  - Diagnostics breakdowns: `crawlDuration`, `extractionDuration`, `chunkingDuration`, `embeddingDuration`, `storageDuration`, and `totalDuration`.
  - Detailed `pages` results with success/failure status and stage metadata.

### Pipeline Position
```text
Website URL
    ↓
Crawler
    ↓
Content Extractor
    ↓
Document Chunker
    ↓
Embedding Service
    ↓
[Indexing Pipeline (Orchestrator)]
    ↓
Vector Store (LanceDB)
```

### Design Decisions
- **Loose Coupling via Dependency Injection**: Accepts instances in the constructor to keep the system testable and decouple business boundaries.
- **Configurable Override Factory**: Runs local chunkers if dimensions/overlaps are customized at runtime.
- **Progress Callback Event Stream**: Fires real-time events (`initialize`, `crawl`, `extract`, `chunk`, `embed`, `store`, `complete`, `cancel`) to let parent APIs render status messages.
- **Graceful Error Ingestion**: Catch individual page exceptions to prevent the indexing thread from failing completely.
- **Memory-Optimized Bulk Operations**: Groups chunk lists across successful pages, queries embeddings in optimal batch sizes, and executes database inserts sequentially.
- **Idempotency Check (`clearExisting`)**: Resets/clears vector tables before index tasks if requested.
- **AbortSignal Monitoring**: Periodically checks `signal.aborted` status at loop entry points to stop execution immediately on cancellation.

### Why This Approach?
A centralized orchestrator keeps modular subsystems focused on single responsibilities. Injecting services ensures we can mock Google Gen AI or JSDOM boundaries, while granular timing diagnostics allow developers to identify bottleneck thresholds.

### Dependencies
No extra dependencies are introduced; it coordinates existing modules.

### Edge Cases Considered
- **Crawl Parameter Mapping**: Maps overrides safely to prevent `[object Object]` type mismatches.
- **Batch Embedding Failures (Partial Success)**: If a batch fails during vector generation or database writing, the pipeline marks only those pages as failed, counts stored vectors correctly, and continues with remaining batches.
- **Immediate Cancellation**: Terminates early and reports a `cancel` stage status if `signal.aborted` is caught at loop starts.

### Performance Considerations
- Sequential batch iteration avoids HTTP 429 rate limit locks.
- Aggregated database insertions reduce directory file-lock times.

### Testing
- Verified via `src/lib/rag/test-indexing.ts` crawling example.com and MDN JavaScript guides, verifying abort timeouts, and running a successful search on LanceDB showing matched metadata.

### Future Improvements
- Implement parallel batch embedding generation using `p-limit` to increase throughput.
