import { WebPage, CrawlerConfig, IndexingProgressEvent } from "../../types";
import { Crawler } from "./index";
import { UrlNormalizer } from "./normalizer";
import { HtmlParser } from "./parser";
import { RobotsChecker } from "./robots";

/**
 * WebsiteCrawler implements the Crawler interface by orchestrating
 * specialized collaborating classes (UrlNormalizer, HtmlParser, RobotsChecker).
 * 
 * Why this class exists:
 * It handles the execution state machine of a breadth-first search (BFS) crawl.
 * By keeping the queue, state monitoring, sleep intervals, and boundary checks in one place,
 * and outsourcing parsing, normalization, and robots.txt logic to collaborators,
 * the class adheres to SOLID principles and remains highly testable.
 */
export class WebsiteCrawler implements Crawler {
  private readonly config: Required<CrawlerConfig>;
  private readonly normalizer: UrlNormalizer;
  private readonly parser: HtmlParser;
  private readonly robots: RobotsChecker;

  /**
   * Constructs the modular WebsiteCrawler.
   * Leverages Dependency Injection so collaborators can be replaced or mocked.
   * 
   * @param config Config options like max depth and delay.
   * @param normalizer Helper for URL normalization and domain validation.
   * @param parser Helper for HTML metadata and anchor tag extraction.
   * @param robots Helper for Robots Exclusion compliance checks.
   */
  constructor(
    config: CrawlerConfig = {},
    normalizer: UrlNormalizer = new UrlNormalizer(),
    parser: HtmlParser = new HtmlParser(),
    robots: RobotsChecker = new RobotsChecker(config.userAgent)
  ) {
    this.config = {
      maxPages: config.maxPages ?? 20,
      maxDepth: config.maxDepth ?? 3,
      requestDelay: config.requestDelay ?? 200,
      userAgent: config.userAgent ?? "AntigravityBot",
    };
    this.normalizer = normalizer;
    this.parser = parser;
    this.robots = robots;
  }

  /**
   * Crawls a target website starting from a base URL using BFS.
   * Remains within the starting domain, obeys robots.txt, and honors request delays.
   * 
   * @param baseUrl Starting entrypoint URL of the website.
   * @param maxPagesOverride Optional parameter to override the configured max pages limit.
   * @param signal Optional AbortSignal for cancellation.
   * @param onProgress Optional progress callback.
   * @returns List of crawled WebPage data models containing raw HTML.
   */
  async crawl(
    baseUrl: string,
    maxPagesOverride?: number,
    signal?: AbortSignal,
    onProgress?: (event: IndexingProgressEvent) => void
  ): Promise<WebPage[]> {
    const maxPages = maxPagesOverride ?? this.config.maxPages;
    const normalizedStartUrl = this.normalizer.normalize(baseUrl);

    if (!this.normalizer.isValidProtocol(normalizedStartUrl)) {
      throw new Error(`[WebsiteCrawler] Unsupported protocol for start URL: ${baseUrl}. Only http: and https: are allowed.`);
    }

    console.log(`\n[WebsiteCrawler] Beginning BFS crawl:`);
    console.log(`  - Entry URL:    ${normalizedStartUrl}`);
    console.log(`  - Max Pages:    ${maxPages}`);
    console.log(`  - Max Depth:    ${this.config.maxDepth}`);
    console.log(`  - Req Delay:    ${this.config.requestDelay} ms`);
    console.log(`  - User Agent:   ${this.config.userAgent}`);

    // Fetch and register robots.txt directives
    await this.robots.initialize(normalizedStartUrl, this.config.userAgent);

    const visitedUrls = new Set<string>();
    const crawledPages: WebPage[] = [];

    // BFS Queue tracking { URL, depth }
    const queue: { url: string; depth: number }[] = [
      { url: normalizedStartUrl, depth: 0 },
    ];

    while (queue.length > 0 && crawledPages.length < maxPages) {
      if (signal?.aborted) {
        console.log("[WebsiteCrawler] Crawl aborted by AbortSignal.");
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      const currentItem = queue.shift();
      if (!currentItem) {
        continue;
      }

      const { url: currentUrl, depth: currentDepth } = currentItem;

      // Skip already visited URLs
      if (visitedUrls.has(currentUrl)) {
        continue;
      }
      visitedUrls.add(currentUrl);

      // Check robots.txt permissions
      if (!this.robots.isAllowed(currentUrl)) {
        console.log(`[WebsiteCrawler] 🚫 Skipping blocked path: ${currentUrl}`);
        continue;
      }

      // Respect request delay between crawls to prevent overloading target systems
      if (crawledPages.length > 0 && this.config.requestDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.requestDelay));
      }

      console.log(`[WebsiteCrawler] 🌐 [${crawledPages.length + 1}/${maxPages}] Fetching: ${currentUrl} (depth: ${currentDepth})`);

      let html = "";
      try {
        const response = await fetch(currentUrl, {
          headers: {
            "User-Agent": this.config.userAgent,
          },
        });

        if (!response.ok) {
          console.warn(`[WebsiteCrawler] ⚠️ Failed HTTP request: ${currentUrl} (Status ${response.status})`);
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          console.log(`[WebsiteCrawler] ℹ️ Skipping non-HTML resource: ${currentUrl} (Content-Type: ${contentType})`);
          continue;
        }

        html = await response.text();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[WebsiteCrawler] ⚠️ Network fetch error for ${currentUrl}: ${errorMessage}`);
        continue;
      }

      // Parse fields
      const title = this.parser.extractTitle(html);
      crawledPages.push({
        url: currentUrl,
        title,
        html,
      });

      onProgress?.({
        stage: "crawl",
        message: `Crawled page ${crawledPages.length}/${maxPages}\n${currentUrl}`,
        details: {
          url: currentUrl,
          crawledPages: crawledPages.length,
          maxPages,
          action: "crawl"
        },
      });

      // Avoid queueing child pages if we've reached the maximum crawl depth
      if (currentDepth >= this.config.maxDepth) {
        continue;
      }

      // Process and queue internal links
      const rawLinks = this.parser.extractLinks(html);
      for (const link of rawLinks) {
        const resolvedUrl = this.normalizer.resolveAndNormalize(link, currentUrl);
        if (!resolvedUrl) {
          continue;
        }

        // Domain lock constraint: must remain on the starting website's domain
        if (!this.normalizer.isSameDomain(resolvedUrl, normalizedStartUrl)) {
          continue;
        }

        if (!visitedUrls.has(resolvedUrl)) {
          queue.push({
            url: resolvedUrl,
            depth: currentDepth + 1,
          });
        }
      }
    }

    console.log(`[WebsiteCrawler] Crawl finished. Explored ${visitedUrls.size} URLs, successfully indexed ${crawledPages.length} pages.\n`);
    return crawledPages;
  }
}
