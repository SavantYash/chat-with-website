import { WebPage, IndexingProgressEvent } from "../../types";

/**
 * Interface defining the Web Crawler component.
 * Responsible for crawling pages of a site and extracting raw HTML content.
 * Follows the Dependency Inversion Principle.
 */
export interface Crawler {
  /**
   * Crawls a website starting from a base URL.
   * 
   * @param baseUrl Starting URL
   * @param maxPages Maximum number of pages to crawl
   * @param signal Optional AbortSignal for cancellation
   * @param onProgress Optional progress callback
   * @returns Array of crawled pages with content
   */
  crawl(
    baseUrl: string,
    maxPages?: number,
    signal?: AbortSignal,
    onProgress?: (event: IndexingProgressEvent) => void
  ): Promise<WebPage[]>;
}

export * from "./crawler";
export * from "./normalizer";
export * from "./parser";
export * from "./robots";
