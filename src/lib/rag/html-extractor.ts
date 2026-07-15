import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { AnyNode } from "domhandler";
import { WebPage, ProcessedPage } from "../../types";

/**
 * HtmlExtractor is responsible for converting raw HTML page content (WebPage)
 * into clean, readable, structural plain text (ProcessedPage) optimized for embeddings.
 * 
 * Why this class exists:
 * Raw scraped HTML contains extensive boilerplates (ads, footer links, header menus, script codes)
 * which degrade the quality of semantic search embeddings. This class implements a hybrid strategy:
 * 1. It runs Mozilla's Readability algorithm on a simulated JSDOM tree to find the main article container.
 * 2. It falls back to Cheerio selection if Readability parsing fails.
 * 3. It parses the resulting content, removing noise elements and formatting key structures
 *    (headings, paragraphs, lists, code blocks) in a clean markdown-like format.
 */
export class HtmlExtractor {
  private readonly minChars: number;

  /**
   * Constructs the HtmlExtractor.
   * 
   * @param options Configuration options.
   * @param options.minChars Minimum length of processed content (default 100). Skip pages below this size.
   */
  constructor(options: { minChars?: number } = {}) {
    this.minChars = options.minChars ?? 100;
  }

  /**
   * Extract, clean, and format HTML content from a WebPage.
   * 
   * @param page The raw crawled WebPage.
   * @returns ProcessedPage if content is sufficient, or null if below length threshold.
   */
  async extract(page: WebPage): Promise<ProcessedPage | null> {
    const { url, title: rawTitle, html } = page;
    let extractedHtml = "";
    let extractedTitle = rawTitle;

    // Step 1: Use JSDOM and Mozilla Readability to isolate main article content
    // Bypass Readability for about/team pages where grid widgets are aggressively stripped
    const isAboutPage = url.toLowerCase().includes("about") || url.toLowerCase().includes("team");
    if (!isAboutPage) {
      try {
        const dom = new JSDOM(html, { url });
        const doc = dom.window.document;

        const reader = new Readability(doc);
        const article = reader.parse();

        if (article && article.content) {
          extractedHtml = article.content;
          if (article.title) {
            extractedTitle = article.title;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[HtmlExtractor] Readability parse failed for ${url}: ${errorMessage}. Falling back to Cheerio.`);
      }
    }

    // Step 2: Fallback to complete page HTML if Readability failed or was bypassed
    if (!extractedHtml) {
      extractedHtml = html;
    }

    // Step 3: Parse extracted HTML with Cheerio to strip remaining boilerplate and format content
    const $ = cheerio.load(extractedHtml);

    // Remove noise selectors
    $("nav, footer, header, script, style, noscript, aside").remove();

    // Locate container root (body or page root)
    const rootNode = $("body").length > 0 ? $("body")[0] : $.root()[0];

    // Recursively walk elements to build markdown-like plain text preserving layout structures
    const rawFormattedText = this.convertNodeToText(rootNode, $);

    // Step 4: Normalize whitespaces and excess newlines
    const cleanContent = this.cleanWhitespace(rawFormattedText);

    // Step 5: Enforce character count threshold
    if (cleanContent.length < this.minChars) {
      console.log(
        `[HtmlExtractor] Skipping page ${url} - clean text content length (${cleanContent.length}) is below threshold (${this.minChars} chars).`
      );
      return null;
    }

    return {
      url,
      title: extractedTitle || "Untitled Page",
      content: cleanContent,
    };
  }

  /**
   * Recursively parses DOM elements to preserve structural semantic layouts.
   * Maps headings to '# Heading', paragraphs to blocks, lists to bullets, and code elements to code blocks.
   * 
   * @param node The current DOM node to process.
   * @param $ Cheerio API query function.
   * @returns Formatted textual representation.
   */
  private convertNodeToText(node: AnyNode, $: cheerio.CheerioAPI): string {
    if (node.type === "text") {
      return node.data;
    }

    if (node.type !== "tag") {
      return "";
    }

    const tagName = node.tagName.toLowerCase();

    // Process nested child nodes
    const childTexts = node.childNodes
      .map((child) => this.convertNodeToText(child, $))
      .join("");

    switch (tagName) {
      case "h1":
        return `\n\n# ${childTexts.trim()}\n\n`;
      case "h2":
        return `\n\n## ${childTexts.trim()}\n\n`;
      case "h3":
        return `\n\n### ${childTexts.trim()}\n\n`;
      case "h4":
      case "h5":
      case "h6":
        return `\n\n#### ${childTexts.trim()}\n\n`;
      case "p":
        return `\n\n${childTexts.trim()}\n\n`;
      case "li":
        return `\n* ${childTexts.trim()}\n`;
      case "pre":
      case "code":
        // Avoid double-wrapping <code> tag block inside a <pre> block
        if (tagName === "code" && node.parentNode && (node.parentNode as any).tagName === "pre") {
          return childTexts;
        }
        return `\n\n\`\`\`\n${childTexts.trim()}\n\`\`\`\n\n`;
      case "ul":
      case "ol":
        return `\n${childTexts}\n`;
      case "br":
        return "\n";
      default:
        // Pass-through elements (div, span, section, article, body)
        return childTexts;
    }
  }

  /**
   * Clean redundant spaces and tabs, and limit consecutive newlines to maximum 2.
   * 
   * @param text Raw processed text.
   * @returns Cleaned and trimmed text.
   */
  private cleanWhitespace(text: string): string {
    return text
      // Replace multiple spaces or tabs with a single space
      .replace(/[ \t]+/g, " ")
      // Trim whitespace at line breaks
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      // Limit excessive empty lines to double newlines (paragraphs separator)
      .replace(/\n{3,}/g, "\n\n")
      // Trim start and end of document
      .trim();
  }
}
