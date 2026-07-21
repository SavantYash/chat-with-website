import { NextResponse } from "next/server";
import { createIndexingPipeline } from "@/lib/chat";
import { MAX_PAGES, DEFAULT_MAX_PAGES } from "@/lib/constants";

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

    // 2. Validations & hard clamping to 1-15 pages
    if (!url || typeof url !== "string" || !url.trim()) {
      console.warn(`[API /api/index] ❌ Validation failed: 'url' is missing or blank.`);
      return NextResponse.json(
        { error: "Missing or invalid required body parameter: 'url'" },
        { status: 400 }
      );
    }

    const rawPages = maxPages !== undefined ? Number(maxPages) : DEFAULT_MAX_PAGES;
    const limitPages = Math.min(Math.max(1, isNaN(rawPages) ? DEFAULT_MAX_PAGES : Math.floor(rawPages)), MAX_PAGES);

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
            signal: request.signal,
            onProgress: (event) => {
              sendEvent({
                type: "progress",
                message: event.message,
                stage: event.stage,
                details: event.details
              });
            },
          });

          if (summary.pagesVisited >= limitPages || summary.pagesIndexed >= limitPages) {
            sendEvent({
              type: "progress",
              message: `Page limit reached (${limitPages} pages). Indexing completed.`,
              stage: "complete"
            });
          }

          const elapsed = performance.now() - requestStartTime;
          console.log(`[API /api/index] Completed successfully in ${elapsed.toFixed(1)}ms. Total pages: ${summary.pagesIndexed}, chunks: ${summary.chunksStored}.`);

          const totalBatches = Math.ceil((summary.chunksCreated || 0) / 50) || 1;

          sendEvent({
            type: "complete",
            message: `Successfully crawled and indexed: ${url}`,
            meta: {
              url,
              maxPages: limitPages,
              pagesVisited: summary.pagesVisited,
              pagesIndexed: summary.pagesIndexed,
              pagesCleaned: summary.pagesIndexed,
              chunksCreated: summary.chunksCreated,
              embeddingBatches: totalBatches,
              chunksStored: summary.chunksStored,
              durationMs: elapsed
            }
          });
          controller.close();
        } catch (error: any) {
          const elapsed = performance.now() - requestStartTime;
          if (error.name === "AbortError" || request.signal.aborted) {
            console.log(`[API /api/index] 🛑 Request aborted after ${elapsed.toFixed(1)}ms.`);
            sendEvent({
              type: "progress",
              message: "[Cancelled] Indexing run was cancelled by user.",
              stage: "cancel"
            });
            sendEvent({
              type: "error",
              error: "Indexing run was cancelled by user."
            });
          } else {
            console.error(`[API /api/index] ❌ Indexing failure after ${elapsed.toFixed(1)}ms: ${error.message}`);
            sendEvent({
              type: "error",
              error: error.message || "An unexpected error occurred during indexing."
            });
          }
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
