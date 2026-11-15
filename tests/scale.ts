import assert from "node:assert/strict";
import { mkdtempSync, rmSync, rmdirSync, statSync, existsSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { CrawlWorker } from "../src/crawler/engine.ts";
import { parseSettings } from "../src/crawler/urls.ts";
import { createRun, getRun, openDatabase } from "../src/db.ts";
import { pages } from "../src/queries.ts";

const size = 10_000;
const site = await fixture(size);
const dir = mkdtempSync(join(tmpdir(), "sleuthsuite-scale-"));
const path = join(dir, "bench.sqlite");
const db = openDatabase(path);
const worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
const samples: number[] = [];
let peak = process.memoryUsage().rss;
let steps = 0;
try {
  const id = createRun(db, parseSettings({ urls: site.origin, limit: size }));
  const start = performance.now();
  while (await worker.step()) {
    if (++steps % 100 === 0) {
      const sampleStart = performance.now();
      const results = pages(db, id, new URLSearchParams({ q: "Page", filter: "200", sort: "inlinks", page: "2" }));
      assert.ok(results.items.length > 0);
      samples.push(performance.now() - sampleStart);
      peak = Math.max(peak, process.memoryUsage().rss);
    }
  }
  const run = getRun(db, id);
  assert.equal(run?.state, "complete");
  assert.equal(run?.checked, size);
  assert.equal(run?.truncated, false);
  const p95 = samples.sort((a, b) => a - b)[Math.floor(samples.length * .95)];
  assert.ok(p95 < 500, `p95 query took ${p95.toFixed(1)} ms`);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify({
    checked: run.checked, elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(2)), peakRssMiB: Math.round(peak / 1048576),
    databaseMiB: Number((statSync(path).size / 1048576).toFixed(2)), p95FilteredReadMs: Number(p95.toFixed(2)),
    platform: process.platform, cpu: cpus()[0]?.model, ramGiB: Math.round(totalmem() / 1073741824),
    note: "HTML fixture on loopback with artificial rate limiting disabled",
  }));
} finally {
  worker.release();
  db.close();
  await site.close();
  if (existsSync(path)) rmSync(path);
  for (const suffix of ["-shm", "-wal"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  rmdirSync(dir);
}
