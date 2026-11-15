import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.ts";
import { CrawlWorker } from "../src/crawler/engine.ts";
import { closeRenderer } from "../src/crawler/render.ts";
import { fetchHttp, isPublicAddress } from "../src/crawler/http.ts";
import { redirectTrace } from "../src/crawler/rules.ts";
import { normalizeUrl, parseSettings } from "../src/crawler/urls.ts";
import { createRun, getRun, openDatabase, setRunState } from "../src/db.ts";
import { compareRuns, evidence, findings, makeExport, pages, resources, xmlCandidates } from "../src/queries.ts";

test("uses HTTPS for complete bare domains and preserves explicit HTTP", () => {
  assert.deepEqual(parseSettings({ urls: "example.com" }).seeds, ["https://example.com/"]);
  const rows = "www.example.com.au/shop?ref=one\nexample.ph\nhttp://example.com\nexample.com";
  assert.deepEqual(parseSettings({ mode: "list", urls: rows }).seeds, [
    "https://www.example.com.au/shop?ref=one", "https://example.ph/", "http://example.com/", "https://example.com/",
  ]);
  for (const input of ["example", "example..com", "/example.com", "localhost", "127.0.0.1", "ftp://example.com"]) {
    assert.throws(() => parseSettings({ urls: input }), /Enter a complete domain/);
  }
});

test("crawl, pause and recover evidence across a sitemap, redirects and robots rules", async () => {
  const site = await fixture();
  const db = openDatabase(":memory:");
  let worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
  try {
    const id = createRun(db, parseSettings({ urls: site.origin, extract: [{ name: "Section", selector: "article h2" }] }));
    await worker.step();
    assert.equal(setRunState(db, id, "pause"), true);
    await worker.step();
    assert.equal(getRun(db, id)?.state, "paused");
    assert.equal(await worker.step(), false);
    db.prepare("UPDATE urls SET state='fetching' WHERE run=? AND url=?").run(id, site.origin + "/missing");
    worker.release();
    worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
    assert.equal(setRunState(db, id, "resume"), true);
    while (await worker.step()) { /* drain the persisted queue */ }
    assert.equal(getRun(db, id)?.state, "complete");
    assert.equal(getRun(db, id)?.queued, 0);
    assert.equal(site.hits.has("/blocked"), false);
    assert.equal(site.hits.has("/nofollow"), false);
    assert.equal(site.hits.has("/fixture.js"), false);
    assert.equal(site.hits.get("/retry"), 3);
    assert.equal(site.hits.get("/missing"), 1);
    const missing = evidence(db, id, site.origin + "/missing")!;
    assert.equal(missing.http, 404);
    assert.deepEqual(missing.incoming.map((link) => [link.anchor, link.placement]), [["missing", "main"]]);
    assert.deepEqual(new Set(missing.sources), new Set(["link", "sitemap"]));
    const issueCodes = new Set(findings(db, id, new URLSearchParams(), true).items.map((item) => item.code));
    for (const code of ["broken", "redirectChain", "redirectLoop", "blocked", "duplicateTitle", "duplicateBody", "noindex",
      "badCanonical", "badSitemap", "sitemapOnly", "missingAlt", "missingHreflangReturn", "invalidJsonLd"] as const) assert.ok(issueCodes.has(code), code);
    assert.equal(resources(db, id).filter((item) => item.state === "done").length, 2);
    assert.equal(redirectTrace(db, id, site.origin + "/redirect").destination, site.origin + "/final");
    assert.deepEqual(evidence(db, id, site.origin + "/duplicate-a")?.facts?.extracted.Section, ["Extract this"]);
    assert.ok(xmlCandidates(db, id).includes(site.origin + "/orphan"));
    assert.ok(!xmlCandidates(db, id).includes(site.origin + "/noindex"));
    const filtered = pages(db, id, new URLSearchParams({ q: "duplicate", filter: "200" }));
    assert.equal(filtered.total, 2);
    const csv = await new Response(makeExport(db, id, "urls", new URLSearchParams({ q: "duplicate" }))).text();
    assert.equal(csv.split("\r\n").filter(Boolean).length, 3);
    const second = createRun(db, parseSettings({ mode: "list", urls: site.origin + "/final" }));
    while (await worker.step()) { /* targeted recheck */ }
    const changes = compareRuns(db, second, id, new URLSearchParams());
    assert.ok(changes.items.some((item) => item.type === "not-seen" && item.url.endsWith("/missing")));
  } finally {
    worker.release();
    db.close();
    await site.close();
  }
});

test("enforces scope, page limits, stop semantics and nonpublic network boundary", async () => {
  const site = await fixture();
  const db = openDatabase(":memory:");
  const worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
  try {
    assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
    assert.equal(isPublicAddress("169.254.169.254"), false);
    assert.equal(isPublicAddress("8.8.8.8"), true);
    await assert.rejects(fetchHttp(site.origin), /nonpublic/);
    assert.throws(() => parseSettings({ urls: "file:///C:/Windows" }), /valid HTTP/);
    assert.equal(normalizeUrl("/?z=1&a=2#section", site.origin), `${site.origin}/?z=1&a=2`);
    const id = createRun(db, parseSettings({ urls: site.origin, limit: 2 }));
    await worker.step();
    assert.equal(getRun(db, id)?.discovered, 2);
    assert.equal(getRun(db, id)?.truncated, true);
    assert.equal(setRunState(db, id, "stop"), true);
    await worker.step();
    assert.equal(getRun(db, id)?.state, "stopped");
    assert.equal(getRun(db, id)?.cancelled, 1);
    const scoped = createRun(db, parseSettings({ urls: site.origin + "/redirect", scope: "path" }));
    while (await worker.step()) { /* redirect points outside the starting path */ }
    assert.equal(getRun(db, scoped)?.discovered, 1);
    assert.equal(evidence(db, scoped, site.origin + "/redirect")?.location, site.origin + "/second");
    assert.equal(site.hits.has("/second"), false);
  } finally {
    worker.release();
    db.close();
    await site.close();
  }
});

test("renders a page with same-origin JavaScript and keeps its original evidence", { skip: !process.env.SLEUTHSUITE_BROWSER_TEST }, async () => {
  const site = await fixture();
  const db = openDatabase(":memory:");
  const worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
  try {
    const id = createRun(db, parseSettings({ urls: site.origin + "/render", limit: 2, rendering: "chromium" }));
    while (await worker.step()) { /* drain the rendered crawl */ }
    const page = evidence(db, id, site.origin + "/render");
    assert.equal(page?.raw?.title, "Before scripts");
    assert.equal(page?.facts?.title, "After scripts", page?.note ?? "");
    assert.ok(page?.outgoing.some((link) => link.target.endsWith("/js-only")));
    assert.equal(evidence(db, id, site.origin + "/js-only")?.http, 200);
  } finally {
    worker.release();
    await closeRenderer();
    db.close();
    await site.close();
  }
});
