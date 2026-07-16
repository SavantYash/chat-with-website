import { NextResponse } from "next/server";
import { createIndexingPipeline } from "@/lib/chat";

/**
 * POST /api/index
 * 
 * Handles HTTP requests to index a target website, streaming progress events
 * back to the client using a text/event-stream response.
 */
export async function POST(request: Request) {
  const requestStartTime = performance.now();
  console.log(`[API /api/index] Received POST request.`);

  try {
    // 1. JSON parse safety check
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn(`[API /api/index] ❌ Failed to parse JSON request body.`);
      return NextResponse.json(
        { error: "Invalid JSON format in request body." },
        { status: 400 }
      );
    }

    const { url, maxPages } = body as { url?: string; maxPages?: number };

    // 2. Validations
    if (!url || typeof url !== "string" || !url.trim()) {
      console.warn(`[API /api/index] ❌ Validation failed: 'url' is missing or blank.`);
      return NextResponse.json(
        { error: "Missing or invalid required body parameter: 'url'" },
        { status: 400 }
      );
    }

    const limitPages = maxPages !== undefined ? Number(maxPages) : 10;
    if (isNaN(limitPages) || limitPages <= 0) {
      console.warn(`[API /api/index] ❌ Validation failed: 'maxPages' must be a positive number.`);
      return NextResponse.json(
        { error: "Invalid parameter: 'maxPages' must be a positive number." },
        { status: 400 }
      );
    }

    // 3. Resolve dependencies using the factory
    console.log(`[API /api/index] Instantiating dependencies via IndexingPipeline factory...`);
    const pipeline = await createIndexingPipeline();

    // 4. Return Event Stream Response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          console.log(`[API /api/index] Starting indexing run for startUrl: "${url}" (maxPages: ${limitPages})...`);
          const summary = await pipeline.run(url.trim(), {
            maxPages: limitPages,
            maxDepth: 3,
            clearExisting: true, // Resets database tables for a clean crawl
            onProgress: (event) => {
              sendEvent({
                type: "progress",
                message: event.message,
                stage: event.stage,
                details: event.details
              });
            },
          });

          const elapsed = performance.now() - requestStartTime;
          console.log(`[API /api/index] Completed successfully in ${elapsed.toFixed(1)}ms. Total pages: ${summary.pagesIndexed}, chunks: ${summary.chunksStored}.`);

          sendEvent({
            type: "complete",
            message: `Successfully crawled and indexed: ${url}`,
            meta: {
              url,
              maxPages: limitPages,
              totalPages: summary.pagesIndexed,
              totalChunks: summary.chunksStored,
              durationMs: elapsed
            }
          });
          controller.close();
        } catch (error: any) {
          const elapsed = performance.now() - requestStartTime;
          console.error(`[API /api/index] ❌ Indexing failure after ${elapsed.toFixed(1)}ms: ${error.message}`);
          sendEvent({
            type: "error",
            error: error.message || "An unexpected error occurred during indexing."
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (error: any) {
    const elapsed = performance.now() - requestStartTime;
    console.error(`[API /api/index] ❌ Critical indexing error after ${elapsed.toFixed(1)}ms: ${error.message}`);
    return NextResponse.json(
      { error: `Internal indexing error: ${error.message}` },
      { status: 500 }
    );
  }
}
