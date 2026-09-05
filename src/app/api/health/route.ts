import { NextResponse } from "next/server";
import { getOrInitVectorStore } from "@/lib/chat/factory";

/**
 * GET /api/health
 * 
 * Lightweight system health check endpoint for Nginx, load balancers, and uptime monitors.
 * Verifies application readiness, database connectivity, and configuration without consuming LLM API quota.
 */
export async function GET() {
  const startTime = performance.now();
  const vectorDbEnv = (process.env.VECTOR_DB || "lancedb").trim().toLowerCase();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

  let dbStatus = "unknown";
  let dbCount = 0;
  let dbError: string | undefined = undefined;

  try {
    const store = await getOrInitVectorStore();
    dbCount = await store.count();
    dbStatus = "ready";
  } catch (error: any) {
    dbStatus = "error";
    dbError = error instanceof Error ? error.message : String(error);
  }

  const isHealthy = dbStatus === "ready" && geminiConfigured;
  const elapsed = performance.now() - startTime;

  const responseBody = {
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Number(elapsed.toFixed(1)),
    database: {
      provider: vectorDbEnv,
      status: dbStatus,
      count: dbCount,
      ...(dbError ? { error: dbError } : {}),
    },
    llm: {
      provider: "gemini",
      configured: geminiConfigured,
    },
  };

  return NextResponse.json(responseBody, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
