import { setTimeout as delay } from "node:timers/promises";
import { database } from "../db.ts";
import { CrawlWorker } from "./engine.ts";
import { closeRenderer } from "./render.ts";

const worker = new CrawlWorker(database());
function shutdown() { worker.stop(); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.log("SleuthSuite crawl worker is ready.");
try {
  while (!worker.isStopping) {
    if (!await worker.step()) await delay(300);
  }
} finally {
  worker.release();
  await closeRenderer();
}
