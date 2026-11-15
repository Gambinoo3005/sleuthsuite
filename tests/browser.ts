import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { utils as sheetUtils, write as writeWorkbook } from "xlsx";
import { parse as parseCsv } from "csv-parse/sync";
import { CrawlWorker } from "../src/crawler/engine.ts";
import { openDatabase } from "../src/db.ts";
import { fixture } from "./fixture.ts";

const dir = mkdtempSync(join(tmpdir(), "sleuthsuite-browser-"));
const site = await fixture();
const portServer = createServer();
portServer.listen(0, "127.0.0.1");
await once(portServer, "listening");
const port = (portServer.address() as AddressInfo).port;
await new Promise<void>((resolve) => portServer.close(() => resolve()));
const origin = `http://127.0.0.1:${port}`;
const db = openDatabase(join(dir, "sleuthsuite.sqlite"));
const worker = new CrawlWorker(db, { fixtureOrigin: site.origin });
const require = createRequire(import.meta.url);
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  stdio: "inherit",
  env: { ...process.env, SLEUTHSUITE_ORIGIN: origin, SLEUTHSUITE_DATA_DIR: dir, NEXT_TELEMETRY_DISABLED: "1" },
});
const workerLoop = (async () => {
  while (!worker.isStopping) if (!await worker.step()) await delay(45);
})();

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(origin).then((response) => response.ok).catch(() => false);
    if (ready) break;
    if (attempt === 80 || server.exitCode !== null) throw new Error("Build SleuthSuite with pnpm build before running this browser test.");
    await delay(125);
  }
  const wrongOrigin = await fetch(origin + "/api/crawls", { method: "POST", headers: { Origin: "https://example.net", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(wrongOrigin.status, 403);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "Find what broke. See where to fix it." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/landing-desktop.png", fullPage: true });
  await page.goto(origin + "/workspace/crawls/sample");
  await page.getByRole("heading", { name: "Northstar Studio" }).waitFor();
  await page.getByRole("button", { name: "Broken page 1", exact: true }).click();
  await page.getByRole("button", { name: "https://northstar.example/guides/old-setup", exact: true }).click();
  await page.getByRole("button", { name: "Incoming (4)", exact: true }).click();
  await page.getByText("footer · Setup guide", { exact: true }).first().waitFor();
  await page.screenshot({ path: "test-results/sample-evidence.png", fullPage: false });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.goto(origin + "/workspace");
  await page.getByLabel("Starting URL").fill(site.origin);
  await page.getByRole("button", { name: "Start crawl" }).click();
  await page.waitForURL(/\/workspace\/crawls\/[a-f0-9-]{36}$/);
  await page.locator(".state-complete").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Findings", exact: true }).click();
  await page.getByRole("button", { name: "Broken page 1", exact: true }).click();
  await page.getByRole("row").filter({ has: page.getByText("Broken page", { exact: true }) })
    .getByRole("button", { name: site.origin + "/missing", exact: true }).click();
  await page.getByRole("button", { name: "Incoming (1)", exact: true }).click();
  await page.getByText("main · missing", { exact: true }).waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "CSV", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), "sleuthsuite-inlinks.csv");
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.getByRole("button", { name: "Sitemaps", exact: true }).click();
  await page.getByText("4 of 4 URL entries accepted").waitFor();
  const previous = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "URLs", exact: true }).click();
  await page.getByText("Within starting origin", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Run again" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/workspace/crawls/") && !url.pathname.endsWith(previous));
  await page.locator(".state-complete").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByLabel("Compare with").selectOption(previous);
  await page.getByText("No differences match this view.").waitFor();
  await page.goto(origin + "/workspace");
  await page.locator(".saved-run").first().waitFor();
  assert.equal(await page.locator(".saved-run").count(), 2);
  await page.getByRole("button", { name: "URL list", exact: true }).click();
  await page.getByRole("button", { name: "Import URLs", exact: true }).click();
  const workbook = sheetUtils.book_new();
  sheetUtils.book_append_sheet(workbook, sheetUtils.aoa_to_sheet([["URL"], [site.origin + "/missing"]]), "Other");
  sheetUtils.book_append_sheet(workbook, sheetUtils.aoa_to_sheet([["Address"], [site.origin], [site.origin + "/#duplicate"], ["invalid"]]), "Seeds");
  await page.locator("input[type=file]").setInputFiles({ name: "seeds.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: writeWorkbook(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer });
  await page.getByLabel("Worksheet").selectOption("Seeds");
  await page.getByText("1 ready · 1 duplicates · 1 rejected", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add to list" }).click();
  await page.getByText(/Review URL list/).click();
  await page.getByRole("cell", { name: "Rejected", exact: true }).waitFor();
  await page.getByText("Crawl settings", { exact: true }).click();
  await page.getByLabel("Discover links on each starting URL").check();
  await page.getByLabel("URL limit", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Start crawl" }).click();
  await page.waitForURL(/\/workspace\/crawls\/[a-f0-9-]{36}$/);
  await page.locator(".state-complete").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "URLs", exact: true }).click();
  await page.getByText("Same origin as source URL", { exact: true }).first().waitFor();
  const rowExport = await page.request.get(await page.getByRole("link", { name: "Input rows CSV" }).getAttribute("href").then((path) => origin + path));
  const exportedRows = await rowExport.text();
  const parsed = parseCsv(exportedRows, { bom: true, columns: true });
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1]["Input row ID"], "2");
  assert.equal(parsed[1]["Source"], "seeds.xlsx · Seeds");
  assert.equal(parsed[1]["Source row"], "3");
  assert.equal(parsed[1]["Input status"], "duplicate");
  assert.equal(parsed[2]["Original input"], "invalid");
  assert.equal(parsed[2]["Input status"], "rejected");
  const listId = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "Run again" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/workspace/crawls/") && !url.pathname.endsWith(listId));
  await page.locator(".state-complete").waitFor({ timeout: 15_000 });
  const rerunRows = await page.request.get(origin + "/api/crawls/" + page.url().split("/").at(-1) + "/export?kind=input-rows");
  assert.equal(await rerunRows.text(), exportedRows);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "test-results/landing-mobile.png", fullPage: true });
  await page.goto(origin + "/workspace/crawls/sample");
  await page.getByRole("heading", { name: "Northstar Studio" }).waitFor();
  await page.getByRole("region", { name: "Audit findings" }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "test-results/report-mobile.png", fullPage: false });
  assert.deepEqual(errors, []);
  console.log("Browser checks passed for the landing page, sample evidence, a live fixture crawl, exports, rerun, comparison and mobile widths.");
} finally {
  await browser?.close();
  worker.stop();
  await workerLoop;
  worker.release();
  db.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exit = once(server, "exit");
    server.kill();
    await exit;
  }
  await site.close();
  for (const file of readdirSync(dir)) rmSync(join(dir, file));
  rmdirSync(dir);
}
