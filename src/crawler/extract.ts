import { createHash } from "node:crypto";
import { loadBuffer } from "cheerio";
import type { ExtractionRule, Link, PageFacts, RenderEvidence } from "../model.ts";
import { MAX_LINKS, normalizeUrl } from "./urls.ts";

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 2_000);
const tokens = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean);

export function extractPage(body: Buffer, url: string, headers: Record<string, string>, rules: ExtractionRule[]) {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(headers["content-type"] ?? "")?.[1];
  const $ = loadBuffer(body, { encoding: { transportLayerEncodingLabel: charset } });
  const base = normalizeUrl($("base[href]").first().attr("href") ?? "", url) ?? url;
  const meta = (name: string) => $("meta[name]").filter((_, node) => $(node).attr("name")?.trim().toLowerCase() === name);
  const canonicals = $("link[rel]").filter((_, node) => tokens($(node).attr("rel") ?? "").includes("canonical"));
  const canonicalRaw = canonicals.toArray().map((node) => $(node).attr("href") ?? "");
  for (const link of (headers.link ?? "").split(/,(?=\s*<)/)) {
    if (/;\s*rel\s*=\s*"?canonical(?:"|\s|;|$)/i.test(link)) canonicalRaw.push(/<([^>]*)>/.exec(link)?.[1] ?? "");
  }
  const canonical = canonicalRaw.map((value) => normalizeUrl(value, base));
  const robots = [
    ...meta("robots").toArray().flatMap((node) => tokens($(node).attr("content") ?? "")),
    ...meta("sleuthsuite").toArray().flatMap((node) => tokens($(node).attr("content") ?? "")),
    ...(headers["x-robots-tag"] ?? "").split(/,(?=\s*[\w-]+\s*:)/).flatMap((value) => {
      const scoped = /^\s*([\w-]+):\s*(.*)/.exec(value);
      if (scoped && !["sleuthsuite", "max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"].includes(scoped[1].toLowerCase())) return [];
      return tokens(value);
    }),
  ];
  const links: Link[] = [];
  const anchors = $("a[href], area[href]");
  for (const node of anchors.toArray().slice(0, MAX_LINKS)) {
    const element = $(node);
    const original = (element.attr("href") ?? "").trim();
    const target = normalizeUrl(original, base);
    if (!target) continue;
    const placement = element.closest("header, footer, nav, aside, main, article").first().prop("tagName")?.toLowerCase() ?? "body";
    links.push({ source: url, target, original, anchor: clean(element.text() || element.attr("alt") || element.find("img").first().attr("alt") || ""), placement, nofollow: tokens(element.attr("rel") ?? "").includes("nofollow") });
  }
  const images = $("img");
  const extracted: Record<string, string[]> = Object.create(null);
  for (const rule of rules) {
    try {
      extracted[rule.name] = $(rule.selector).toArray().slice(0, 20)
        .map((node) => clean(rule.attribute ? $(node).attr(rule.attribute) ?? "" : $(node).text()));
    } catch {
      extracted[rule.name] = [];
    }
  }
  const descriptions = meta("description");
  const titleTags = $("title");
  const h1 = $("h1").toArray().slice(0, 20).map((node) => clean($(node).text())).filter(Boolean);
  const hreflang = $("link[hreflang]").toArray().slice(0, 100).map((node) => ({
    lang: ($(node).attr("hreflang") ?? "").trim().slice(0, 40),
    url: normalizeUrl($(node).attr("href") ?? "", base) ?? "",
  }));
  let badJsonLd = 0;
  $("script[type='application/ld+json']").each((_, node) => {
    try { JSON.parse($(node).text()); } catch { badJsonLd++; }
  });
  $("script, style, noscript, template").remove();
  const text = $("body").text().trim();
  const facts: PageFacts = {
    title: clean(titleTags.first().text()), titleTags: titleTags.length,
    description: clean(descriptions.first().attr("content") ?? ""), descriptionTags: descriptions.length,
    h1, canonical: [...new Set(canonical.filter((value): value is string => Boolean(value)))],
    invalidCanonical: canonical.some((value) => !value) || new Set(canonical).size > 1,
    robots: [...new Set(robots)].slice(0, 50), hreflang,
    images: images.length,
    missingAlt: images.filter((_, node) => $(node).attr("alt") === undefined).length,
    emptyAlt: images.filter((_, node) => $(node).attr("alt") === "").length,
    badJsonLd, words: text ? text.split(/\s+/).length : 0,
    hash: createHash("sha256").update(body).digest("hex"),
    extracted,
  };
  return { facts, links, truncated: anchors.length > MAX_LINKS };
}

export const isNoindex = (facts: PageFacts) => facts.robots.includes("noindex") || facts.robots.includes("none");

export function renderEvidence(facts: PageFacts, links: Link[]): RenderEvidence {
  const { title, description, h1, robots, canonical } = facts;
  return { title, description, h1, robots, canonical, links: links.length };
}
