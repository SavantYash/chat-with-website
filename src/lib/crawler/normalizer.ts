/**
 * UrlNormalizer is responsible for parsing, cleaning, resolving, and validating URLs
 * to ensure crawler consistency and enforce domain boundary checks.
 * 
 * Why this class exists:
 * URL normalization prevents the crawler from visiting equivalent pages multiple times.
 * For example, "https://example.com/docs", "https://example.com/docs/", and 
 * "https://example.com/docs#intro" represent the same document. Isolating this logic
 * adheres to the Single Responsibility Principle.
 */
export class UrlNormalizer {
  /**
   * Normalizes a given URL string by:
   * 1. Removing hash anchors (e.g. #section).
   * 2. Removing trailing slashes for non-root paths.
   * 3. Lowercasing the hostname (handled automatically by URL API).
   * 
   * @param urlString The raw URL string to normalize.
   * @returns Normalized URL string.
   */
  normalize(urlString: string): string {
    const url = new URL(urlString);
    // Strip hash fragments
    url.hash = "";

    let normalized = url.toString();

    // Strip trailing slash if it is not the root path '/'
    if (normalized.endsWith("/") && url.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Resolves a relative or absolute link against a base URL, validates it, and normalizes it.
   * 
   * @param link The relative or absolute link found in anchor tags.
   * @param baseUrl The base URL of the page where the link was found.
   * @returns The resolved, normalized URL, or null if the link is invalid or has an unsupported protocol.
   */
  resolveAndNormalize(link: string, baseUrl: string): string | null {
    try {
      // Resolve relative link against base URL
      const resolved = new URL(link, baseUrl);

      if (!this.isValidProtocol(resolved.href)) {
        return null;
      }

      return this.normalize(resolved.href);
    } catch {
      return null;
    }
  }

  /**
   * Checks if a target URL shares the same domain (host) as the starting base URL.
   * This restricts crawling scope to the target website only.
   * 
   * @param targetUrl The normalized target URL.
   * @param startUrl The normalized starting base URL.
   * @returns True if hosts are identical, false otherwise.
   */
  isSameDomain(targetUrl: string, startUrl: string): boolean {
    try {
      const targetHost = new URL(targetUrl).host;
      const startHost = new URL(startUrl).host;
      return targetHost === startHost;
    } catch {
      return false;
    }
  }

  /**
   * Validates if the URL protocol is suitable for web crawling.
   * Only 'http:' and 'https:' are supported. Rejects 'mailto:', 'javascript:', 'tel:', etc.
   * 
   * @param urlString The URL string to validate.
   * @returns True if protocol is http or https.
   */
  isValidProtocol(urlString: string): boolean {
    try {
      const protocol = new URL(urlString).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }
}
