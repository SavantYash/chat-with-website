import { NextResponse } from "next/server";
import { createChatService } from "@/lib/chat";

/**
 * POST /api/chat
 * 
 * Handles client chat queries. Resolves all DI dependencies using the factory,
 * validates requests, queries ChatService, and outputs grounding citations.
 * 
 * Request payload JSON format:
 * {
 *   "message": string,            // Required: User question
 *   "topK": number,               // Optional: Number of nearest neighbour chunks (default 3)
 *   "temperature": number,        // Optional: Randomness in generation (0.0 to 2.0)
 *   "maxOutputTokens": number     // Optional: Output length constraint
 * }
 */
export async function POST(request: Request) {
  const requestStartTime = performance.now();
  console.log(`[API /api/chat] Received POST request.`);

  try {
    // 1. JSON parse safety check
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn(`[API /api/chat] ❌ Failed to parse JSON request body.`);
      return NextResponse.json(
        { error: "Invalid JSON format in request body." },
        { status: 400 }
      );
    }

    const { message, topK, temperature, maxOutputTokens } = body as {
      message?: string;
      topK?: number;
      temperature?: number;
      maxOutputTokens?: number;
    };

    // 2. Query validations
    if (!message || typeof message !== "string" || !message.trim()) {
      console.warn(`[API /api/chat] ❌ Validation failed: 'message' is missing or blank.`);
      return NextResponse.json(
        { error: "Missing or invalid required body parameter: 'message'" },
        { status: 400 }
      );
    }

    if (topK !== undefined && (typeof topK !== "number" || topK <= 0)) {
      console.warn(`[API /api/chat] ❌ Validation failed: 'topK' must be a positive number.`);
      return NextResponse.json(
        { error: "Invalid parameter: 'topK' must be a positive number." },
        { status: 400 }
      );
    }

    if (temperature !== undefined && (typeof temperature !== "number" || temperature < 0 || temperature > 2)) {
      console.warn(`[API /api/chat] ❌ Validation failed: 'temperature' must be a number between 0.0 and 2.0.`);
      return NextResponse.json(
        { error: "Invalid parameter: 'temperature' must be a number between 0.0 and 2.0." },
        { status: 400 }
      );
    }

    if (maxOutputTokens !== undefined && (typeof maxOutputTokens !== "number" || maxOutputTokens <= 0)) {
      console.warn(`[API /api/chat] ❌ Validation failed: 'maxOutputTokens' must be a positive number.`);
      return NextResponse.json(
        { error: "Invalid parameter: 'maxOutputTokens' must be a positive number." },
        { status: 400 }
      );
    }

    // 3. Resolve dependencies using the factory
    console.log(`[API /api/chat] Instantiating dependencies via ChatService factory...`);
    const chatService = await createChatService();

    // 4. Dispatch ask query (No prompt content or user messages are logged to maintain privacy)
    console.log(`[API /api/chat] Dispatching question to ChatService...`);
    const chatResponse = await chatService.ask(message, {
      topK,
      temperature,
      maxOutputTokens
    });

    const elapsed = performance.now() - requestStartTime;
    console.log(`[API /api/chat] Completed successfully in ${elapsed.toFixed(1)}ms.`);

    // 5. Render response JSON
    return NextResponse.json(chatResponse);

  } catch (error: any) {
    const elapsed = performance.now() - requestStartTime;
    console.error(`[API /api/chat] ❌ Generation failure after ${elapsed.toFixed(1)}ms: ${error.message}`);
    return NextResponse.json(
      { error: `An unexpected server error occurred: ${error.message}` },
      { status: 500 }
    );
  }
}
