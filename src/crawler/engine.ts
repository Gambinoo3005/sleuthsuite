import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import robotsParser from "robots-parser";
import { createQueue, one, putFindings, rows, storeOutcome, transaction } from "../db.ts";
import type { Database, StoredOutcome } from "../db.ts";
import type { CrawlSettings, RunState } from "../model.ts";
import { extractPage, isNoindex, renderEvidence } from "./extract.ts";
import { fetchHttp } from "./http.ts";
import type { HttpResult } from "./http.ts";
import { renderPage } from "./render.ts";
import { auditPage, auditRun } from "./rules.ts";
import { inScope, isHttpsUpgrade, normalizeUrl, USER_AGENT } from "./urls.ts";
import { parseSitemap } from "./xml.ts";

interface Job { url: string; depth: number; hop: number }
interface Resource { url: string; depth: number }
interface ActiveRun { id: string; state: RunState; origin: string; settings: string }
interface Policy {
  allows: (url: string) => boolean;
  sitemaps: string[];
  unavailable?: string;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const MAX_SITEMAPS = 20;

export class CrawlWorker {
  private readonly owner = randomUUID();
  private readonly policies = new Map<string, Policy>();
  private readonly nextRequest = new Map<string, number>();
  private policyRun = "";
  private acquired = false;
  private lockTimer: NodeJS.Timeout | undefined;
  private readonly abort = new AbortController();

  constructor(privateDb: Database, privateOptions: { fixtureOrigin?: string } = {}) {
    this.db = privateDb;
    this.fixtureOrigin = privateOptions.fixtureOrigin;
  }

  private readonly db: Database;
  private readonly fixtureOrigin?: string;

  get isStopping() { return this.abort.signal.aborted; }

  private renewLock() {
    const now = Date.now();
    return this.db.prepare(`INSERT INTO worker_lock(key,owner,until) VALUES(1,?,?)
      ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,until=excluded.until
      WHERE worker_lock.owner=excluded.owner OR worker_lock.until<?`).run(this.owner, now + 18_000, now).changes === 1;
  }

  private acquire() {
    if (this.acquired) return true;
    if (!this.renewLock()) return false;
    this.acquired = true;
    this.db.prepare("UPDATE urls SET state='queued' WHERE state='fetching'").run();
    this.lockTimer = setInterval(() => {
      try {
        if (!this.renewLock()) this.abort.abort();
      } catch (error) {
        console.error("SleuthSuite could not renew the worker lock:", errorMessage(error));
      }
    }, 4000);
    this.lockTimer.unref();
    return true;
  }

  stop() {
    this.abort.abort();
    clearInterval(this.lockTimer);
  }

  release() {
    this.stop();
    if (this.acquired) this.db.prepare("DELETE FROM worker_lock WHERE owner=?").run(this.owner);
  }

  private async request(url: string, rate: number, maxBytes?: number, externalSignal?: AbortSignal): Promise<HttpResult> {
    const origin = new URL(url).origin;
    const signal = externalSignal ? AbortSignal.any([this.abort.signal, externalSignal]) : this.abort.signal;
    const isFixture = origin === this.fixtureOrigin;
    for (let attempt = 0; ; attempt++) {
      if (!isFixture) {
        // Start spacing applies to pages, robots, sitemaps and browser dependencies together.
        const start = Math.max(Date.now(), this.nextRequest.get(origin) ?? 0);
        this.nextRequest.set(origin, start + Math.ceil(1000 / rate));
        const wait = start - Date.now();
        if (wait > 0) await delay(wait, undefined, { signal });
      }
      const result = await fetchHttp(url, { maxBytes, signal, testOrigin: this.fixtureOrigin });
      if (![429, 503].includes(result.status) || attempt >= 2) return result;
      const after = result.headers["retry-after"];
      const retry = after && /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after ?? "") - Date.now();
      const wait = Math.min(15_000, Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry : 0));
      if (isFixture) continue;
      this.nextRequest.set(origin, Math.max(this.nextRequest.get(origin) ?? 0, Date.now() + wait));
    }
  }

  private async policy(origin: string, rate: number): Promise<Policy> {
    const existing = this.policies.get(origin);
    if (existing) return existing;
    const initial = origin + "/robots.txt";
    let url = initial;
    let policy: Policy;
    try {
      let response = await this.request(url, rate, 512 * 1024);
      for (let hop = 0; redirectStatuses.has(response.status) && hop < 5; hop++) {
        const target = normalizeUrl(response.headers.location ?? "", url);
        if (!target || (new URL(target).origin !== origin && !isHttpsUpgrade(url, target))) break;
        url = target;
        response = await this.request(url, rate, 512 * 1024);
      }
      if (response.status >= 200 && response.status < 300) {
        const parser = robotsParser(initial, response.body.toString("utf8"));
        policy = { allows: (target) => parser.isAllowed(target, USER_AGENT) !== false, sitemaps: parser.getSitemaps() };
      } else if (response.status >= 400 && response.status < 500 && ![401, 403, 429].includes(response.status)) {
        policy = { allows: () => true, sitemaps: [] };
      } else {
        policy = { allows: () => false, sitemaps: [], unavailable: `Robots policy could not be verified (HTTP ${response.status}).` };
      }
    } catch (error) {
      policy = { allows: () => false, sitemaps: [], unavailable: `Robots policy could not be verified: ${errorMessage(error)}` };
    }
    this.policies.set(origin, policy);
    return policy;
  }

  private async audit(job: Job, settings: CrawlSettings): Promise<StoredOutcome> {
    const origin = new URL(job.url).origin;
    const policy = await this.policy(origin, settings.rate);
    if (policy.unavailable) return { state: "skipped", issue: "robots-unavailable", note: policy.unavailable };
    if (!policy.allows(job.url)) return { state: "skipped", issue: "robots", note: "Disallowed for SleuthSuite by robots.txt." };
    let response: HttpResult;
    try {
      response = await this.request(job.url, settings.rate);
    } catch (error) {
      return { state: "failed", issue: "request", note: errorMessage(error) };
    }
    const type = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const result: StoredOutcome = { state: "done", http: response.status, type, ms: response.ms, bytes: response.body.length, headers: response.headers };
    if (redirectStatuses.has(response.status)) {
      const target = normalizeUrl(response.headers.location ?? "", job.url);
      if (target) result.location = target;
      if (!target) result.issue = "redirect-invalid";
      else if (job.hop >= 10) result.issue = "redirect-limit";
      return result;
    }
    if (response.status === 200 && (/^(text\/html|application\/xhtml\+xml)$/.test(type) ||
        (!type && /^\s*<(?:!doctype\s+html|html|head|body)/i.test(response.body.subarray(0, 512).toString())))) {
      try {
        let page = extractPage(response.body, job.url, response.headers, settings.extract);
        if (settings.rendering === "chromium") {
          result.raw = renderEvidence(page.facts, page.links);
          try {
            const rendered = await renderPage(job.url, response, (url, maxBytes, signal) => {
              if (!policy.allows(url)) return Promise.reject(new Error("Subresource blocked by robots.txt."));
              return this.request(url, settings.rate, maxBytes, signal);
            });
            const final = extractPage(rendered.body, job.url, { ...response.headers, "content-type": "text/html; charset=utf-8" }, settings.extract);
            // Preserve source links that were replaced in the rendered document.
            page = { ...final, links: [...new Map([...page.links, ...final.links].map((link) => [JSON.stringify(link), link])).values()], truncated: final.truncated || page.truncated };
            if (rendered.incomplete) {
              result.issue = "render";
              result.note = "Some scripts or requests were blocked or exceeded the render budget.";
            }
          } catch (error) {
            result.issue = "render";
            result.note = errorMessage(error).split("\n")[0].slice(0, 400);
          }
        }
        Object.assign(result, page, { noindex: isNoindex(page.facts) });
      } catch (error) {
        result.state = "failed";
        result.issue = "parse";
        result.note = errorMessage(error);
      }
    } else if (/^\s*(?:noindex|none)(?=\s|,|$)|,\s*(?:noindex|none)(?=\s|,|$)/i.test(response.headers["x-robots-tag"] ?? "")) {
      result.noindex = true;
    }
    return result;
  }

  private record(run: ActiveRun, settings: CrawlSettings, job: Job, result: StoredOutcome) {
    transaction(this.db, () => {
      storeOutcome(this.db, run.id, job.url, result);
      putFindings(this.db, run.id, auditPage(job.url, result));
      const queue = createQueue(this.db, run.id, settings.limit);
      if (result.location && result.issue !== "redirect-limit") {
        const upgrade = settings.mode === "site" && job.url === settings.seeds[0] && isHttpsUpgrade(job.url, result.location);
        if (upgrade) {
          run.origin = new URL(result.location).origin;
          this.db.prepare("UPDATE runs SET origin=? WHERE id=?").run(run.origin, run.id);
        }
        const origin = settings.mode === "list" ? new URL(job.url).origin : run.origin;
        if (inScope(result.location, origin, settings)) queue(result.location, job.depth, job.hop + 1, "redirect", job.url);
      }
      if (settings.mode === "list" && !settings.expandList) return;
      const origin = settings.mode === "list" ? new URL(job.url).origin : run.origin;
      const pageNofollow = result.facts?.robots.some((directive) => directive === "nofollow" || directive === "none");
      for (const link of result.links ?? []) {
        if (!inScope(link.target, origin, settings) ||
            (!settings.followNofollow && (link.nofollow || pageNofollow))) continue;
        if (job.depth < settings.depth) queue(link.target, job.depth + 1, 0, "link", job.url);
        else if (!one(this.db, "SELECT 1 FROM urls WHERE run=? AND url=?", run.id, link.target)) {
          this.db.prepare("UPDATE runs SET truncated=1 WHERE id=?").run(run.id);
          break;
        }
      }
    });
  }

  private addResource(run: ActiveRun, url: string, depth: number) {
    if (new URL(url).origin !== run.origin) return false;
    if (depth > 4 || one<{ count: number }>(this.db, "SELECT COUNT(*) count FROM resources WHERE run=?", run.id)!.count >= MAX_SITEMAPS) {
      this.db.prepare("UPDATE runs SET truncated=1 WHERE id=?").run(run.id);
      return false;
    }
    this.db.prepare("INSERT OR IGNORE INTO resources(run,url,depth) VALUES(?,?,?)").run(run.id, url, depth);
    return true;
  }

  private async sitemap(run: ActiveRun, settings: CrawlSettings) {
    if (!one(this.db, "SELECT 1 FROM resources WHERE run=? LIMIT 1", run.id)) {
      const policy = await this.policy(run.origin, settings.rate);
      const explicit = settings.sitemap && new URL(settings.sitemap).origin !== run.origin && isHttpsUpgrade(settings.seeds[0], run.origin)
        ? run.origin + new URL(settings.sitemap).pathname + new URL(settings.sitemap).search : settings.sitemap;
      const locations = [...new Set([explicit, ...policy.sitemaps].map((url) => normalizeUrl(url, run.origin))
        .filter((url): url is string => Boolean(url) && new URL(url!).origin === run.origin))];
      if (!locations.length) locations.push(run.origin + "/sitemap.xml");
      transaction(this.db, () => {
        for (const url of locations.slice(0, MAX_SITEMAPS + 1)) this.addResource(run, url, 0);
      });
    }
    const job = one<Resource>(this.db, "SELECT url,depth FROM resources WHERE run=? AND state='queued' ORDER BY depth,url LIMIT 1", run.id);
    if (!job) return false;
    const write = (state: string, detail: string) => this.db.prepare("UPDATE resources SET state=?,detail=? WHERE run=? AND url=?").run(state, detail, run.id, job.url);
    try {
      const policy = await this.policy(run.origin, settings.rate);
      let target = job.url;
      const seen = new Set<string>();
      while (true) {
        if (policy.unavailable || !policy.allows(target)) throw new Error(policy.unavailable ?? "Sitemap blocked by robots.txt.");
        if (seen.size >= 5 || seen.has(target)) throw new Error("Sitemap redirect exceeded its allowed path.");
        seen.add(target);
        const response = await this.request(target, settings.rate, 8 * 1024 * 1024);
        if (redirectStatuses.has(response.status)) {
          const redirect = normalizeUrl(response.headers.location ?? "", target);
          if (!redirect || new URL(redirect).origin !== run.origin) throw new Error("Sitemap redirect points outside the crawl origin.");
          target = redirect;
          continue;
        }
        if (response.status !== 200) { write(response.status === 404 ? "missing" : "failed", `HTTP ${response.status}`); break; }
        const xml = parseSitemap(response.body);
        transaction(this.db, () => {
          const queue = createQueue(this.db, run.id, settings.limit);
          let accepted = 0;
          for (const value of xml.urls) {
            const url = normalizeUrl(value, target);
            if (!url) continue;
            if (xml.index) accepted += Number(this.addResource(run, url, job.depth + 1));
            else if (inScope(url, run.origin, settings)) accepted += Number(queue(url, 0, 0, "sitemap", job.url));
          }
          write("done", `${accepted} of ${xml.urls.length} ${xml.index ? "child sitemaps" : "URL entries"} accepted`);
        });
        break;
      }
    } catch (error) {
      if (!this.abort.signal.aborted) write("failed", errorMessage(error));
    }
    return true;
  }

  async step() {
    if (this.isStopping || !this.acquire()) return false;
    const run = one<ActiveRun>(this.db, "SELECT id,state,origin,settings FROM runs WHERE state IN ('queued','running','pausing','stopping') LIMIT 1");
    if (!run) return false;
    if (this.policyRun !== run.id) {
      this.policies.clear();
      this.nextRequest.clear();
      this.policyRun = run.id;
    }
    if (run.state === "pausing") {
      this.db.prepare("UPDATE runs SET state='paused' WHERE id=? AND state='pausing'").run(run.id);
      return true;
    }
    if (run.state === "stopping") {
      transaction(this.db, () => {
        this.db.prepare("UPDATE urls SET state='cancelled' WHERE run=? AND state IN ('queued','fetching')").run(run.id);
        auditRun(this.db, run.id);
        this.db.prepare("UPDATE runs SET state='stopped', finished_at=?, issues_ready=1 WHERE id=?").run(Date.now(), run.id);
      });
      return true;
    }
    const settings = JSON.parse(run.settings) as CrawlSettings;
    if (run.state === "queued") {
      const change = this.db.prepare("UPDATE runs SET state='running', started_at=COALESCE(started_at,?) WHERE id=? AND state='queued'").run(Date.now(), run.id);
      if (!change.changes) return true;
    }
    const job = one<Job>(this.db, "SELECT url,depth,hop FROM urls WHERE run=? AND state='queued' ORDER BY depth,hop,rowid LIMIT 1", run.id);
    try {
      if (job) {
        this.db.prepare("UPDATE urls SET state='fetching' WHERE run=? AND url=?").run(run.id, job.url);
        const result = await this.audit(job, settings);
        if (!this.isStopping) this.record(run, settings, job, result);
        return true;
      }
      if (settings.mode === "site" && await this.sitemap(run, settings)) return true;
      transaction(this.db, () => {
        const update = this.db.prepare("UPDATE runs SET state='complete',finished_at=?,issues_ready=1 WHERE id=? AND state='running'")
          .run(Date.now(), run.id);
        if (update.changes) auditRun(this.db, run.id);
      });
    } catch (error) {
      this.db.prepare("UPDATE urls SET state='failed',issue='worker',note=? WHERE run=? AND state='fetching'").run(errorMessage(error), run.id);
      this.db.prepare("UPDATE runs SET state='failed',message=?,finished_at=? WHERE id=?").run(errorMessage(error), Date.now(), run.id);
    }
    return true;
  }
}
