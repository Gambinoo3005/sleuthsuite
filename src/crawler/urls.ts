import type { CrawlSettings } from "../model.ts";

export const USER_AGENT = "SleuthSuite/1.0";
export const MAX_LINKS = 5_000;
export const MAX_URL_LIST_LENGTH = 645_000;
export const MAX_CRAWL_URLS = 10_000;

export function normalizeUrl(value: string, base?: string): string | null {
  if (!value || value.length > 4096) return null;
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeCrawlUrl(input: string): string | null {
  const value = input.trim();
  if (!value || /[\r\n\t]/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return normalizeUrl(value);
  if (/^[/?#\\]/.test(value)) return null;

  const url = normalizeUrl("https://" + value);
  if (!url) return null;
  const hostname = new URL(url).hostname.replace(/\.$/, "");
  const labels = hostname.split(".");
  const suffix = labels.at(-1) ?? "";
  const validLabels = labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  return hostname.length <= 253 && labels.length > 1 && validLabels && /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(suffix) ? url : null;
}

export function parseSettings(input: unknown): CrawlSettings {
  if (!input || typeof input !== "object") throw new Error("Enter a website address or URL list.");
  const data = input as Record<string, unknown>;
  const mode = data.mode === "list" ? "list" : "site";
  const text = typeof data.urls === "string" ? data.urls.trim() : "";
  if (!text || text.length > MAX_URL_LIST_LENGTH) throw new Error("Enter a URL or a list smaller than 645 KB.");
  const lines = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (mode === "site" && lines.length !== 1) throw new Error("Website mode accepts one URL.");
  const urls = lines.map(normalizeCrawlUrl);
  const invalid = lines.filter((_, index) => urls[index] === null);
  if (invalid.length) throw new Error(`Enter a complete domain or a valid HTTP or HTTPS URL. Check: ${invalid.slice(0, 3).join(", ").slice(0, 200)}`);
  const seeds = [...new Set(urls as string[])];
  const bounded = (key: string, fallback: number, lower: number, upper: number) => {
    const value = data[key] === "" || data[key] == null ? fallback : Number(data[key]);
    if (!Number.isInteger(value) || value < lower || value > upper) throw new Error(`${key} must be between ${lower} and ${upper}.`);
    return value;
  };
  const limit = bounded("limit", 1000, 1, MAX_CRAWL_URLS);
  if (seeds.length > limit) throw new Error("The URL list exceeds the crawl limit.");
  const start = new URL(seeds[0]);
  const scope = mode === "site" && data.scope === "path" ? "path" : "origin";
  const path = scope === "path" ? start.pathname.replace(/\/$/, "") || "/" : "/";
  const sitemapText = typeof data.sitemap === "string" ? data.sitemap.trim() : "";
  const sitemap = mode === "site" && sitemapText ? normalizeUrl(sitemapText, start.origin) : "";
  if (sitemap === null || (sitemap && new URL(sitemap).origin !== start.origin)) {
    throw new Error("Use a sitemap on the starting URL’s origin.");
  }
  const extract = Array.isArray(data.extract) ? data.extract : [];
  if (extract.length > 5) throw new Error("Use up to five extraction rules.");
  const rules = extract.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid extraction rule.");
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const selector = typeof value.selector === "string" ? value.selector.trim() : "";
    const attribute = typeof value.attribute === "string" ? value.attribute.trim() : "";
    // Keep selector evaluation predictable on large, untrusted HTML documents.
    if (!name || name.length > 40 || !selector || selector.length > 160 || /[:*,]/.test(selector) || (attribute && !/^[\w:-]{1,48}$/.test(attribute))) {
      throw new Error("Use a name and a simple CSS selector, such as article h2 or [data-price].");
    }
    return { name, selector, ...(attribute ? { attribute } : {}) };
  });
  if (new Set(rules.map((rule) => rule.name)).size !== rules.length) throw new Error("Extraction rule names must be unique.");
  return {
    mode, seeds, limit, scope, path, sitemap,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 85) : start.host,
    depth: bounded("depth", 10, 0, 40),
    rate: bounded("rate", 2, 1, 15),
    rendering: data.rendering === "chromium" ? "chromium" : "html",
    followNofollow: data.followNofollow === true,
    extract: rules,
  };
}

export function inScope(value: string, origin: string, settings: CrawlSettings): boolean {
  const url = new URL(value);
  return url.origin === origin && (settings.scope === "origin" || settings.path === "/" ||
    url.pathname === settings.path || url.pathname.startsWith(settings.path + "/"));
}

export function isHttpsUpgrade(from: string, to: string): boolean {
  const a = new URL(from);
  const b = new URL(to);
  return a.protocol === "http:" && b.protocol === "https:" && a.hostname === b.hostname && !a.port && !b.port;
}
