"use client";

import { useState, useRef, useEffect } from "react";
import {
  CheckCircle,
  LoaderCircle,
  Globe,
  Database,
  FileText,
  Clock,
  TerminalSquare,
  XCircle,
  ChevronDown,
  Send,
  StopCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Cpu,
  UploadCloud,
  FileUp,
  FileCode,
  FileSpreadsheet,
  Trash2,
  BookOpen
} from "lucide-react";
import { MAX_PAGES, DEFAULT_MAX_PAGES, GITHUB_REPO_URL } from "@/lib/constants";

interface ChatSource {
  title: string;
  url: string;
  sourceType?: "website" | "file";
  sourceName?: string;
  fileName?: string;
  fileType?: string;
  pageNumber?: number;
  chunkNumber: number;
  totalChunks: number;
  distance?: number;
}

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  timestamp: Date;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

interface StructuredLog {
  id: string;
  timestamp: string;
  type: "success" | "info" | "warning" | "error" | "system";
  title: string;
  detail?: string;
}

interface IndexingSummaryMeta {
  url: string;
  sourceType?: "website" | "file";
  fileName?: string;
  maxPages: number;
  pagesVisited: number;
  pagesIndexed: number;
  pagesCleaned: number;
  chunksCreated: number;
  embeddingBatches: number;
  chunksStored: number;
  durationMs: number;
}

interface RateLimitWaitState {
  isWaiting: boolean;
  retry: number;
  maxRetries: number;
  waitSeconds: number;
  remainingSec: number;
}

export default function Home() {
  // Knowledge Source Selection
  const [activeSourceType, setActiveSourceType] = useState<"website" | "file">("website");

  // Website Indexing State
  const [indexingUrl, setIndexingUrl] = useState("");
  const [maxPages, setMaxPages] = useState<number>(DEFAULT_MAX_PAGES);

  // Document Indexing State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline Status & Execution State
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
  const [indexingLogs, setIndexingLogs] = useState<StructuredLog[]>([]);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingSuccess, setIndexingSuccess] = useState<boolean | null>(null);
  const [indexingCancelled, setIndexingCancelled] = useState(false);
  const [rateLimitWaitState, setRateLimitWaitState] = useState<RateLimitWaitState | null>(null);

  // Dynamic Telemetry Metrics
  const [processedUnitsCount, setProcessedUnitsCount] = useState<number>(0);
  const [chunksCreatedCount, setChunksCreatedCount] = useState<number>(0);
  const [embeddingBatchCurrent, setEmbeddingBatchCurrent] = useState<number>(0);
  const [embeddingBatchTotal, setEmbeddingBatchTotal] = useState<number>(0);
  const [storedDocumentsCount, setStoredDocumentsCount] = useState<number>(0);
  const [summaryMeta, setSummaryMeta] = useState<IndexingSummaryMeta | null>(null);

  // Collapsible Logs Toggle
  const [isLogsExpanded, setIsLogsExpanded] = useState(true);

  // Timer & Abort Controller
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [hasSuccessfullyIndexed, setHasSuccessfullyIndexed] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);

  // Auto-focus chat input after indexing completes or after AI finishes responding
  useEffect(() => {
    if (hasSuccessfullyIndexed && !isIndexing && !isChatting) {
      const timer = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [hasSuccessfullyIndexed, isIndexing, isChatting]);

  const addToast = (message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getCurrentTimeString = () => {
    const d = new Date();
    return d.toTimeString().split(" ")[0];
  };

  // Timer effect during indexing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isIndexing) {
      interval = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isIndexing]);

  // Auto-scroll chat window
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll terminal log window
  const scrollLogsToBottom = () => {
    if (logsContainerRef.current && !isUserScrolledUpRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  };

  const handleLogsScroll = () => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight > 35) {
      isUserScrolledUpRef.current = true;
    } else {
      isUserScrolledUpRef.current = false;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isChatting]);

  useEffect(() => {
    scrollLogsToBottom();
  }, [indexingLogs]);

  const isRateLimitError = (msg: string | null) => {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return (
      lower.includes("429") ||
      lower.includes("rate limit") ||
      lower.includes("quota") ||
      lower.includes("resource_exhausted") ||
      lower.includes("too many requests")
    );
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const extractDomainOrName = (val: string) => {
    try {
      if (val.startsWith("http")) {
        const parsed = new URL(val);
        return parsed.hostname;
      }
      return val;
    } catch {
      return val;
    }
  };

  const appendStructuredLog = (
    type: StructuredLog["type"],
    title: string,
    detail?: string
  ) => {
    setIndexingLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: getCurrentTimeString(),
        type,
        title,
        detail,
      },
    ]);
  };

  // Parse backend progress events
  const processBackendProgressEvent = (message: string, stage?: string, details?: any) => {
    let logType: StructuredLog["type"] = "info";
    let title = message;
    let detail: string | undefined = undefined;

    if (message.includes("\n")) {
      const parts = message.split("\n");
      title = parts[0];
      detail = parts.slice(1).join("\n");
    }

    if (details) {
      if (details.crawledPages !== undefined) {
        setProcessedUnitsCount(details.crawledPages);
      } else if (details.fileIndex !== undefined) {
        setProcessedUnitsCount(details.fileIndex);
      }
      if (details.totalChunks !== undefined) {
        setChunksCreatedCount(details.totalChunks);
      }
      if (details.batch !== undefined && details.totalBatches !== undefined) {
        setEmbeddingBatchCurrent(details.batch);
        setEmbeddingBatchTotal(details.totalBatches);
      }
      if (details.storedChunks !== undefined) {
        setStoredDocumentsCount(details.storedChunks);
      }
    }

    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("complete") || lowerMsg.includes("success") || lowerMsg.includes("stored")) {
      logType = "success";
    } else if (lowerMsg.includes("rate limit") || lowerMsg.includes("waiting") || lowerMsg.includes("cancelled")) {
      logType = "warning";
    } else if (lowerMsg.includes("error") || lowerMsg.includes("failed")) {
      logType = "error";
    } else if (lowerMsg.includes("crawl") || lowerMsg.includes("starting") || lowerMsg.includes("extracting")) {
      logType = "system";
    }

    appendStructuredLog(logType, title, detail);
  };

  // Drag & drop file handlers
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isIndexing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles(filesArray);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
    }
  };

  const removeFile = (index: number) => {
    if (isIndexing) return;
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Get file type icon
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="w-4 h-4 text-red-500" />;
    if (ext === "docx") return <BookOpen className="w-4 h-4 text-blue-500" />;
    if (ext === "md" || ext === "markdown") return <FileCode className="w-4 h-4 text-emerald-500" />;
    return <FileSpreadsheet className="w-4 h-4 text-zinc-500" />;
  };

  // Handle Index Submit (Website or File)
  const handleIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isIndexing) return;

    if (activeSourceType === "website" && !indexingUrl.trim()) return;
    if (activeSourceType === "file" && selectedFiles.length === 0) return;

    const validPages = Math.min(Math.max(1, Number(maxPages) || DEFAULT_MAX_PAGES), MAX_PAGES);
    setMaxPages(validPages);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsIndexing(true);
    setIndexingCancelled(false);
    setElapsedSeconds(0);
    setIndexingStatus("Initializing ingestion pipeline...");
    setIndexingLogs([]);
    setIndexingError(null);
    setIndexingSuccess(null);
    setSummaryMeta(null);
    setRateLimitWaitState(null);

    setProcessedUnitsCount(0);
    setChunksCreatedCount(0);
    setEmbeddingBatchCurrent(0);
    setEmbeddingBatchTotal(0);
    setStoredDocumentsCount(0);
    isUserScrolledUpRef.current = false;

    addToast(`Indexing ${activeSourceType === "website" ? "website" : "document"} started`, "info");
    appendStructuredLog(
      "system",
      `Starting ${activeSourceType === "website" ? "website crawling" : "document parsing"} & indexing pipeline...`
    );

    try {
      let res: Response;

      if (activeSourceType === "website") {
        res = await fetch("/api/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: indexingUrl.trim(),
            maxPages: validPages,
          }),
          signal: controller.signal,
        });
      } else {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append("file", file));

        res = await fetch("/api/index/file", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start indexing session.");
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Readable streams are not supported by the client browser.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              const action = parsed.details?.action;

              if (parsed.type === "rate_limit" || action === "rate_limit" || action === "rate_limit_tick") {
                const d = parsed.details || {};
                setRateLimitWaitState({
                  isWaiting: true,
                  retry: d.retry || 1,
                  maxRetries: d.maxRetries || 5,
                  waitSeconds: d.waitSeconds || 60,
                  remainingSec: d.remainingSec ?? 60,
                });
                if (action === "rate_limit") {
                  appendStructuredLog(
                    "warning",
                    `⚠ Rate limit reached. Waiting ${d.waitSeconds} seconds before retry ${d.retry}/${d.maxRetries}...`
                  );
                }
              } else if (action === "rate_limit_success") {
                setRateLimitWaitState(null);
                appendStructuredLog("success", "✓ Retry successful. Continuing indexing...");
              } else if (parsed.type === "progress") {
                if (parsed.stage === "store" || parsed.stage === "complete") {
                  setRateLimitWaitState(null);
                }
                setIndexingStatus(parsed.message.split("\n")[0]);
                processBackendProgressEvent(parsed.message, parsed.stage, parsed.details);
              } else if (parsed.type === "complete") {
                setRateLimitWaitState(null);
                setIndexingSuccess(true);
                setHasSuccessfullyIndexed(true);
                setIndexingStatus("Indexing completed successfully!");

                if (parsed.meta) {
                  setSummaryMeta(parsed.meta);
                  setProcessedUnitsCount(parsed.meta.pagesVisited || parsed.meta.pagesIndexed || 1);
                  setChunksCreatedCount(parsed.meta.chunksCreated || 0);
                  setEmbeddingBatchTotal(parsed.meta.embeddingBatches || 1);
                  setEmbeddingBatchCurrent(parsed.meta.embeddingBatches || 1);
                  setStoredDocumentsCount(parsed.meta.chunksStored || 0);
                }

                appendStructuredLog("success", "Indexing completed successfully");
                addToast("Indexing completed successfully!", "success");
              } else if (parsed.type === "error") {
                setRateLimitWaitState(null);
                throw new Error(parsed.error);
              }
            } catch (err: any) {
              if (err.name === "AbortError") throw err;
              console.error("Stream parse exception:", line, err);
              if (err.message) throw err;
            }
          }
        }
      }
    } catch (err: any) {
      setRateLimitWaitState(null);
      if (err.name === "AbortError" || controller.signal.aborted) {
        setIndexingCancelled(true);
        setIndexingStatus("Indexing run was cancelled by user.");
        appendStructuredLog("warning", "Indexing cancelled by user");
        addToast("Indexing cancelled", "warning");
      } else {
        setIndexingError(err.message || "An unexpected error occurred during indexing.");
        appendStructuredLog("error", `Indexing error: ${err.message || "Unexpected failure"}`);
        setIndexingSuccess(false);
        addToast("Indexing failed", "error");
      }
    } finally {
      setIsIndexing(false);
      setRateLimitWaitState(null);
      abortControllerRef.current = null;
    }
  };

  // Handle Stop Indexing
  const handleStopIndexing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsIndexing(false);
    setIndexingCancelled(true);
    setIndexingStatus("Indexing run was cancelled by user.");
    appendStructuredLog("warning", "Indexing cancelled by user");
    addToast("Indexing cancelled", "warning");
  };

  // Handle Chat message submit
  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting || isIndexing || !hasSuccessfullyIndexed) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      sender: "user",
      text: chatInput.trim(),
      timestamp: new Date(),
    };

    setChatHistory((prev) => [...prev, userMessage]);
    const promptMessage = chatInput.trim();
    setChatInput("");
    setIsChatting(true);
    setChatError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate AI response.");
      }

      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        sender: "assistant",
        text: data.answer,
        sources: data.sources,
        timestamp: new Date(),
      };

      setChatHistory((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setChatError(err.message || "Failed to process chat query.");
      addToast(err.message || "Failed to generate answer", "error");
    } finally {
      setIsChatting(false);
    }
  };

  const handlePresetQuery = (query: string) => {
    setChatInput(query);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 0);
  };

  const progressPercent =
    summaryMeta?.maxPages && summaryMeta.maxPages > 0
      ? Math.min(100, Math.round((processedUnitsCount / summaryMeta.maxPages) * 100))
      : activeSourceType === "website"
      ? Math.min(100, Math.round((processedUnitsCount / (maxPages || 1)) * 100))
      : selectedFiles.length > 0
      ? Math.min(100, Math.round((processedUnitsCount / selectedFiles.length) * 100))
      : 100;

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Global Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg shadow-lg border text-xs font-semibold animate-in slide-in-from-top-2 duration-200 min-w-[240px] max-w-sm ${
              toast.type === "success"
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-800"
                : toast.type === "error"
                ? "bg-red-950/90 text-red-200 border-red-800"
                : toast.type === "warning"
                ? "bg-amber-950/90 text-amber-200 border-amber-800"
                : "bg-zinc-900/90 text-zinc-100 border-zinc-700"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
              {toast.type === "error" && <XCircle className="w-4 h-4 text-red-400" />}
              {toast.type === "warning" && <Sparkles className="w-4 h-4 text-amber-400" />}
              {toast.type === "info" && <Sparkles className="w-4 h-4 text-indigo-400" />}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-3.5 flex-shrink-0">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                RAG Knowledge Assistant
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  v2.0
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-900/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Backend Active
            </span>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800 hover:border-zinc-600 text-xs font-medium text-zinc-200 transition-all shadow-xs group"
            >
              <GithubIcon className="w-4 h-4 text-zinc-300 group-hover:text-white transition-colors" />
              <span>View Source</span>
              <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Grid Dashboard */}
      <main className="mx-auto max-w-7xl w-full flex-1 overflow-hidden h-[calc(100vh-65px)] p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full">
          {/* Indexing Section (Left Dashboard Panel) */}
          <section className="md:col-span-1 h-full overflow-y-auto pr-1 flex flex-col gap-6">
            {/* Knowledge Source Selection & Input Card */}
            <div className="border border-zinc-200 rounded-xl bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-3 dark:border-zinc-800">
                <h2 className="text-sm font-bold tracking-wide uppercase text-zinc-500 dark:text-zinc-400">
                  Knowledge Ingestion
                </h2>
                {isIndexing && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                    <Clock className="w-3 h-3 animate-spin" />
                    {formatTimer(elapsedSeconds)}
                  </span>
                )}
              </div>

              {/* Source Switch Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => !isIndexing && setActiveSourceType("website")}
                  disabled={isIndexing}
                  className={`cursor-pointer flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold transition-all ${
                    activeSourceType === "website"
                      ? "bg-white text-indigo-600 shadow-xs dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Website URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => !isIndexing && setActiveSourceType("file")}
                  disabled={isIndexing}
                  className={`cursor-pointer flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold transition-all ${
                    activeSourceType === "file"
                      ? "bg-white text-indigo-600 shadow-xs dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Documents</span>
                </button>
              </div>

              <form onSubmit={handleIndex} className="flex flex-col gap-4">
                {/* Website Source Input */}
                {activeSourceType === "website" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="url" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Target Website URL
                      </label>
                      <input
                        id="url"
                        type="url"
                        required
                        placeholder="https://example.com/docs"
                        value={indexingUrl}
                        onChange={(e) => setIndexingUrl(e.target.value)}
                        disabled={isIndexing}
                        className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900/80 transition-colors"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label htmlFor="maxPages" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Page Limit
                        </label>
                        <span className="text-[11px] text-zinc-400 font-mono">1 to 15 max</span>
                      </div>
                      <input
                        id="maxPages"
                        type="number"
                        min={1}
                        max={15}
                        value={maxPages}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (isNaN(val)) {
                            setMaxPages(1);
                          } else {
                            setMaxPages(Math.min(Math.max(1, val), 15));
                          }
                        }}
                        onBlur={() => {
                          setMaxPages((prev) => Math.min(Math.max(1, prev || DEFAULT_MAX_PAGES), MAX_PAGES));
                        }}
                        disabled={isIndexing}
                        className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900/80 transition-colors font-mono"
                      />
                    </div>
                  </>
                )}

                {/* Document Source Input */}
                {activeSourceType === "file" && (
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex justify-between items-center">
                      <span>Upload Documents</span>
                      <span className="text-[11px] text-zinc-400">PDF, DOCX, MD, TXT</span>
                    </label>

                    {/* Drag & Drop Zone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => !isIndexing && fileInputRef.current?.click()}
                      className={`cursor-pointer border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-all ${
                        isDragOver
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
                          : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/40"
                      } ${isIndexing ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.md,.markdown,.txt,.log,.csv"
                        onChange={handleFileInputChange}
                        disabled={isIndexing}
                        className="hidden"
                      />
                      <div className="h-9 w-9 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Click to browse or drag & drop
                        </span>
                        <span className="text-[11px] text-zinc-400">Max file size 25MB</span>
                      </div>
                    </div>

                    {/* Selected File Badges */}
                    {selectedFiles.length > 0 && (
                      <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {getFileIcon(file.name)}
                              <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                ({(file.size / 1024).toFixed(0)} KB)
                              </span>
                            </div>
                            {!isIndexing && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(idx);
                                }}
                                className="cursor-pointer text-zinc-400 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Index / Stop Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={
                      isIndexing ||
                      (activeSourceType === "website" && !indexingUrl.trim()) ||
                      (activeSourceType === "file" && selectedFiles.length === 0)
                    }
                    className="flex-1 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-xs flex items-center justify-center gap-2"
                  >
                    {isIndexing ? (
                      <>
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                        <span>Indexing...</span>
                      </>
                    ) : hasSuccessfullyIndexed ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Re-index {activeSourceType === "website" ? "Website" : "Document"}</span>
                      </>
                    ) : (
                      <>
                        {activeSourceType === "website" ? <Globe className="w-4 h-4" /> : <FileUp className="w-4 h-4" />}
                        <span>Index {activeSourceType === "website" ? "Website" : "Document"}</span>
                      </>
                    )}
                  </button>

                  {isIndexing && (
                    <button
                      type="button"
                      onClick={handleStopIndexing}
                      className="cursor-pointer rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 shadow-xs flex items-center gap-1.5 animate-in fade-in"
                    >
                      <StopCircle className="w-4 h-4 fill-current" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Rate Limit Waiting Card */}
            {rateLimitWaitState && rateLimitWaitState.isWaiting && (
              <div className="border border-amber-300 rounded-xl bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/40 shadow-xs flex flex-col gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin flex-shrink-0" />
                  <div className="flex flex-col">
                    <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Gemini API Rate Limit Reached
                    </h3>
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      Automatic retry attempt {rateLimitWaitState.retry} of {rateLimitWaitState.maxRetries}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-800 dark:text-amber-300 pt-1">
                  <span>Retrying in:</span>
                  <span className="text-sm px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700">
                    {rateLimitWaitState.remainingSec}s
                  </span>
                </div>
              </div>
            )}

            {/* Error Card */}
            {indexingError && !isIndexing && !rateLimitWaitState?.isWaiting && (
              <div className="border border-red-200 rounded-xl bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30 shadow-xs flex flex-col gap-3">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-xs">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Indexing Operation Failed</span>
                </div>
                <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed font-mono break-words">
                  {indexingError}
                </p>
              </div>
            )}

            {/* Live Telemetry Status Card */}
            {(isIndexing || indexingCancelled || (indexingError && !summaryMeta)) && (
              <div className="border border-zinc-200 rounded-xl bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs flex flex-col gap-4 transition-all animate-in fade-in">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-2.5 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Knowledge Source Status</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                      isIndexing
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                        : indexingCancelled
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                    }`}
                  >
                    {isIndexing ? "In Progress" : indexingCancelled ? "Cancelled" : "Failed"}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      {activeSourceType === "website" ? <Globe className="w-3.5 h-3.5 text-indigo-500" /> : <FileText className="w-3.5 h-3.5 text-indigo-500" />}
                      {activeSourceType === "website" ? "Pages Crawled" : "Files / Pages Extracted"}
                    </span>
                    <span className="font-mono font-semibold">
                      {processedUnitsCount} / {activeSourceType === "website" ? maxPages : selectedFiles.length || 1}
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Live Metrics Grid */}
                <div className="grid grid-cols-1 gap-2.5 text-xs pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" />
                      Chunks Created
                    </span>
                    <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      {chunksCreatedCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-sky-500" />
                      Embedding Batches
                    </span>
                    <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      {embeddingBatchCurrent} / {embeddingBatchTotal || 1}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-violet-500" />
                      Stored Vectors
                    </span>
                    <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      {storedDocumentsCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Duration
                    </span>
                    <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      {elapsedSeconds}s
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Success Summary Dashboard Card */}
            {indexingSuccess === true && summaryMeta && !isIndexing && (
              <div className="border border-emerald-200 rounded-xl bg-emerald-50/50 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20 shadow-xs flex flex-col gap-4 animate-in fade-in">
                <div className="flex items-center gap-2 border-b border-emerald-200/60 pb-3 dark:border-emerald-900/50">
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Knowledge Base Ready
                  </h3>
                </div>

                {/* Target Source Badge */}
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-white/60 dark:bg-zinc-900/60 px-3 py-2 rounded-lg border border-emerald-200/50 dark:border-emerald-900/40">
                  {summaryMeta.sourceType === "file" ? (
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="truncate">{extractDomainOrName(summaryMeta.url)}</span>
                </div>

                {/* Metrics Summary Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 flex flex-col">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                      {summaryMeta.sourceType === "file" ? "Sections Indexed" : "Pages Indexed"}
                    </span>
                    <span className="text-base font-bold font-mono text-zinc-800 dark:text-zinc-100">
                      {summaryMeta.pagesIndexed}
                    </span>
                  </div>
                  <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 flex flex-col">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Chunks Created</span>
                    <span className="text-base font-bold font-mono text-zinc-800 dark:text-zinc-100">
                      {summaryMeta.chunksCreated}
                    </span>
                  </div>
                  <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 flex flex-col">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Embedding Batches</span>
                    <span className="text-base font-bold font-mono text-zinc-800 dark:text-zinc-100">
                      {summaryMeta.embeddingBatches}
                    </span>
                  </div>
                  <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 flex flex-col">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Vectors Stored</span>
                    <span className="text-base font-bold font-mono text-zinc-800 dark:text-zinc-100">
                      {summaryMeta.chunksStored}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-emerald-800 dark:text-emerald-300 pt-2 border-t border-emerald-200/50 dark:border-emerald-900/40 font-mono">
                  <span>Time Taken</span>
                  <span className="font-bold">{(summaryMeta.durationMs / 1000).toFixed(1)}s</span>
                </div>
              </div>
            )}

            {/* Collapsible Developer Logs Terminal */}
            <div className="border border-zinc-800 rounded-xl bg-zinc-900 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                className="w-full px-5 py-3.5 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center text-xs text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-900/60 text-indigo-400">
                    <TerminalSquare className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-xs text-zinc-100 flex items-center gap-2">
                      Developer Logs
                      {indexingLogs.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                          {indexingLogs.length}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-normal">
                      Live pipeline execution stream
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-400 transform transition-transform duration-200 ${
                    isLogsExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isLogsExpanded && (
                <div className="bg-zinc-950 border-t border-zinc-800 font-mono text-[11px] leading-relaxed text-zinc-300 transition-all">
                  <div className="px-4 py-2 border-b border-zinc-850 flex justify-between items-center text-[10px] text-zinc-500">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500/80 inline-block"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                    </div>
                    <span>indexing.stream.log</span>
                  </div>

                  <div
                    ref={logsContainerRef}
                    onScroll={handleLogsScroll}
                    className="p-4 flex flex-col gap-2 max-h-56 overflow-y-auto select-text scroll-smooth"
                  >
                    {indexingLogs.length === 0 ? (
                      <div className="text-zinc-600 italic">No pipeline logs yet. Start indexing to view activity.</div>
                    ) : (
                      indexingLogs.map((log) => (
                        <div key={log.id} className="flex flex-col gap-0.5">
                          <div className="flex items-start gap-2">
                            <span className="text-zinc-600 text-[10px] select-none font-mono">
                              [{log.timestamp}]
                            </span>
                            <span
                              className={`flex-1 break-words ${
                                log.type === "success"
                                  ? "text-emerald-400 font-medium"
                                  : log.type === "error"
                                  ? "text-red-400 font-medium"
                                  : log.type === "warning"
                                  ? "text-amber-400 font-medium"
                                  : log.type === "system"
                                  ? "text-indigo-400 font-semibold"
                                  : "text-zinc-300"
                              }`}
                            >
                              {log.title}
                            </span>
                          </div>
                          {log.detail && (
                            <div className="ml-16 text-[10px] text-zinc-500 font-mono break-all whitespace-pre-wrap">
                              {log.detail}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Chat Panel Section (Right 2-Columns) */}
          <section className="md:col-span-2 h-full flex flex-col border border-zinc-200 rounded-xl bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-xs overflow-hidden">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  Documentation Assistant
                </h2>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {hasSuccessfullyIndexed ? "Knowledge Grounded" : "Waiting for Indexing"}
              </span>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {!hasSuccessfullyIndexed && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    No Knowledge Base Indexed
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                    Enter a website URL or upload project documents (PDF, DOCX, Markdown, TXT) on the left panel to begin.
                  </p>
                </div>
              )}

              {hasSuccessfullyIndexed && chatHistory.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    Knowledge Base Ready
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-4">
                    Ask questions grounded strictly in the indexed documentation.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-md">
                    {[
                      "What is this documentation about?",
                      "Summarize key features and architecture",
                      "What are the main components?",
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePresetQuery(prompt)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Message List */}
              {chatHistory.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col max-w-[80%] ${
                    message.sender === "user" ? "self-end items-end" : "self-start items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      message.sender === "user"
                        ? "bg-indigo-600 text-white rounded-br-none dark:bg-indigo-500"
                        : "bg-zinc-100 text-zinc-800 rounded-bl-none dark:bg-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {message.text}
                  </div>

                  {/* Adaptive Citations Block */}
                  {message.sender === "assistant" && message.sources && message.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider self-center mr-1">
                        Citations:
                      </span>
                      {message.sources.map((source, idx) => {
                        const isWeb = source.sourceType === "website" || source.url.startsWith("http");
                        const label = source.fileName
                          ? source.pageNumber
                            ? `${source.fileName} (p. ${source.pageNumber})`
                            : source.fileName
                          : source.title || "Source";

                        return isWeb ? (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 border border-zinc-300 px-2 py-0.5 text-xs text-indigo-600 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:border-zinc-700 dark:text-indigo-400 dark:hover:bg-zinc-700"
                          >
                            <Globe className="w-3 h-3 text-indigo-500" />
                            <span>[{source.chunkNumber ?? idx + 1}]</span>
                            <span className="max-w-[140px] truncate">{label}</span>
                          </a>
                        ) : (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
                          >
                            <FileText className="w-3 h-3 text-emerald-500" />
                            <span>[{source.chunkNumber ?? idx + 1}]</span>
                            <span className="max-w-[160px] truncate">{label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {isChatting && (
                <div className="self-start flex flex-col items-start gap-1 w-full max-w-[60%]">
                  <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-none px-4 py-3 w-full flex flex-col gap-2 animate-pulse">
                    <div className="h-3 bg-zinc-300 dark:bg-zinc-700 rounded w-3/4"></div>
                    <div className="h-3 bg-zinc-300 dark:bg-zinc-700 rounded w-1/2"></div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Panel */}
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <form onSubmit={handleChat} className="flex gap-3">
                <input
                  ref={chatInputRef}
                  type="text"
                  placeholder={
                    isIndexing
                      ? "Please wait until indexing is complete..."
                      : !hasSuccessfullyIndexed
                      ? "Index a website or documents before asking questions."
                      : "Type your query about the documentation..."
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={!hasSuccessfullyIndexed || isIndexing || isChatting}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900/80 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!hasSuccessfullyIndexed || isIndexing || isChatting || !chatInput.trim()}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-xs flex items-center gap-1.5"
                >
                  {isChatting ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Ask</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ActivityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}
