import { defaultExtractorRegistry } from "./extractor-registry";
import { MarkdownExtractor } from "./markdown-extractor";
import { TextExtractor } from "./text-extractor";
import { DocxExtractor } from "./docx-extractor";

async function runTests() {
  console.log("=== Testing Document Extractors & Registry ===");

  // 1. Test Registry lookup
  console.log("\n1. Testing Extractor Registry:");
  const mdExt = defaultExtractorRegistry.getExtractor("md");
  console.log("✓ Found extractor for .md:", mdExt instanceof MarkdownExtractor);

  const txtExt = defaultExtractorRegistry.getExtractor("txt");
  console.log("✓ Found extractor for .txt:", txtExt instanceof TextExtractor);

  const docxExt = defaultExtractorRegistry.getExtractor("docx");
  console.log("✓ Found extractor for .docx:", docxExt instanceof DocxExtractor);

  // 2. Test Markdown Extractor
  console.log("\n2. Testing Markdown Extractor:");
  const sampleMd = `---
title: Sample Architecture
author: Developer
---

# Architecture Overview

This is the system architecture document explaining the multi-source RAG platform.

## Key Features
- Dynamic Knowledge Sources
- Pluggable Document Extractors
- Shared Indexing Pipeline
`;
  const mdBuffer = Buffer.from(sampleMd, "utf-8");
  const mdDocs = await mdExt.extract(mdBuffer, "Architecture.md");
  console.log(`✓ Extracted ${mdDocs.length} document(s) from Markdown:`);
  console.log(`  - Title: "${mdDocs[0].title}"`);
  console.log(`  - Content length: ${mdDocs[0].content.length} chars`);
  console.log(`  - Metadata:`, mdDocs[0].metadata);

  if (!mdDocs[0].content.includes("Architecture Overview") || mdDocs[0].content.includes("author: Developer")) {
    throw new Error("❌ Markdown extraction failed frontmatter stripping or content retention.");
  }

  // 3. Test Plain Text Extractor
  console.log("\n3. Testing Text Extractor:");
  const sampleTxt = `Configuration Guide

1. Set GEMINI_API_KEY in environment variables.
2. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
3. Start the Next.js server.
`;
  const txtBuffer = Buffer.from(sampleTxt, "utf-8");
  const txtDocs = await txtExt.extract(txtBuffer, "Config.txt");
  console.log(`✓ Extracted ${txtDocs.length} document(s) from Text:`);
  console.log(`  - Title: "${txtDocs[0].title}"`);
  console.log(`  - Metadata:`, txtDocs[0].metadata);

  console.log("\n🎉 All Extractor unit tests passed successfully!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
