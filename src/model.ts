export type Mode = "site" | "list";
export type Rendering = "html" | "chromium";
export type RunState = "queued" | "running" | "pausing" | "paused" | "stopping" | "stopped" | "complete" | "failed";
export type UrlState = "queued" | "fetching" | "done" | "failed" | "skipped" | "cancelled";
export type Discovery = "seed" | "link" | "redirect" | "sitemap";
export const discoveryLabels: Record<Discovery, string> = {
  seed: "Seed", link: "Link", redirect: "Redirect", sitemap: "Sitemap",
};
export interface InputRow { source: string; row: number; value: string }
export interface ReviewedInputRow extends InputRow {
  id: number;
  url: string | null;
  status: "ready" | "duplicate" | "rejected";
}

export interface ExtractionRule {
  name: string;
  selector: string;
  attribute?: string;
}

export interface CrawlSettings {
  mode: Mode;
  seeds: string[];
  name: string;
  scope: "origin" | "path";
  path: string;
  limit: number;
  depth: number;
  rate: number;
  rendering: Rendering;
  sitemap: string;
  followNofollow: boolean;
  expandList?: boolean;
  extract: ExtractionRule[];
}

export interface RunSummary {
  id: string;
  settings: CrawlSettings;
  state: RunState;
  origin: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  message: string | null;
  truncated: boolean;
  issuesReady: boolean;
  discovered: number;
  checked: number;
  queued: number;
  skipped: number;
  failed: number;
  cancelled: number;
  findings: number;
}

export interface Hreflang {
  lang: string;
  url: string;
}

export interface PageFacts {
  title: string;
  titleTags: number;
  description: string;
  descriptionTags: number;
  h1: string[];
  canonical: string[];
  invalidCanonical: boolean;
  robots: string[];
  hreflang: Hreflang[];
  images: number;
  missingAlt: number;
  emptyAlt: number;
  badJsonLd: number;
  words: number;
  hash: string;
  extracted: Record<string, string[]>;
}

export interface RenderEvidence {
  title: string;
  description: string;
  h1: string[];
  robots: string[];
  canonical: string[];
  links: number;
}

export interface Link {
  source: string;
  target: string;
  original: string;
  anchor: string;
  placement: string;
  nofollow: boolean;
  scopeDecision?: string;
}

export interface PageRecord {
  url: string;
  state: UrlState;
  http: number | null;
  depth: number;
  type: string;
  ms: number | null;
  bytes: number;
  issue: string | null;
  location: string | null;
  facts: PageFacts | null;
  raw: RenderEvidence | null;
  note: string | null;
  inlinks: number;
  sources: Discovery[];
  discoverySource?: string;
  scopeDecision?: string;
}

export interface Evidence extends PageRecord {
  incoming: Link[];
  outgoing: Link[];
  outgoingCount: number;
  headers: Record<string, string>;
}

export type Severity = "error" | "warning" | "notice";
export const RULES = {
  broken: { title: "Broken page", severity: "error", explanation: "Update the source links or restore the destination. Review the incoming links to identify where to make the repair." },
  client: { title: "HTTP client error", severity: "warning", explanation: "Inspect the response to determine whether the URL, access policy, or request needs attention." },
  server: { title: "Server error", severity: "error", explanation: "Investigate the server response and recheck the URL after the underlying error is resolved." },
  redirectLoop: { title: "Redirect loop", severity: "error", explanation: "Update the redirect rules so every hop leads to a final destination." },
  invalidRedirect: { title: "Invalid redirect", severity: "error", explanation: "Return a valid HTTP(S) Location for the redirect." },
  badCanonical: { title: "Canonical target returns an error", severity: "error", explanation: "Point the canonical directly to the preferred, accessible URL." },
  badSitemap: { title: "Sitemap URL with exclusion signal", severity: "warning", explanation: "Review sitemap entries alongside their response, robots and canonical signals. Include the canonical URLs you intend to surface." },
  redirectChain: { title: "Redirect chain", severity: "warning", explanation: "Update internal links and redirect rules to point to the final destination directly." },
  canonicalRedirect: { title: "Canonical target redirects", severity: "warning", explanation: "Confirm the intended canonical and point to the final URL when appropriate." },
  redirectLimit: { title: "Redirect hop limit reached", severity: "warning", explanation: "Review the observed chain and shorten it where possible." },
  missingTitle: { title: "Missing page title", severity: "warning", explanation: "Write a unique title that describes the page’s main purpose." },
  duplicateTitle: { title: "Duplicate page title", severity: "warning", explanation: "Review the other pages with this title and make titles distinct where pages serve different purposes." },
  missingDescription: { title: "Missing meta description", severity: "notice", explanation: "Add a concise description if this page needs a distinct search snippet." },
  duplicateDescription: { title: "Duplicate meta description", severity: "notice", explanation: "Check the pages sharing this description and write a distinct summary where appropriate." },
  missingH1: { title: "Missing H1", severity: "notice", explanation: "Use a descriptive main heading where it improves the structure and clarity of the page." },
  missingAlt: { title: "Images missing alt attributes", severity: "warning", explanation: "Give informative images useful alternative text. Use an empty alt attribute for decorative images." },
  duplicateBody: { title: "Exact duplicate HTML", severity: "warning", explanation: "Review the identical pages and decide which URL should be linked, indexed or redirected." },
  invalidCanonical: { title: "Invalid or conflicting canonical", severity: "warning", explanation: "Declare one consistent, valid canonical URL in your HTML or HTTP header." },
  noindex: { title: "Noindex directive detected", severity: "notice", explanation: "Confirm the directive is intentional. Review any conflicting sitemap or internal linking signals." },
  blocked: { title: "Blocked by robots.txt", severity: "notice", explanation: "Review the matching robots rule. The page contents are unknown because the crawl respected the rule." },
  inaccessible: { title: "Page could not be checked", severity: "notice", explanation: "Review the access response, connection error or request limit and retry if appropriate." },
  sitemapOnly: { title: "Sitemap URL without observed inlinks", severity: "notice", explanation: "Review internal linking and crawl coverage. This URL was discovered in a sitemap, with no incoming link observed in this run." },
  invalidHreflang: { title: "Invalid hreflang declaration", severity: "warning", explanation: "Use a valid language or locale code, or x-default, and a valid target URL." },
  missingHreflangReturn: { title: "Hreflang return link missing", severity: "warning", explanation: "Check that the alternate page links back using a reciprocal hreflang declaration." },
  invalidJsonLd: { title: "Invalid JSON-LD syntax", severity: "warning", explanation: "Check the structured data block for JSON syntax errors and run a rich result validator when applicable." },
  renderFailed: { title: "Browser rendering incomplete", severity: "notice", explanation: "Review the render message. The audit used the available HTML evidence for this page." },
} as const satisfies Record<string, { title: string; severity: Severity; explanation: string }>;

export type RuleCode = keyof typeof RULES;
export interface Finding { code: RuleCode; url: string; evidence: string }
export interface IssueGroup { code: RuleCode; count: number }
export interface SitemapRecord { url: string; state: string; detail: string | null }
export interface ListResult<T> { items: T[]; total: number; page: number; size: number }

export const ACTIVE_STATES: RunState[] = ["queued", "running", "pausing", "paused", "stopping"];
export const isActive = (state: RunState) => ACTIVE_STATES.includes(state);
