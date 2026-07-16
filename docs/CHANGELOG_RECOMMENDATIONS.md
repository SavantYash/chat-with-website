# Changelog Recommendations

This document lists recommended improvements grouped by priority.

## High Priority

- Add a centralized test runner and package scripts for automated test execution.
- Add CI configuration to run lint and test scripts automatically.
- Implement a production-capable vector store adapter such as Postgres with `pgvector` or Pinecone.
- Convert environment variable handling and configuration to a centralized config module.
- Add persistent storage support for deployments with ephemeral filesystems.

## Medium Priority

- Add authentication and request limits for API endpoints.
- Improve crawler support for JavaScript-driven websites.
- Add streaming output support for chat responses.
- Implement better extraction quality for complex sites.
- Add an application-level logging and monitoring strategy.

## Low Priority

- Add a UI settings panel for model and retrieval parameters.
- Add citation-focused UX improvements like source preview and snippet highlights.
- Add a re-indexing status page and history log interface.
- Add support for additional LLM providers beyond Gemini.
