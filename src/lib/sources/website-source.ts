import { v4 as uuidv4 } from "uuid";
import { KnowledgeSource, NormalizedDocument, IndexingProgressEvent } from "../../types";
import { WebsiteCrawler } from "../crawler/crawler";
import { HtmlExtractor } from "../rag/html-extractor";

export interface WebsiteSourceOptions {
  url: string;
  maxPages?: number;
  maxDepth?: number;
  crawler?: WebsiteCrawler;
  extractor?: HtmlExtractor;
}

/**
 * WebsiteKnowledgeSource encapsulates crawling and HTML extraction for a website.
 * Implements the KnowledgeSource contract and outputs NormalizedDocuments.
 */
export class WebsiteKnowledgeSource implements KnowledgeSource {
  readonly sourceType = "website" as const;
  readonly sourceName: string;
  private readonly url: string;
  private readonly maxPages: number;
  private readonly crawler: WebsiteCrawler;
  private readonly extractor: HtmlExtractor;

  constructor(options: WebsiteSourceOptions) {
    this.url = options.url.trim();
    this.sourceName = this.url;
    this.maxPages = options.maxPages ?? 10;
    this.crawler = options.crawler ?? new WebsiteCrawler({ maxPages: this.maxPages, maxDepth: options.maxDepth ?? 3 });
    this.extractor = options.extractor ?? new HtmlExtractor();
  }

  async ingest(
    onProgress?: (event: IndexingProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<NormalizedDocument[]> {
    onProgress?.({
      stage: "crawl",
      message: `Crawling site: ${this.url} (Max Pages: ${this.maxPages})...`,
    });

    const pages = await this.crawler.crawl(this.url, this.maxPages, signal, onProgress);
    const documents: NormalizedDocument[] = [];

    for (const page of pages) {
      if (signal?.aborted) {
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      try {
        const processedPage = await this.extractor.extract(page);
        if (processedPage && processedPage.content) {
          documents.push({
            id: uuidv4(),
            title: processedPage.title || page.title || page.url,
            content: processedPage.content,
            metadata: {
              sourceType: "website",
              sourceName: processedPage.title || page.title || page.url,
              sourceUrl: page.url,
            },
          });

          onProgress?.({
            stage: "extract",
            message: `Cleaned content\n${page.url}`,
            details: { url: page.url, action: "clean" },
          });
        }
      } catch (error: any) {
        console.warn(`[WebsiteKnowledgeSource] ⚠️ Failed extracting ${page.url}: ${error.message}`);
      }
    }

    if (documents.length === 0) {
      throw new Error(`[WebsiteKnowledgeSource] No extractable content found for website: ${this.url}`);
    }

    return documents;
  }
}
