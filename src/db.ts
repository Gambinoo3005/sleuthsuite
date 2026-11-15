import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { CrawlSettings, Discovery, Finding, Link, PageFacts, RenderEvidence, RunState, RunSummary, UrlState } from "./model.ts";

export type Database = DatabaseSync;

let connection: Database | undefined;
export function database(): Database {
  if (connection) return connection;
  const dir = process.env.SLEUTHSUITE_DATA_DIR || join(process.cwd(), ".sleuthsuite");
  mkdirSync(dir, { recursive: true });
  connection = openDatabase(join(dir, "sleuthsuite.sqlite"));
  return connection;
}

export function openDatabase(path: string) {
  const db = new DatabaseSync(path);
  db.function("url_directory", { deterministic: true }, (value) => {
    if (typeof value !== "string") return "/";
    const first = new URL(value).pathname.split("/")[1];
    return first ? "/" + first : "/";
  });
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, settings TEXT NOT NULL, state TEXT NOT NULL,
      origin TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
      message TEXT, truncated INTEGER NOT NULL DEFAULT 0, issues_ready INTEGER NOT NULL DEFAULT 0,
      discovered INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS only_one_active ON runs((1))
      WHERE state IN ('queued', 'running', 'pausing', 'paused', 'stopping');
    CREATE TABLE IF NOT EXISTS urls (
      run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, url TEXT NOT NULL,
      depth INTEGER NOT NULL, hop INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'queued', http INTEGER, type TEXT NOT NULL DEFAULT '', ms INTEGER,
      bytes INTEGER NOT NULL DEFAULT 0, issue TEXT, note TEXT,
      location TEXT, headers TEXT NOT NULL DEFAULT '{}', facts TEXT, raw TEXT,
      title TEXT, description TEXT, hash TEXT, eligible INTEGER NOT NULL DEFAULT 0,
      noindex INTEGER NOT NULL DEFAULT 0, canonical TEXT,
      PRIMARY KEY(run, url)
    );
    CREATE TRIGGER IF NOT EXISTS count_url AFTER INSERT ON urls BEGIN
      UPDATE runs SET discovered=discovered+1 WHERE id=new.run;
    END;
    CREATE INDEX IF NOT EXISTS queue_urls ON urls(run, state, depth, hop);
    CREATE INDEX IF NOT EXISTS urls_status ON urls(run, http);
    CREATE INDEX IF NOT EXISTS urls_title ON urls(run, eligible, title);
    CREATE INDEX IF NOT EXISTS urls_description ON urls(run, eligible, description);
    CREATE INDEX IF NOT EXISTS urls_hash ON urls(run, eligible, hash);
    CREATE TABLE IF NOT EXISTS discoveries (
      run TEXT NOT NULL, url TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL,
      PRIMARY KEY(run, url, kind, source),
      FOREIGN KEY(run, url) REFERENCES urls(run, url) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS links (
      run TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL,
      original TEXT NOT NULL, anchor TEXT NOT NULL, placement TEXT NOT NULL, nofollow INTEGER NOT NULL,
      UNIQUE(run, source, target, original, anchor, placement, nofollow),
      FOREIGN KEY(run, source) REFERENCES urls(run, url) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS link_targets ON links(run, target, source);
    CREATE TABLE IF NOT EXISTS alternates (
      run TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, lang TEXT NOT NULL,
      PRIMARY KEY(run, source, target, lang),
      FOREIGN KEY(run, source) REFERENCES urls(run, url) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS findings (
      run TEXT NOT NULL, url TEXT NOT NULL, code TEXT NOT NULL, evidence TEXT NOT NULL,
      PRIMARY KEY(run, code, url),
      FOREIGN KEY(run, url) REFERENCES urls(run, url) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS finding_urls ON findings(run, url);
    CREATE TABLE IF NOT EXISTS resources (
      run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      url TEXT NOT NULL, depth INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued', detail TEXT,
      PRIMARY KEY(run, url)
    );
    CREATE TABLE IF NOT EXISTS worker_lock (
      key INTEGER PRIMARY KEY CHECK(key=1), owner TEXT NOT NULL, until INTEGER NOT NULL
    );
  `);
  return db;
}

export const one = <T>(db: Database, sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).get(...params) as T | undefined;

export const rows = <T>(db: Database, sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).all(...params) as T[];

export function transaction<T>(db: Database, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

interface RunRow {
  id: string; settings: string; state: RunState; origin: string; created_at: number;
  started_at: number | null; finished_at: number | null; message: string | null;
  truncated: number; issues_ready: number; discovered: number;
}

export function runRow(db: Database, id: string) {
  return one<RunRow>(db, "SELECT * FROM runs WHERE id=?", id);
}

export function createRun(db: Database, settings: CrawlSettings) {
  return transaction(db, () => {
    const id = randomUUID();
    db.prepare("INSERT INTO runs(id,settings,state,origin,created_at) VALUES(?,?,'queued',?,?)")
      .run(id, JSON.stringify(settings), new URL(settings.seeds[0]).origin, Date.now());
    const queue = createQueue(db, id, settings.limit);
    for (const url of settings.seeds) queue(url, 0, 0, "seed", "");
    return id;
  });
}

export function createQueue(db: Database, run: string, limit: number) {
  let count = one<{ discovered: number }>(db, "SELECT discovered FROM runs WHERE id=?", run)!.discovered;
  const find = db.prepare("SELECT depth,hop,state FROM urls WHERE run=? AND url=?");
  const insert = db.prepare("INSERT INTO urls(run,url,depth,hop) VALUES(?,?,?,?)");
  const improve = db.prepare("UPDATE urls SET depth=?,hop=? WHERE run=? AND url=? AND state='queued'");
  const discovery = db.prepare("INSERT OR IGNORE INTO discoveries(run,url,kind,source) VALUES(?,?,?,?)");
  let markedTruncated = false;
  return (url: string, depth: number, hop: number, kind: Discovery, source: string) => {
    const existing = find.get(run, url) as { depth: number; hop: number; state: UrlState } | undefined;
    if (!existing) {
      if (count >= limit) {
        if (!markedTruncated) db.prepare("UPDATE runs SET truncated=1 WHERE id=?").run(run);
        markedTruncated = true;
        return false;
      }
      insert.run(run, url, depth, hop);
      count++;
    } else if (existing.state === "queued" && (depth < existing.depth || (depth === existing.depth && hop < existing.hop))) {
      improve.run(depth, hop, run, url);
    }
    discovery.run(run, url, kind, source);
    return true;
  };
}

function summary(db: Database, row: RunRow): RunSummary {
  const counts = Object.fromEntries(rows<{ state: UrlState; count: number }>(db,
    "SELECT state,COUNT(*) count FROM urls WHERE run=? GROUP BY state", row.id).map(({ state, count }) => [state, count]));
  return {
    id: row.id, settings: JSON.parse(row.settings) as CrawlSettings, state: row.state, origin: row.origin,
    createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
    message: row.message, truncated: Boolean(row.truncated), issuesReady: Boolean(row.issues_ready),
    discovered: row.discovered, checked: counts.done ?? 0,
    queued: (counts.queued ?? 0) + (counts.fetching ?? 0), failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0, cancelled: counts.cancelled ?? 0,
    findings: one<{ count: number }>(db, "SELECT COUNT(*) count FROM findings WHERE run=?", row.id)!.count,
  };
}

export function getRun(db: Database, id: string): RunSummary | undefined {
  const row = runRow(db, id);
  return row && summary(db, row);
}

export function recentRuns(db: Database, limit = 50): RunSummary[] {
  return rows<RunRow>(db, "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", limit).map((row) => summary(db, row));
}

export function setRunState(db: Database, id: string, action: string) {
  const transitions: Record<string, { to: RunState; from: RunState[] }> = {
    pause: { to: "pausing", from: ["queued", "running"] },
    resume: { to: "queued", from: ["paused"] },
    stop: { to: "stopping", from: ["queued", "running", "pausing", "paused"] },
  };
  const transition = Object.hasOwn(transitions, action) ? transitions[action] : undefined;
  if (!transition) return false;
  const from = transition.from.map(() => "?").join(",");
  return db.prepare(`UPDATE runs SET state=?,message=NULL WHERE id=? AND state IN (${from})`)
    .run(transition.to, id, ...transition.from).changes === 1;
}

export interface StoredOutcome {
  state: UrlState;
  http?: number;
  type?: string;
  ms?: number;
  bytes?: number;
  issue?: string;
  note?: string;
  location?: string;
  headers?: Record<string, string>;
  facts?: PageFacts;
  links?: Link[];
  raw?: RenderEvidence;
  noindex?: boolean;
  truncated?: boolean;
}

export function storeOutcome(db: Database, run: string, url: string, result: StoredOutcome) {
  const facts = result.facts;
  const canonical = facts?.canonical[0] ?? null;
  const eligible = Boolean(facts && result.http === 200 && !result.noindex && !facts.invalidCanonical && (!canonical || canonical === url));
  db.prepare(`UPDATE urls SET state=?,http=?,type=?,ms=?,bytes=?,issue=?,note=?,location=?,headers=?,
      facts=?,raw=?,title=?,description=?,hash=?,eligible=?,noindex=?,canonical=? WHERE run=? AND url=?`)
    .run(result.state, result.http ?? null, result.type ?? "", result.ms ?? null, result.bytes ?? 0,
      result.issue ?? null, result.note ?? null, result.location ?? null, JSON.stringify(result.headers ?? {}),
      facts ? JSON.stringify(facts) : null, result.raw ? JSON.stringify(result.raw) : null,
      facts?.title ?? null, facts?.description ?? null, facts?.hash ?? null, Number(eligible), Number(result.noindex ?? false),
      canonical, run, url);
  const links = db.prepare("INSERT OR IGNORE INTO links(run,source,target,original,anchor,placement,nofollow) VALUES(?,?,?,?,?,?,?)");
  for (const link of result.links ?? []) links.run(run, url, link.target, link.original, link.anchor, link.placement, Number(link.nofollow));
  const alternates = db.prepare("INSERT OR IGNORE INTO alternates(run,source,target,lang) VALUES(?,?,?,?)");
  for (const entry of facts?.hreflang ?? []) alternates.run(run, url, entry.url, entry.lang);
  if (result.truncated) db.prepare("UPDATE runs SET truncated=1 WHERE id=?").run(run);
}

export function putFindings(db: Database, run: string, items: Finding[]) {
  const put = db.prepare("INSERT OR REPLACE INTO findings(run,url,code,evidence) VALUES(?,?,?,?)");
  for (const finding of items) put.run(run, finding.url, finding.code, finding.evidence);
}
