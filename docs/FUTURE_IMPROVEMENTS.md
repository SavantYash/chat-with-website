# Future Improvements

This document lists realistic future improvements for the project.

## High Priority

- Add a formal test framework with centralized scripts (Jest or Vitest).
- Add CI integration for linting and standalone test scripts.
- Add persistent external vector storage adapter (Postgres `pgvector`, Pinecone, or similar).
- Add application-level authentication and request rate limiting.

## Medium Priority

- Convert crawler to support JavaScript rendering via Playwright or Puppeteer.
- Add streaming chat responses for better UX.
- Add caching of embeddings and search results.
- Add incremental indexing or scheduled refresh jobs.
- Add a configuration-driven storage layer for production deployments.

## Low Priority

- Add advanced prompt management and prompt tuning.
- Add UI improvements for citation display and chat history export.
- Add metadata-based filtering to the chat query UI.
- Add a dashboard for indexing and storage health.
- Add observability hooks or integration with logs/metrics platforms.
