import * as cheerio from "cheerio";

/**
 * HtmlParser is responsible for parsing raw HTML documents using Cheerio
 * to extract structured attributes like page titles and anchor links.
 * 
 * Why this class exists:
 * HTML document structure is complex and prone to anomalies. Isolating HTML processing
 * into this class ensures that any changes to our parsing library or rules for link extraction 
 * do not impact the core crawling state machine.
 */
export class HtmlParser {
  /**
   * Extracts the text content of the page's <title> tag.
   * Falls back to 'Untitled Page' if the tag is missing or empty.
   * 
   * @param html The raw HTML string.
   * @returns The extracted page title.
   */
  extractTitle(html: string): string {
    try {
      const $ = cheerio.load(html);
      const titleText = $("title").first().text().trim();
      return titleText || "Untitled Page";
    } catch {
      return "Untitled Page";
    }
  }

  /**
   * Scrapes the 'href' attributes of all anchor tags (<a>) in the HTML content.
   * Excludes empty or missing values.
   * 
   * @param html The raw HTML string.
   * @returns Array of raw string links.
   */
  extractLinks(html: string): string[] {
    try {
      const $ = cheerio.load(html);
      const links: string[] = [];

      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          const trimmedHref = href.trim();
          if (trimmedHref) {
            links.push(trimmedHref);
          }
        }
      });

      return links;
    } catch {
      return [];
    }
  }
}
