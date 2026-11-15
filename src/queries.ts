import type { SQLInputValue } from "node:sqlite";
import { one, rows, runRow } from "./db.ts";
import type { Database } from "./db.ts";
import type { CrawlSettings, Discovery, Evidence, Finding, IssueGroup, Link, ListResult, PageFacts, PageRecord, RenderEvidence, ReviewedInputRow, SitemapRecord, UrlState } from "./model.ts";
import { RULES } from "./model.ts";
import { inScope } from "./crawler/urls.ts";

interface ResultRow {
  url: string; state: UrlState; http: number | null; depth: number; type: string; ms: number | null; bytes: number;
  issue: string | null; location: string | null; facts: string | null; raw: string | null; note: string | null;
  inlinks: number; sources: string | null; discovery_source: string | null; input_ids: string | null; headers: string;
}

const selection = `u.*, (SELECT COUNT(DISTINCT l.source) FROM links l WHERE l.run=u.run AND l.target=u.url) inlinks,
  (SELECT group_concat(DISTINCT d.kind) FROM discoveries d WHERE d.run=u.run AND d.url=u.url) sources,
  (SELECT d.source FROM discoveries d WHERE d.run=u.run AND d.url=u.url AND d.source<>'' ORDER BY d.kind,d.source LIMIT 1) discovery_source,
  (SELECT group_concat(i.id, ', ' ORDER BY i.id) FROM input_rows i WHERE i.run=u.run AND i.url=u.url) input_ids`;
const escapeLike = (value: string) => "%" + value.trim().slice(0, 200).replace(/[\\%_]/g, "\\$&") + "%";

function readPage(row: ResultRow, settings?: CrawlSettings): PageRecord {
  const sources = row.sources ? row.sources.split(",") as Discovery[] : [];
  const scopeDecision = sources.includes("seed")
    ? settings?.mode === "list" ? "Explicit list entry" : "Starting URL"
    : !sources.length ? "Not recorded"
    : settings?.mode === "list" ? "Same origin as source URL"
    : settings?.scope === "path" && settings.path !== "/" ? `Within ${settings.path}` : "Within starting origin";
  return {
    url: row.url, state: row.state, http: row.http, depth: row.depth, type: row.type,
    ms: row.ms, bytes: row.bytes, issue: row.issue, location: row.location, note: row.note,
    facts: row.facts ? JSON.parse(row.facts) as PageFacts : null,
    raw: row.raw ? JSON.parse(row.raw) as RenderEvidence : null,
    inlinks: row.inlinks, sources, scopeDecision, discoverySource: row.discovery_source ?? undefined,
  };
}

function savedSettings(db: Database, id: string): CrawlSettings | undefined {
  const run = runRow(db, id);
  return run ? JSON.parse(run.settings) as CrawlSettings : undefined;
}

function pageBounds(params: URLSearchParams, total: number) {
  const size = Math.max(1, Math.min(100, Number.parseInt(params.get("size") ?? "", 10) || 30));
  const page = Math.max(1, Math.min(Math.ceil(total / size) || 1, Number.parseInt(params.get("page") ?? "", 10) || 1));
  return { page, size };
}

function urlConditions(id: string, params: URLSearchParams) {
  const values: SQLInputValue[] = [id];
  let where = "u.run=?";
  const search = params.get("q");
  if (search?.trim()) {
    where += " AND (u.url LIKE ? ESCAPE '\\' OR u.title LIKE ? ESCAPE '\\')";
    values.push(escapeLike(search), escapeLike(search));
  }
  const folder = params.get("folder");
  if (folder) { where += " AND url_directory(u.url)=?"; values.push(folder.slice(0, 4096)); }
  const filter = params.get("filter");
  if (filter === "200") where += " AND u.http=200";
  else if (filter === "redirects") where += " AND u.http BETWEEN 300 AND 399";
  else if (filter === "errors") where += " AND u.http >= 400";
  else if (filter === "unchecked") where += " AND u.state IN ('failed','skipped','cancelled')";
  else if (filter === "eligible") where += " AND u.eligible=1";
  else if (filter === "sitemap") where += " AND EXISTS(SELECT 1 FROM discoveries d WHERE d.run=u.run AND d.url=u.url AND d.kind='sitemap')";
  return { where, values };
}

export function pages(db: Database, id: string, params: URLSearchParams, unpaged = false): ListResult<PageRecord> {
  const { where, values } = urlConditions(id, params);
  const total = one<{ count: number }>(db, `SELECT COUNT(*) count FROM urls u WHERE ${where}`, ...values)!.count;
  const { page, size } = pageBounds(params, total);
  const sort = { url: "u.url", http: "u.http", depth: "u.depth", title: "u.title", inlinks: "inlinks", time: "u.ms" };
  const field = params.get("sort") ?? "";
  const order = Object.hasOwn(sort, field) ? sort[field as keyof typeof sort] : "u.rowid";
  const direction = params.get("dir") === "desc" ? "DESC" : "ASC";
  const sql = `SELECT ${selection} FROM urls u WHERE ${where} ORDER BY ${order} ${direction},u.url`;
  const records = unpaged ? rows<ResultRow>(db, sql, ...values) :
    rows<ResultRow>(db, sql + " LIMIT ? OFFSET ?", ...values, size, (page - 1) * size);
  const settings = savedSettings(db, id);
  return { items: records.map((row) => readPage(row, settings)), total, page, size };
}

interface LinkRow extends Omit<Link, "nofollow"> { nofollow: number }
const linkValue = (row: LinkRow): Link => ({ ...row, nofollow: Boolean(row.nofollow) });

export function evidence(db: Database, id: string, url: string): Evidence | undefined {
  const row = one<ResultRow>(db, `SELECT ${selection} FROM urls u WHERE u.run=? AND u.url=?`, id, url);
  if (!row) return undefined;
  const run = runRow(db, id)!;
  const settings: CrawlSettings = JSON.parse(run.settings);
  const page = readPage(row, settings);
  const outgoingCount = one<{ count: number }>(db, "SELECT COUNT(*) count FROM links WHERE run=? AND source=?", id, url)!.count;
  const origin = settings.mode === "site" ? run.origin : new URL(url).origin;
  const pageNofollow = page.facts?.robots.some((directive) => directive === "nofollow" || directive === "none");
  const outgoing = rows<LinkRow & { followed: number }>(db, `SELECT l.source,l.target,l.original,l.anchor,l.placement,l.nofollow,
    EXISTS(SELECT 1 FROM discoveries d WHERE d.run=l.run AND d.url=l.target AND d.kind='link' AND d.source=l.source) followed
    FROM links l WHERE l.run=? AND l.source=? ORDER BY l.target,l.anchor LIMIT 150`, id, url)
    .map(({ followed, ...link }) => {
      const scopeDecision = followed ? "Discovered from this page"
        : new URL(link.target).origin !== origin ? "Outside crawl origin"
        : !inScope(link.target, origin, settings) ? "Outside starting path"
        : settings.mode === "list" && !settings.expandList ? "List discovery is off"
        : !settings.followNofollow && (pageNofollow || link.nofollow) ? "Nofollow discovery is off"
        : row.depth >= settings.depth ? "At the link depth limit" : "In scope · discovery not recorded";
      return { ...linkValue(link), scopeDecision };
    });
  return {
    ...page,
    incoming: rows<LinkRow>(db, "SELECT source,target,original,anchor,placement,nofollow FROM links WHERE run=? AND target=? ORDER BY source,anchor LIMIT 150", id, url).map(linkValue),
    outgoing,
    outgoingCount,
    headers: JSON.parse(row.headers),
  };
}

export function issueGroups(db: Database, id: string) {
  return rows<IssueGroup>(db, "SELECT code,COUNT(*) count FROM findings WHERE run=? GROUP BY code ORDER BY count DESC,code", id);
}

export function pathGroups(db: Database, id: string) {
  return rows<{ path: string; count: number }>(db, "SELECT url_directory(url) path,COUNT(*) count FROM urls WHERE run=? GROUP BY path ORDER BY count DESC,path LIMIT 80", id);
}

const issueOrder = `CASE ${Object.entries(RULES).filter(([, rule]) => rule.severity !== "notice")
  .map(([key, rule]) => `WHEN code='${key}' THEN ${rule.severity === "error" ? 0 : 1}`).join(" ")} ELSE 2 END`;

export function findings(db: Database, id: string, params: URLSearchParams, unpaged = false): ListResult<Finding> {
  const values: SQLInputValue[] = [id];
  let where = "run=?";
  const code = params.get("code");
  if (code && Object.hasOwn(RULES, code)) { where += " AND code=?"; values.push(code); }
  const query = params.get("q");
  if (query?.trim()) { where += " AND url LIKE ? ESCAPE '\\'"; values.push(escapeLike(query)); }
  const folder = params.get("folder");
  if (folder) { where += " AND url_directory(url)=?"; values.push(folder.slice(0, 4096)); }
  const total = one<{ count: number }>(db, `SELECT COUNT(*) count FROM findings WHERE ${where}`, ...values)!.count;
  const { page, size } = pageBounds(params, total);
  const sql = `SELECT url,code,evidence FROM findings WHERE ${where} ORDER BY ${issueOrder},code,url`;
  return {
    items: unpaged ? rows<Finding>(db, sql, ...values) : rows<Finding>(db, sql + " LIMIT ? OFFSET ?", ...values, size, (page - 1) * size),
    total, page, size,
  };
}

export function resources(db: Database, id: string) {
  return rows<SitemapRecord>(db, "SELECT url,state,detail FROM resources WHERE run=? ORDER BY depth,url", id);
}

export function xmlCandidates(db: Database, id: string) {
  return rows<{ url: string }>(db, "SELECT url FROM urls WHERE run=? AND eligible=1 ORDER BY url", id).map((row) => row.url);
}

type Cell = string | number | null;
function csvCell(value: Cell) {
  const text = String(value ?? "");
  const hardened = typeof value === "string" && /^[\u0000-\u0020]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + hardened.replace(/"/g, '""') + '"';
}

export function csv(headers: string[], records: Iterable<Cell[]>) {
  const iterator = records[Symbol.iterator]();
  const line = (cells: Cell[]) => cells.map(csvCell).join(",") + "\r\n";
  const encoder = new TextEncoder();
  let first = true;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (first) {
        first = false;
        controller.enqueue(encoder.encode("\ufeff" + line(headers)));
        return;
      }
      let chunk = "";
      for (let i = 0; i < 100; i++) {
        const next = iterator.next();
        if (next.done) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
          controller.close();
          return;
        }
        chunk += line(next.value);
      }
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() { iterator.return?.(); },
  });
}

export function makeExport(db: Database, id: string, kind: string, params: URLSearchParams) {
  if (kind === "input-rows") {
    const records = db.prepare(`SELECT i.*, u.http, u.state, u.location FROM input_rows i
      LEFT JOIN urls u ON u.run=i.run AND u.url=i.url WHERE i.run=? ORDER BY i.id`).iterate(id) as Iterable<ReviewedInputRow & {
        http: number | null; state: UrlState | null; location: string | null;
      }>;
    return csv(["Input row ID", "Source", "Source row", "Original input", "Normalized URL", "Input status", "HTTP", "Crawl state", "Redirect"], (function* () {
      for (const row of records) yield [row.id, row.source, row.row, row.value, row.url, row.status, row.http, row.state, row.location];
    })());
  }
  if (kind === "urls") {
    const { where, values } = urlConditions(id, params);
    const records = db.prepare(`SELECT ${selection} FROM urls u WHERE ${where} ORDER BY u.url`).iterate(...values) as Iterable<ResultRow>;
    const settings = savedSettings(db, id);
    return csv(["URL", "HTTP", "State", "Title", "Description", "H1", "Canonical", "Robots", "Depth", "Inlinks", "Discovery", "Redirect", "Response ms", "Bytes", "Missing alt", "Note", "Extraction", "Discovery source URL", "Scope decision", "Input row IDs"], (function* () {
      for (const row of records) {
        const page = readPage(row, settings);
        const fact = page.facts;
        yield [page.url, page.http, page.state, fact?.title ?? null, fact?.description ?? null, fact?.h1.join(" | ") ?? null, fact?.canonical.join(" | ") ?? null,
          fact?.robots.join(", ") ?? null, page.depth, page.inlinks, page.sources.join(", "), page.location, page.ms, page.bytes, fact?.missingAlt ?? null,
          page.note, fact && Object.keys(fact.extracted).length ? JSON.stringify(fact.extracted) : null,
          page.discoverySource ?? null, page.scopeDecision ?? null, row.input_ids];
      }
    })());
  }
  if (kind === "findings") {
    return csv(["URL", "Finding", "Severity", "Evidence", "Suggested action"], (function* () {
      for (const finding of findings(db, id, params, true).items) {
        const rule = RULES[finding.code];
        yield [finding.url, rule.title, rule.severity, finding.evidence, rule.explanation];
      }
    })());
  }
  if (kind === "inlinks") {
    const target = params.get("target") || "";
    const sql = "SELECT source,target,original,anchor,placement,nofollow FROM links WHERE run=?" + (target ? " AND target=?" : "") + " ORDER BY target,source";
    const records = db.prepare(sql).iterate(id, ...(target ? [target] : [])) as Iterable<LinkRow>;
    return csv(["Source URL", "Target URL", "Link value", "Anchor text", "Placement", "Nofollow"], (function* () {
      for (const row of records) yield [row.source, row.target, row.original, row.anchor, row.placement, row.nofollow ? "yes" : "no"];
    })());
  }
}

interface CompareRow {
  url: string; state: string; http: number | null; title: string | null; description: string | null; hash: string | null;
  noindex: number; canonical: string | null; location: string | null; codes: string | null;
}

export interface Change {
  url: string;
  previousUrl?: string;
  type: "discovered" | "not-seen" | "changed";
  fields: string[];
  introduced: Finding["code"][];
  resolved: Finding["code"][];
}

export function compareRuns(db: Database, run: string, baseline: string, params: URLSearchParams) {
  const byPath = params.get("map") === "path";
  const key = (value: string) => {
    const url = new URL(value);
    return byPath ? url.pathname + url.search : value;
  };
  const collect = (id: string) => new Map(rows<CompareRow>(db, `SELECT u.url,u.state,u.http,u.title,u.description,u.hash,u.noindex,u.canonical,u.location,
    (SELECT group_concat(f.code) FROM findings f WHERE f.run=u.run AND f.url=u.url) codes FROM urls u WHERE u.run=? ORDER BY u.url`, id)
    .map((row) => [key(row.url), row]));
  const a = collect(baseline);
  const b = collect(run);
  const changes: Change[] = [];
  const codeList = (row: CompareRow) => (row.codes?.split(",") ?? []) as Finding["code"][];
  const comparisonFields = { state: "Fetch state", http: "HTTP status", title: "Title", description: "Description", hash: "HTML content", noindex: "Noindex", canonical: "Canonical", location: "Redirect target" } as const;
  for (const [url, page] of b) {
    const prior = a.get(url);
    if (!prior) {
      changes.push({ url: page.url, type: "discovered", fields: [], introduced: [], resolved: [] });
      continue;
    }
    const fields = (Object.keys(comparisonFields) as (keyof typeof comparisonFields)[]).filter((field) => {
      const before = prior[field];
      const after = page[field];
      if (byPath && (field === "canonical" || field === "location") && typeof before === "string" && typeof after === "string" &&
          new URL(before).origin === new URL(prior.url).origin && new URL(after).origin === new URL(page.url).origin) {
        return key(before) !== key(after);
      }
      return before !== after;
    }).map((field) => comparisonFields[field]);
    const comparable = page.state === "done" && prior.state === "done";
    const recent = codeList(page);
    const previous = codeList(prior);
    const introduced = comparable ? recent.filter((code) => !previous.includes(code)) : [];
    const resolved = comparable ? previous.filter((code) => !recent.includes(code)) : [];
    if (fields.length || introduced.length || resolved.length) changes.push({ url: page.url, previousUrl: prior.url, type: "changed", fields, introduced, resolved });
  }
  for (const [url, page] of a) {
    if (!b.has(url)) changes.push({ url: page.url, type: "not-seen", fields: [], introduced: [], resolved: [] });
  }
  const query = params.get("q")?.toLowerCase();
  const result = changes.filter((row) => !query || row.url.toLowerCase().includes(query));
  const { page, size } = pageBounds(params, result.length);
  return { items: result.slice((page - 1) * size, page * size), total: result.length, page, size };
}
