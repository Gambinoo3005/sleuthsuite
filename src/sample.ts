import { createQueue, openDatabase, putFindings, storeOutcome, transaction } from "./db.ts";
import type { StoredOutcome } from "./db.ts";
import { extractPage } from "./crawler/extract.ts";
import { auditPage, auditRun } from "./crawler/rules.ts";
import { parseSettings } from "./crawler/urls.ts";

export const SAMPLE_ID = "sample";
export const SAMPLE_SITE = "https://northstar.example";
export const SAMPLE_BROKEN = SAMPLE_SITE + "/guides/old-setup";

const entries = [
  { path: "/", title: "Northstar Studio", description: "Field notes and starter guides.", body: '<main><a href="/guides">Guides</a><a href="/journal">Journal</a><a href="/pricing">Pricing</a></main><footer><a href="/guides/old-setup">Setup guide</a></footer>' },
  { path: "/guides", title: "Guides · Northstar", body: '<main><a href="/guides/getting-started">Getting started</a><a href="/guides/old-setup">Legacy setup</a><a href="/docs">Docs</a></main>' },
  { path: "/guides/getting-started", title: "Getting started · Northstar", body: '<main><a href="/guides/old-setup">Classic setup guide</a><img src="/map.png"><img src="/decor.png" alt=""></main>' },
  { path: "/guides/old-setup", http: 404 },
  { path: "/docs", http: 301, target: "/documentation" },
  { path: "/documentation", http: 301, target: "/guides/getting-started" },
  { path: "/journal", title: "Journal · Northstar", body: '<main><a href="/journal/field-notes">Field notes</a><a href="/journal/release-notes">Release notes</a></main>' },
  { path: "/journal/field-notes", title: "Studio notes · Northstar", body: "<p>Observations from the field.</p>" },
  { path: "/journal/release-notes", title: "Studio notes · Northstar", body: "<p>Version history for our work.</p>" },
  { path: "/pricing", title: "Plans · Northstar", body: '<main><a href="/signup">Sign up</a></main><footer><a href="/guides/old-setup">Setup guide</a></footer>' },
  { path: "/signup", title: "", body: '<p>Start your trial.</p>' },
  { path: "/archive", title: "Archive · Northstar", body: "<p>Prior releases.</p>", sitemap: true },
  { path: "/preview", title: "Preview · Northstar", body: "<p>Preview notes.</p>", sitemap: true, noindex: true },
  { path: "/internal", blocked: true, sitemap: true },
];

let db: ReturnType<typeof openDatabase> | undefined;
export function sampleDatabase() {
  if (db) return db;
  const sample = openDatabase(":memory:");
  transaction(sample, () => {
    const settings = parseSettings({ urls: SAMPLE_SITE, name: "Northstar Studio", rate: 2 });
    sample.prepare(`INSERT INTO runs(id,settings,state,origin,created_at,started_at,finished_at,issues_ready)
      VALUES(?,?,'complete',?,0,0,1820,1)`).run(SAMPLE_ID, JSON.stringify(settings), SAMPLE_SITE);
    const queue = createQueue(sample, SAMPLE_ID, settings.limit);
    for (const entry of entries) {
      const url = new URL(entry.path, SAMPLE_SITE).href;
      queue(url, entry.path === "/" ? 0 : entry.path.split("/").length - 1, 0, entry.sitemap ? "sitemap" : entry.path === "/" ? "seed" : "link", "");
    }
    for (const entry of entries) {
      const url = new URL(entry.path, SAMPLE_SITE).href;
      const status = entry.http ?? 200;
      const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
      if (entry.noindex) headers["x-robots-tag"] = "noindex";
      if (entry.target) headers.location = entry.target;
      let result: StoredOutcome = { state: "done", http: status, ms: 30 + entry.path.length * 5, headers, type: "text/html" };
      if (entry.blocked) result = { state: "skipped", issue: "robots", note: "Disallowed for SleuthSuite by robots.txt." };
      else if (entry.target) result.location = new URL(entry.target, SAMPLE_SITE).href;
      else if (status === 200) {
        const body = Buffer.from(`<!doctype html><html><head><title>${entry.title}</title><meta name="description" content="${entry.description ?? ""}"></head><body><h1>${entry.title || "Get started"}</h1>${entry.body}</body></html>`);
        Object.assign(result, extractPage(body, url, headers, []), { noindex: Boolean(entry.noindex), bytes: body.length });
      }
      storeOutcome(sample, SAMPLE_ID, url, result);
      putFindings(sample, SAMPLE_ID, auditPage(url, result));
    }
    sample.prepare("INSERT INTO resources(run,url,depth,state,detail) VALUES(?,?,0,'done',?)")
      .run(SAMPLE_ID, SAMPLE_SITE + "/sitemap.xml", "3 of 3 URL entries accepted");
    auditRun(sample, SAMPLE_ID);
  });
  db = sample;
  return sample;
}
