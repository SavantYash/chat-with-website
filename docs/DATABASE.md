# Database

This document describes the vector store abstraction and the current LanceDB implementation.

## Vector Store Abstraction

The application uses a `VectorStore` interface defined in `src/types/index.ts`.

### Interface responsibilities

- `initialize()` - establish database connection and schema
- `similaritySearch(queryEmbedding, limit, options?)` - return nearest neighbor `DocumentChunk`
- `upsert(documents)` - insert or update chunks with embeddings
- `delete(options)` - remove chunks based on metadata filters
- `count()` - return total indexed chunk count
- `clear()` - reset the store and remove all data

### Why the abstraction exists

- decouples core RAG logic from a specific database implementation
- enables future replacement with PostgreSQL, Pinecone, or other vector stores
- allows test adapters to use an in-memory mock store
- supports multiple backends without changing retrieval or chat logic

## Current Implementation: LanceDB

### Location

- `src/lib/db/lancedb-store.ts`

### Key behavior

- stores document chunks in a LanceDB table inside a local directory (default `./data/lancedb`)
- uses Apache Arrow schema with fixed-size vector column
- supports metadata filtering using SQL-like `WHERE` clauses
- implements `upsert()` by deleting existing rows with matching IDs and appending new rows
- provides `clear()` to drop the table and recreate it
- uses `vectorSearch()` API for nearest neighbor retrieval

### Schema fields

- `id`: string
- `url`: string
- `title`: string
- `content`: string
- `chunkIndex`: int
- `totalChunks`: int
- `startOffset`: int
- `endOffset`: int
- `vector`: fixed-size list of floats

## Capabilities

### Current capabilities

- `supportsMetadataFiltering`: true
- `supportsUpsert`: true
- `supportsDelete`: true

### Supported features

- exact nearest-neighbor search
- metadata filters like `eq`, `neq`, `gt`, `lt`, `contains`, and `in`
- vector persistence in a local directory

## Test Adapter: MockVectorStore

- Location: `src/lib/db/mock-store.ts`
- Purpose: in-memory `VectorStore` for tests and offline verification
- Behavior:
  - stores `DocumentChunk` objects in an array
  - computes cosine similarity on stored embeddings
  - preserves the same vector store interface
  - supports metadata filter evaluations

## Future Implementations

### PgVector implementation

A Postgres-based adapter would:
- implement `VectorStore` using `pgvector`
- support SQL vector search and metadata filtering in a relational database
- allow horizontally scalable storage and better persistence guarantees
- integrate with existing query/filter patterns by mapping `MetadataFilter` into SQL

### Pinecone implementation

A Pinecone adapter would:
- implement `VectorStore` using their HTTP/gRPC API
- support remote vector search and managed storage
- require mapping document metadata to Pinecone namespace or metadata fields
- fit larger production-scale retrieval workloads

## Composition Root Responsibilities

- `src/lib/chat/factory.ts` creates the concrete `LanceDBStore` instance
- This ensures the same DB path and namespace are used across indexing and chat paths
- The factory also calls `initialize()` before returning the store to consumers

## Notes

- The current LanceDB backend is embedded and requires local file system access.
- It is suitable for small to medium datasets, prototype usage, and local development.
- The vector store abstraction makes swapping adapters straightforward.
