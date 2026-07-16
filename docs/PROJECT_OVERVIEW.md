# Project Overview

## Goal

`chat-with-website` is a retrieval-augmented generation (RAG) application that allows users to crawl a target website, index its semantic content into a vector database, and then ask natural language questions grounded in the website content.

## Problem Solved

The project solves the problem of generating accurate, source-backed answers from an arbitrary website by:

- crawling and extracting website content,
- cleaning and chunking the extracted content,
- generating semantic embeddings,
- storing those embeddings in a vector store,
- retrieving relevant chunks for a user query,
- and using a large language model to answer based on the retrieved content.

## Features

- Website crawler with domain restriction and `robots.txt` compliance
- HTML extraction with Readability and Cheerio
- Semantic chunking with overlapping context windows
- Gemini embedding provider for dense vectors
- LanceDB vector store for local similarity search
- Grounded chat interface with source citations
- Streamed indexing progress via SSE `/api/index`
- Client UI for indexing and chat
- Dependency injection through a factory composition root

## Major Modules

- `src/app/` – Next.js application routes and UI components
- `src/lib/crawler/` – Website crawling, URL normalization, HTML parsing, and robots checks
- `src/lib/rag/` – HTML extraction, content chunking, and indexing orchestration
- `src/lib/llm/` – Gemini-based embedding and chat providers with retry strategies
- `src/lib/db/` – Vector store abstraction and LanceDB implementation
- `src/lib/chat/` – Retrieval, prompt building, and chat orchestration
- `src/types/` – Shared domain interfaces, contracts, and models

## Technology Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Google Gemini via `@google/genai`
- LanceDB for vector storage
- Mozilla Readability, jsdom, Cheerio, robots-parser
- UUID for chunk IDs
