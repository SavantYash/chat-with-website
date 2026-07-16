# API

This document describes the backend API endpoints exposed by the application.

## `POST /api/index`

Starts the website indexing pipeline and streams event updates back to the client.

### Request

- Content-Type: `application/json`
- Body:
  ```json
  {
    "url": "https://example.com",
    "maxPages": 5
  }
  ```

### Behavior

- Validates the request body.
- Requires a non-empty `url` string.
- Validates `maxPages` as a positive number.
- Uses `createIndexingPipeline()` to construct the pipeline.
- Runs the pipeline with `clearExisting: true`.
- Streams progress events using SSE.

### Response

The endpoint returns a text/event-stream response.

#### Progress event

```text
data: {"type":"progress","stage":"crawl","message":"Crawling site: https://example.com...","details":{...}}
```

#### Complete event

```text
data: {"type":"complete","message":"Successfully crawled and indexed: https://example.com","meta":{"url":"https://example.com","maxPages":5,"totalPages":1,"totalChunks":3,"durationMs":8250}}
```

#### Error event

```text
data: {"type":"error","error":"An unexpected error occurred during indexing."}
```

### Error cases

- `400 Bad Request` if JSON is invalid.
- `400 Bad Request` if `url` is missing or blank.
- `400 Bad Request` if `maxPages` is not a positive number.
- `500 Internal Server Error` for unexpected server failures.

## `POST /api/chat`

Handles user queries and returns a grounded response with citations.

### Request

- Content-Type: `application/json`
- Body:
  ```json
  {
    "message": "What is this website about?",
    "topK": 3,
    "temperature": 0.2,
    "maxOutputTokens": 150
  }
  ```

### Behavior

- Validates the request body.
- Requires a non-empty `message` string.
- Validates optional `topK`, `temperature`, and `maxOutputTokens`.
- Uses `createChatService()` to resolve dependencies.
- Calls `ChatService.ask()`.
- Returns generated content and citation sources.

### Response

```json
{
  "answer": "This website provides a RAG-based assistant that answers questions using indexed website content.",
  "sources": [
    {
      "title": "Example Domain",
      "url": "https://example.com/",
      "chunkNumber": 1,
      "totalChunks": 1,
      "distance": 0.00092
    }
  ]
}
```

### Error cases

- `400 Bad Request` if JSON is invalid.
- `400 Bad Request` if `message` is missing or blank.
- `400 Bad Request` if `topK` is invalid.
- `400 Bad Request` if `temperature` is invalid.
- `400 Bad Request` if `maxOutputTokens` is invalid.
- `500 Internal Server Error` for unexpected provider or service failures.

## Implementation Notes

- Both endpoints use a factory to instantiate dependencies, ensuring the same `LanceDBStore` configuration is reused.
- `POST /api/index` uses an SSE stream rather than a usual JSON response.
- `POST /api/chat` is synchronous and returns JSON.
