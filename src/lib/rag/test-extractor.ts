import { HtmlExtractor } from "./html-extractor";
import { WebPage } from "../../types";

/**
 * Standalone test runner to verify the HtmlExtractor extraction quality.
 * Run using: npx tsx src/lib/rag/test-extractor.ts
 */
async function fetchPage(url: string): Promise<WebPage> {
  console.log(`[Test] HTTP Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (RAG HTML Extractor Validation Test)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP fetch failed for ${url} with status ${response.status}`);
  }

  const html = await response.text();
  
  // Extract a quick fallback title from raw HTML regex
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = match ? match[1].trim() : "Raw Scraped Page";

  return {
    url,
    title,
    html,
  };
}

async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running HTML Extractor Integration Test");
  console.log("=========================================");

  const extractor = new HtmlExtractor({ minChars: 100 });

  const testUrls = [
    "https://example.com",
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  ];

  for (const url of testUrls) {
    try {
      console.log(`\n-----------------------------------------`);
      console.log(`🔍 Processing URL: ${url}`);
      
      const rawPage = await fetchPage(url);
      
      console.log(`[Test] Extracting main article body structure...`);
      const startTime = Date.now();
      const processedPage = await extractor.extract(rawPage);
      const duration = Date.now() - startTime;

      if (processedPage === null) {
        console.log(`⚠️ Page was skipped (content character count under threshold).`);
        continue;
      }

      console.log(`✅ Cleaned successfully in ${duration}ms.`);
      console.log(`  - Title:   "${processedPage.title}"`);
      console.log(`  - URL:     ${processedPage.url}`);
      console.log(`  - Length:  ${processedPage.content.length} characters`);

      console.log(`\n--- Extracted Content Preview (First 500 chars) ---`);
      console.log(processedPage.content.slice(0, 500));
      console.log(`---------------------------------------------------\n`);

      // Run structural assertion validation checks on MDN pages
      if (url.includes("mozilla.org")) {
        console.log("📊 Markdown Structural Checks:");
        
        const hasHeadings = processedPage.content.includes("# ") || processedPage.content.includes("## ");
        console.log(`  - Contains Headings (# / ##)?        ${hasHeadings ? "✅ Yes (Pass)" : "❌ No (Fail)"}`);

        const hasLists = processedPage.content.includes("* ") || processedPage.content.includes("\n*");
        console.log(`  - Contains Bullet Point Lists (*)?   ${hasLists ? "✅ Yes (Pass)" : "❌ No (Fail)"}`);

        const hasCodeBlocks = processedPage.content.includes("```");
        console.log(`  - Contains Markdown Code Blocks?     ${hasCodeBlocks ? "✅ Yes (Pass)" : "❌ No (Fail)"}`);

        // Simple validation warning if navigation is still present
        const hasNavLinks = processedPage.content.includes("Skip to main content") || processedPage.content.includes("Search MDN");
        console.log(`  - Boilerplate Stripped (Clean)?      ${!hasNavLinks ? "✅ Yes (Pass)" : "⚠️ No (Warnings)"}`);
      }
    } catch (error) {
      console.error(`❌ Integration test failed for ${url} with error:`, error);
    }
  }

  console.log(`\n=========================================`);
  console.log("🏁 HTML Extractor Integration Test Finished");
  console.log("=========================================");
}

runTest();
