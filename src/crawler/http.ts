import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";
import { USER_AGENT } from "./urls.ts";

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  ms: number;
}

export interface FetchOptions {
  maxBytes?: number;
  timeout?: number;
  testOrigin?: string;
  signal?: AbortSignal;
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast";
}

async function resolveAddress(url: URL, signal: AbortSignal, testOrigin?: string) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  const addresses = ipaddr.isValid(hostname) ? [{ address: hostname }] : await new Promise<{ address: string }[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  const allowed = addresses.filter(({ address }) => isPublicAddress(address) ||
    (testOrigin === url.origin && address === "127.0.0.1"));
  if (!allowed.length || allowed.length !== addresses.length) throw new Error("Target resolves to a nonpublic network address.");
  // Prefer IPv4 on systems without IPv6 connectivity.
  return allowed.find(({ address }) => ipaddr.parse(address).kind() === "ipv4")?.address ?? allowed[0].address;
}

const hiddenHeaders = new Set(["set-cookie", "set-cookie2", "authorization", "proxy-authorization"]);
export function visibleHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([key, value]) => !hiddenHeaders.has(key) && value !== undefined)
    .map(([key, value]) => [key, (Array.isArray(value) ? value.join(", ") : value ?? "").slice(0, 8_192)]));
}

export async function fetchHttp(value: string, options: FetchOptions = {}): Promise<HttpResult> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) URL without credentials.");
  const timeout = AbortSignal.timeout(options.timeout ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const start = performance.now();
  const address = await resolveAddress(url, signal, options.testOrigin);
  signal.throwIfAborted();
  const http = url.protocol === "https:" ? requestHttps : requestHttp;
  return new Promise((resolve, reject) => {
    const request = http({
      hostname: address,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      servername: url.hostname.replace(/^\[|\]$/g, ""),
      path: url.pathname + url.search,
      headers: { Host: url.host, "User-Agent": USER_AGENT, Accept: "*/*", "Accept-Encoding": "gzip, deflate, br" },
      agent: false,
      signal,
    });
    request.on("error", reject);
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      const headers = visibleHeaders(response.headers);
      if (status >= 300 && status < 400) {
        response.destroy();
        resolve({ status, headers, body: Buffer.alloc(0), ms: Math.round(performance.now() - start) });
        return;
      }
      const encoding = headers["content-encoding"]?.toLowerCase();
      const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
      if (encoding && encoding !== "identity" && !decoder) {
        response.destroy();
        reject(new Error("Unsupported response encoding."));
        return;
      }
      const stream = decoder ? response.pipe(decoder) : response;
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on("error", (error) => {
        decoder?.destroy();
        reject(error);
      });
      stream.on("error", (error) => {
        response.destroy();
        reject(error);
      });
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy();
          decoder?.destroy();
          reject(new Error("Response body exceeds the crawl size limit."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => resolve({
        status, headers, body: Buffer.concat(chunks), ms: Math.round(performance.now() - start),
      }));
    });
    request.end();
  });
}
