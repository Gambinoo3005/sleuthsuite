import type { Browser } from "playwright";
import type { HttpResult } from "./http.ts";
import { fetchHttp } from "./http.ts";

let chromium: Browser | undefined;

export async function renderPage(
  url: string,
  initial: HttpResult,
  request: (url: string, maxBytes: number, signal: AbortSignal) => Promise<HttpResult> =
    (target, maxBytes, signal) => fetchHttp(target, { maxBytes, signal }),
) {
  if (!chromium?.isConnected()) {
    const { chromium: engine } = await import("playwright");
    chromium = await engine.launch({
      headless: true, chromiumSandbox: true, timeout: 10_000,
      // The route handler supplies all allowed HTTP traffic via the crawler's checked fetcher.
      args: ["--proxy-server=http://127.0.0.1:1", "--proxy-bypass-list=<-loopback>", "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
  }
  const context = await chromium.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const page = await context.newPage();
  const origin = new URL(url).origin;
  let served = false;
  let attempts = 0;
  let incomplete = false;
  let bytes = 0;
  const timeout = AbortSignal.timeout(12_000);
  const deadline = setTimeout(() => { void context.close().catch(() => {}); }, 14_000);
  deadline.unref();
  await context.routeWebSocket("**/*", (route) => { void route.close(); });
  await context.route("**/*", async (route) => {
    const requested = route.request();
    const target = new URL(requested.url());
    try {
      if (!served && requested.isNavigationRequest() && target.href === url) {
        served = true;
        await route.fulfill({ status: initial.status, contentType: initial.headers["content-type"] || "text/html", body: initial.body });
        return;
      }
      if (target.origin !== origin || requested.method() !== "GET" || requested.isNavigationRequest() ||
          !["script", "stylesheet", "xhr", "fetch"].includes(requested.resourceType())) {
        if (["script", "xhr", "fetch"].includes(requested.resourceType())) incomplete = true;
        await route.abort();
        return;
      }
      if (++attempts > 35 || bytes > 8 * 1024 * 1024) {
        incomplete = true;
        await route.abort();
        return;
      }
      const response = await request(target.href, 1024 * 1024, timeout);
      if (response.status >= 300 && response.status < 400) {
        incomplete = true;
        await route.abort();
        return;
      }
      bytes += response.body.length;
      await route.fulfill({ status: response.status, contentType: response.headers["content-type"], body: response.body });
    } catch {
      incomplete = true;
      await route.abort().catch(() => {});
    }
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 1800 });
    } catch {
      incomplete = true;
    }
    const html = await page.content();
    if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new Error("Rendered HTML exceeds the crawl size limit.");
    return { body: Buffer.from(html), incomplete };
  } finally {
    clearTimeout(deadline);
    await context.close().catch(() => {});
  }
}

export async function closeRenderer() {
  await chromium?.close();
  chromium = undefined;
}
