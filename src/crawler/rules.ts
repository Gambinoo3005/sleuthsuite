import { one, putFindings, rows } from "../db.ts";
import type { Database, StoredOutcome } from "../db.ts";
import type { Finding, RuleCode } from "../model.ts";

export function auditPage(url: string, result: StoredOutcome): Finding[] {
  const issues: Finding[] = [];
  const add = (code: RuleCode, evidence: string) => issues.push({ url, code, evidence });
  if (result.issue === "robots") add("blocked", result.note ?? "Disallowed by robots.txt.");
  else if (result.state === "failed" || result.state === "skipped" || [401, 403, 429].includes(result.http ?? 0)) {
    add("inaccessible", result.note ?? `HTTP ${result.http}`);
  }
  if (result.http === 404 || result.http === 410) add("broken", `HTTP ${result.http}`);
  else if (result.http && result.http >= 400 && result.http < 500 && ![401, 403, 429].includes(result.http)) add("client", `HTTP ${result.http}`);
  if (result.http && result.http >= 500) add("server", `HTTP ${result.http}`);
  if (result.issue === "redirect-invalid") add("invalidRedirect", "The HTTP redirect has a missing or invalid Location.");
  if (result.issue === "redirect-limit") add("redirectLimit", "The crawler stopped following this redirect after ten hops.");
  if (result.issue === "render") add("renderFailed", result.note ?? "Chromium did not provide usable evidence.");
  const facts = result.facts;
  if (result.noindex) add("noindex", facts?.robots.join(", ") || "X-Robots-Tag");
  if (!facts) return issues;
  if (facts.invalidCanonical) add("invalidCanonical", facts.canonical.join(" | ") || "The declared canonical is empty or invalid.");
  if (result.http === 200 && !result.noindex && !facts.invalidCanonical && (!facts.canonical.length || facts.canonical[0] === url)) {
    if (!facts.title) add("missingTitle", facts.titleTags ? "The title element is empty." : "No title element was found.");
    if (!facts.description) add("missingDescription", facts.descriptionTags ? "The description content is empty." : "No description tag was found.");
    if (!facts.h1.length) add("missingH1", "No nonempty H1 was found.");
  }
  if (facts.missingAlt) add("missingAlt", `${facts.missingAlt} of ${facts.images} image(s) lack an alt attribute.`);
  if (facts.badJsonLd) add("invalidJsonLd", `${facts.badJsonLd} JSON-LD block(s) could not be parsed.`);
  const bad = facts.hreflang.filter(({ lang, url }) => !url || !/^(?:x-default|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i.test(lang));
  if (bad.length) add("invalidHreflang", bad.map(({ lang, url }) => `${lang || "(empty)"} → ${url || "(invalid URL)"}`).join(" | ").slice(0, 4000));
  return issues;
}

export interface RedirectHop { url: string; http: number | null; location: string | null; issue?: string | null }
export function traceRedirect(start: string, lookup: (url: string) => RedirectHop | undefined) {
  const hops: RedirectHop[] = [];
  const visited = new Set<string>();
  let url: string | null = start;
  while (url && hops.length <= 11) {
    if (visited.has(url)) return { hops, loop: url, destination: url };
    visited.add(url);
    const page = lookup(url);
    if (!page) return { hops, loop: null, destination: url };
    hops.push(page);
    if (!page.location) return { hops, loop: null, destination: page.url };
    url = page.location;
  }
  return { hops, loop: null, destination: url };
}

export function redirectTrace(db: Database, run: string, url: string) {
  return traceRedirect(url, (target) => one<RedirectHop>(db, "SELECT url,http,location,issue FROM urls WHERE run=? AND url=?", run, target));
}

export function auditRun(db: Database, run: string) {
  for (const [field, code] of [["title", "duplicateTitle"], ["description", "duplicateDescription"], ["hash", "duplicateBody"]] as const) {
    db.prepare(`INSERT OR REPLACE INTO findings(run,url,code,evidence)
      SELECT a.run,a.url,?,CASE WHEN ?='hash' THEN 'Matching SHA-256: ' ELSE 'Shared value: ' END || a.${field}
      FROM urls a JOIN (
        SELECT ${field} shared FROM urls WHERE run=? AND eligible=1 AND ${field} <> '' GROUP BY ${field} HAVING COUNT(*)>1
      ) b ON a.${field}=b.shared WHERE a.run=? AND a.eligible=1`).run(code, field, run, run);
  }
  db.prepare(`INSERT OR REPLACE INTO findings(run,url,code,evidence)
    SELECT u.run,u.url,CASE WHEN t.http>=400 THEN 'badCanonical' ELSE 'canonicalRedirect' END,
    t.url || ' · HTTP ' || t.http
    FROM urls u JOIN urls t ON t.run=u.run AND t.url=u.canonical
    WHERE u.run=? AND u.url<>t.url AND (t.http IN (301,302,303,307,308) OR (t.http>=400 AND t.http NOT IN (401,403,429)))`).run(run);
  db.prepare(`INSERT OR REPLACE INTO findings(run,url,code,evidence)
    SELECT u.run,u.url,'badSitemap',CASE
      WHEN u.state='skipped' THEN COALESCE(u.note,'Skipped')
      WHEN u.http<>200 THEN 'HTTP ' || u.http
      WHEN u.noindex=1 THEN 'Noindex directive'
      ELSE 'Canonical points to ' || u.canonical END
    FROM urls u WHERE u.run=? AND (u.issue='robots' OR (u.http IS NOT NULL AND u.http<>200) OR u.noindex=1 OR
      (u.canonical IS NOT NULL AND u.canonical<>u.url))
      AND EXISTS (SELECT 1 FROM discoveries d WHERE d.run=u.run AND d.url=u.url AND d.kind='sitemap')`).run(run);
  db.prepare(`INSERT OR REPLACE INTO findings(run,url,code,evidence)
    SELECT u.run,u.url,'sitemapOnly','Found in a sitemap. No incoming link was observed.'
    FROM urls u WHERE u.run=? AND u.eligible=1
      AND EXISTS (SELECT 1 FROM discoveries d WHERE d.run=u.run AND d.url=u.url AND d.kind='sitemap')
      AND NOT EXISTS (SELECT 1 FROM links l WHERE l.run=u.run AND l.target=u.url AND l.source<>u.url)`).run(run);
  db.prepare(`INSERT OR REPLACE INTO findings(run,url,code,evidence)
    SELECT a.run,a.source,'missingHreflangReturn',substr(group_concat(a.lang || ': ' || a.target, ' | '),1,4000)
    FROM alternates a JOIN urls t ON t.run=a.run AND t.url=a.target
    WHERE a.run=? AND a.source<>a.target AND t.facts IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM alternates back WHERE back.run=a.run AND back.source=a.target AND back.target=a.source)
    GROUP BY a.run,a.source`).run(run);
  const redirects = rows<RedirectHop>(db, "SELECT url,http,location,issue FROM urls WHERE run=? AND location IS NOT NULL", run);
  const map = new Map(redirects.map((row) => [row.url, row]));
  const issues: Finding[] = [];
  for (const page of redirects) {
    const trace = traceRedirect(page.url, (url) => map.get(url));
    const evidence = [...trace.hops.map((hop) => hop.url), trace.destination].filter(Boolean).join(" → ").slice(0, 8192);
    if (trace.loop) issues.push({ url: page.url, code: "redirectLoop", evidence });
    else if (trace.hops.length > 1) issues.push({ url: page.url, code: "redirectChain", evidence });
  }
  putFindings(db, run, issues);
}
