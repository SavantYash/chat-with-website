"use client";

import { useState, useRef, useEffect } from "react";

interface ChatSource {
  title: string;
  url: string;
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

export default function Home() {
  // Indexing State
  const [indexingUrl, setIndexingUrl] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingSuccess, setIndexingSuccess] = useState<boolean | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat window to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isChatting]);

  // Handle Crawl & Index Submit
  const handleIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indexingUrl.trim() || isIndexing) return;

    setIsIndexing(true);
    setIndexingStatus("Submitting crawl request to crawler engine...");
    setIndexingError(null);
    setIndexingSuccess(null);

    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: indexingUrl.trim(),
          maxPages: Number(maxPages) || 10,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Crawl job failed on database ingestion.");
      }

      setIndexingStatus(data.message || "Indexing pipeline executed successfully!");
      setIndexingSuccess(true);
    } catch (err: any) {
      setIndexingError(err.message || "An unexpected error occurred during indexing.");
      setIndexingSuccess(false);
    } finally {
      setIsIndexing(false);
    }
  };

  // Handle Chat message submit
  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting || isIndexing) return;

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
        throw new Error(data.error || "Failed to retrieve grounded answer.");
      }

      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        sender: "assistant",
        text: data.answer,
        sources: data.sources || [],
        timestamp: new Date(),
      };

      setChatHistory((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setChatError(err.message || "Failed to reach LLM generator service.");
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight bg-clip-text bg-linear-to-r text-indigo-600 dark:text-indigo-400">
              RAG Website Assistant
            </span>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            Backend Status: Active
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-8 md:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 h-full">
          {/* Indexing Section (Left Column) */}
          <section className="md:col-span-1 flex flex-col gap-6">
            <div className="border border-zinc-200 rounded-xl bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                Website Indexing
              </h2>
              <form onSubmit={handleIndex} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="url" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Target Website URL
                  </label>
                  <input
                    id="url"
                    type="url"
                    required
                    placeholder="https://example.com"
                    value={indexingUrl}
                    onChange={(e) => setIndexingUrl(e.target.value)}
                    disabled={isIndexing}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="maxPages" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Max Pages Limit
                  </label>
                  <input
                    id="maxPages"
                    type="number"
                    min={1}
                    max={100}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Math.max(1, Number(e.target.value)))}
                    disabled={isIndexing}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isIndexing || !indexingUrl.trim()}
                  className="w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-zinc-400 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  {isIndexing ? "Indexing..." : "Index Website"}
                </button>
              </form>

              {/* Indexing Feedback Messages */}
              {indexingStatus && (
                <div className="mt-4 p-3 rounded-lg bg-indigo-50 text-indigo-700 text-xs border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></span>
                    <span>{indexingStatus}</span>
                  </div>
                </div>
              )}

              {indexingSuccess === true && !isIndexing && (
                <div className="mt-4 p-3 rounded-lg bg-green-50 text-green-700 text-xs border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50">
                  ✅ Crawl & indexing pipeline executed successfully. Context ready.
                </div>
              )}

              {indexingError && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                  ❌ Indexing Error: {indexingError}
                </div>
              )}
            </div>
          </section>

          {/* Chat Section (Right Column) */}
          <section className="md:col-span-2 flex flex-col h-[700px] border border-zinc-200 rounded-xl bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200">
              Query Assistant
            </h2>

            {/* Chat History scroll panel */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {chatHistory.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-sm">
                  <span>Enter a query to retrieve information from indexed sources.</span>
                </div>
              ) : (
                chatHistory.map((message) => (
                  <div
                    key={message.id}
                    className={`flex flex-col max-w-[80%] ${
                      message.sender === "user" ? "self-end items-end" : "self-start items-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm ${
                        message.sender === "user"
                          ? "bg-indigo-600 text-white rounded-br-none dark:bg-indigo-500"
                          : "bg-zinc-100 text-zinc-800 rounded-bl-none dark:bg-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {message.text}
                    </div>

                    {/* Citations block for assistant response */}
                    {message.sender === "assistant" && message.sources && message.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider self-center mr-1">
                          Citations:
                        </span>
                        {message.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 border border-zinc-300 px-2 py-0.5 text-xs text-indigo-600 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:border-zinc-700 dark:text-indigo-400 dark:hover:bg-zinc-700"
                          >
                            <span>[{source.chunkNumber ?? idx + 1}]</span>
                            <span className="max-w-[120px] truncate">{source.title || "Source"}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Processing response spinner */}
              {isChatting && (
                <div className="self-start flex flex-col items-start gap-1">
                  <div className="bg-zinc-100 rounded-2xl rounded-bl-none px-4 py-2.5 dark:bg-zinc-800">
                    <div className="flex gap-1.5 items-center py-1">
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce"></span>
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input panel */}
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <form onSubmit={handleChat} className="flex gap-3">
                <input
                  type="text"
                  placeholder={
                    isIndexing
                      ? "Chat disabled during crawl index..."
                      : "Type your query here..."
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatting || isIndexing}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-hidden disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-400 dark:disabled:bg-zinc-900"
                />
                <button
                  type="submit"
                  disabled={isChatting || isIndexing || !chatInput.trim()}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-zinc-400 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  Ask
                </button>
              </form>

              {chatError && (
                <div className="mt-2 text-red-500 text-xs">
                  ⚠️ Error: {chatError}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

