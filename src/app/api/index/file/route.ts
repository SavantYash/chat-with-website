import { NextResponse } from "next/server";
import { createIndexingPipeline, createFileSource } from "@/lib/chat";
import { defaultExtractorRegistry } from "@/lib/extractors";
import { IndexingProgressEvent } from "@/types";

/**
 * POST /api/index/file
 * 
 * Handles multipart/form-data file uploads (PDF, DOCX, Markdown, TXT),
 * parses them via FileKnowledgeSource + ExtractorRegistry, and indexes them
 * through the common IndexingPipeline with SSE progress streaming.
 */
export async function POST(request: Request) {
  const requestStartTime = performance.now();
  console.log(`[API /api/index/file] Received POST request.`);

  try {
    const formData = await request.formData();
    const uploadedFiles = formData.getAll("file") as File[];

    if (!uploadedFiles || uploadedFiles.length === 0 || uploadedFiles.every((f) => !f.name)) {
      return NextResponse.json(
        { error: "No files uploaded. Please attach at least one valid document." },
        { status: 400 }
      );
    }

    const fileInputs = [];
    const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit

    for (const file of uploadedFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File '${file.name}' exceeds maximum allowed size of 25MB.` },
          { status: 400 }
        );
      }

      const ext = file.name.split(".").pop() || "";
      if (!defaultExtractorRegistry.isSupported(ext, file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported file format for '${file.name}'. Supported formats: PDF (.pdf), Word (.docx), Markdown (.md), Plain Text (.txt).`,
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fileInputs.push({
        buffer,
        fileName: file.name,
        mimeType: file.type,
      });
    }

    // 1. Create FileKnowledgeSource and IndexingPipeline
    const fileSource = createFileSource(fileInputs);
    const pipeline = await createIndexingPipeline();

    // 2. Stream SSE progress events back to client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          console.log(`[API /api/index/file] Starting indexing for files: ${fileSource.sourceName}...`);
          const summary = await pipeline.run(fileSource, {
            clearExisting: true, // Reset vector database for new knowledge source
            signal: request.signal,
            onProgress: (event: IndexingProgressEvent) => {
              const isRateLimit =
                event.details?.action === "rate_limit" || event.details?.action === "rate_limit_tick";
              sendEvent({
                type: isRateLimit ? "rate_limit" : "progress",
                message: event.message,
                stage: event.stage,
                details: event.details,
              });
            },
          });

          const elapsed = performance.now() - requestStartTime;
          console.log(
            `[API /api/index/file] Completed in ${elapsed.toFixed(1)}ms. Docs: ${summary.pagesIndexed}, Chunks: ${summary.chunksStored}.`
          );

          const totalBatches = Math.ceil((summary.chunksCreated || 0) / 50) || 1;

          sendEvent({
            type: "complete",
            message: `Successfully indexed document(s): ${fileSource.sourceName}`,
            meta: {
              url: fileSource.sourceName,
              sourceType: "file",
              fileName: fileSource.sourceName,
              maxPages: summary.pagesVisited,
              pagesVisited: summary.pagesVisited,
              pagesIndexed: summary.pagesIndexed,
              pagesCleaned: summary.pagesIndexed,
              chunksCreated: summary.chunksCreated,
              embeddingBatches: totalBatches,
              chunksStored: summary.chunksStored,
              durationMs: elapsed,
            },
          });

          controller.close();
        } catch (error: any) {
          const elapsed = performance.now() - requestStartTime;
          if (error.name === "AbortError" || request.signal.aborted) {
            console.log(`[API /api/index/file] 🛑 Request aborted after ${elapsed.toFixed(1)}ms.`);
            sendEvent({
              type: "progress",
              message: "[Cancelled] Document indexing was cancelled by user.",
              stage: "cancel",
            });
            sendEvent({
              type: "error",
              error: "Document indexing was cancelled by user.",
            });
          } else {
            console.error(`[API /api/index/file] ❌ Indexing failure after ${elapsed.toFixed(1)}ms: ${error.message}`);
            sendEvent({
              type: "error",
              error: error.message || "An unexpected error occurred during document indexing.",
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
    console.error(`[API /api/index/file] ❌ Critical error after ${elapsed.toFixed(1)}ms: ${error.message}`);
    return NextResponse.json(
      { error: `Internal file indexing error: ${error.message}` },
      { status: 500 }
    );
  }
}
