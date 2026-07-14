import robotsParser from "robots-parser";

/**
 * Interface replicating the internal structure of the parsed Robots object from 'robots-parser'.
 * Used to avoid 'any' types and enhance type check reliability.
 */
export interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  isDisallowed(url: string, ua?: string): boolean | undefined;
  getMatchingLineNumber(url: string, ua?: string): number;
  getCrawlDelay(ua?: string): number | undefined;
  getSitemaps(): string[];
  getPreferredHost(): string | null;
}

/**
 * RobotsChecker is responsible for fetching, parsing, and enforcing robots.txt compliance.
 * 
 * Why this class exists:
 * Web crawlers must respect the Robots Exclusion Protocol to avoid crawling restricted content 
 * and comply with site policy. This class wraps the network fetch and rule logic, isolating compliance checks.
 */
export class RobotsChecker {
  private robots: Robot | null = null;
  private robotsUrl: string | null = null;
  private userAgent: string;

  /**
   * Constructs the RobotsChecker.
   * 
   * @param defaultUserAgent The User-Agent string to match against rules.
   */
  constructor(defaultUserAgent: string = "AntigravityBot") {
    this.userAgent = defaultUserAgent;
  }

  /**
   * Fetches and parses the robots.txt file for a target website.
   * If the fetch fails or the response status is not 200, it falls back to allowing all routes.
   * 
   * @param startUrl The starting URL used to extract the origin domain and locate robots.txt.
   * @param customUserAgent Optional override for the User-Agent parameter.
   */
  async initialize(startUrl: string, customUserAgent?: string): Promise<void> {
    if (customUserAgent) {
      this.userAgent = customUserAgent;
    }

    try {
      const parsedUrl = new URL(startUrl);
      this.robotsUrl = `${parsedUrl.origin}/robots.txt`;

      console.log(`[RobotsChecker] Fetching robots.txt rules from: ${this.robotsUrl}`);

      const response = await fetch(this.robotsUrl, {
        headers: {
          "User-Agent": this.userAgent,
        },
      });

      if (response.ok) {
        const text = await response.text();
        this.robots = robotsParser(this.robotsUrl, text) as Robot;
        console.log(`[RobotsChecker] Successfully loaded and parsed robots.txt rules.`);
      } else {
        console.log(`[RobotsChecker] robots.txt not found (Status ${response.status}). Access allowed to all paths.`);
        this.robots = robotsParser(this.robotsUrl, "") as Robot;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[RobotsChecker] Error fetching robots.txt: ${errorMessage}. Falling back to allow all paths.`);
      
      // Build a fallback parser with empty text, which allows all queries
      if (this.robotsUrl) {
        this.robots = robotsParser(this.robotsUrl, "") as Robot;
      } else {
        this.robots = null;
      }
    }
  }

  /**
   * Checks if a target URL can be crawled by the current User-Agent.
   * 
   * @param urlString The absolute normalized target URL to check.
   * @returns True if allowed, false if blocked by robots.txt rules.
   */
  isAllowed(urlString: string): boolean {
    if (!this.robots) {
      return true;
    }

    try {
      const allowed = this.robots.isAllowed(urlString, this.userAgent);
      // If result is undefined, robots.txt has no matching rules; default to allowed.
      return allowed === undefined ? true : allowed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[RobotsChecker] Error checking permission for ${urlString}: ${errorMessage}. Defaulting to true.`);
      return true;
    }
  }
}
