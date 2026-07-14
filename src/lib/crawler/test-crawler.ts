import { WebsiteCrawler } from "./crawler";

/**
 * Standalone test runner to verify the modular WebsiteCrawler.
 * Run using: npx tsx src/lib/crawler/test-crawler.ts
 */
async function runTest() {
  console.log("=========================================");
  console.log("🚀 Running WebsiteCrawler Integration Test");
  console.log("=========================================");

  // Set limits to crawl a small subset for verification
  const testCrawler = new WebsiteCrawler({
    maxPages: 3,
    maxDepth: 2,
    requestDelay: 500, // 500ms delay to respect target host rate-limiting
    userAgent: "AntigravityBot/1.0",
  });

  try {
    const targetUrl = "https://example.com";
    
    // Execute crawl
    const pages = await testCrawler.crawl(targetUrl);

    console.log("=========================================");
    console.log(`🔍 Crawl Completed. Total indexed pages: ${pages.length}`);
    console.log("=========================================");

    pages.forEach((page, index) => {
      console.log(`\n[Page #${index + 1}]`);
      console.log(`  URL:          ${page.url}`);
      console.log(`  Title:        ${page.title}`);
      console.log(`  HTML Length:  ${page.html.length} characters`);
      
      // Clean and display a small snippet of the HTML response
      const cleanSnippet = page.html
        .replace(/\s+/g, " ")
        .substring(0, 150)
        .trim();
      console.log(`  HTML Snippet: "${cleanSnippet}..."`);
    });

    console.log("\n=========================================");

    if (pages.length > 0) {
      // Confirm that the start page was fetched and has valid attributes
      const firstPage = pages[0];
      if (firstPage.url.includes("example.com") && firstPage.title && firstPage.html) {
        console.log("✅ SUCCESS: Crawled website and extracted page structures successfully!");
      } else {
        console.log("❌ FAILURE: Page attributes are incomplete or incorrect.");
      }
    } else {
      console.log("❌ FAILURE: Zero pages crawled.");
    }
    
    console.log("=========================================");
  } catch (error) {
    console.error("\n❌ Test execution encountered a critical error:", error);
    process.exit(1);
  }
}

runTest();
