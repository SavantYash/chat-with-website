# Limitations

This document lists known limitations in the current implementation.

## Gemini API Quotas

- The system depends on Google Gemini API access.
- If the API key hits rate limits or quota restrictions, embedding and chat requests can fail.
- Rate-limit handling exists, but long waits or exhausted retries may still interrupt indexing.

## Static HTML Crawler Limitations

- The crawler only fetches HTML resources.
- Non-HTML resources are skipped.
- The crawler does not execute JavaScript, so dynamic pages may not be indexed correctly.
- The crawler is limited to the same origin/domain, so multi-domain sites are not supported.

## HTML Extraction Limitations

- `HtmlExtractor` uses Readability and Cheerio but may still capture noisy elements for complex pages.
- Some page structures may not be cleaned perfectly.
- Pages with very little clean text are skipped below the `minChars` threshold.

## Chunking Limitations

- Chunking is based on character counts, not tokens.
- Very large or highly structured content may produce suboptimal chunk boundaries.
- Overlap is fixed per chunk and may not preserve all semantic continuity.

## LanceDB Dependency

- The current vector store is tightly coupled to LanceDB for local storage.
- LanceDB requires local filesystem access and may not be suitable for distributed or serverless deployments.
- Persistence depends on the underlying platform's filesystem.

## Render / Deployment Limitations

- If deployed to a platform with ephemeral storage, the LanceDB database will be lost on restart without volume support.
- There is no production database or automatic migration pipeline configured.

## Missing Features

- No authentication or rate limiting on user-facing APIs.
- No persistent user sessions or multi-user state.
- No streaming chat response support.
- No caching layer for repeated queries.
- No automatic incremental indexing or scheduled refresh.

## Observability and Monitoring

- Logging is currently console-based.
- There is no structured telemetry or monitoring integration.

## Testing Limitations

- No centralized test harness, assertion library, or automated test script.
- Many tests rely on external websites and live API access.
- There is no coverage measurement or CI integration.
