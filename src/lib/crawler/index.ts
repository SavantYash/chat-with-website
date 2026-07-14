import { WebPage } from "../../types";

/**
 * Interface defining the Web Crawler component.
 * Responsible for downloading pages of a site and extracting raw text content.
 * Follows the Single Responsibility Principle.
 */
export interface Crawler {
  /**
   * Crawls a website starting from a base URL.
   * 
   * @param baseUrl Starting URL
   * @param maxPages Maximum number of pages to crawl
   * @returns Array of crawled pages with content
   */
  crawl(baseUrl: string, maxPages?: number): Promise<WebPage[]>;
}
