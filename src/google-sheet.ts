import { fetchHttp } from "./crawler/http.ts";
import { parseTable, tableInput } from "./url-import.ts";

export function googleCsvUrl(value: string): URL {
  let link: URL;
  try { link = new URL(value.trim()); }
  catch { throw new Error("Paste a Google Sheets link."); }
  if (link.origin !== "https://docs.google.com" || link.username || link.password) throw new Error("Paste a Google Sheets link from docs.google.com.");
  const match = /^\/spreadsheets\/d\/(e\/)?([\w-]{8,200})(?:\/(?:edit|view|export|pub|pubhtml))?\/?$/.exec(link.pathname);
  if (!match) throw new Error("Paste a shared or published Google Sheets link.");
  const gid = link.searchParams.get("gid") ?? new URLSearchParams(link.hash.slice(1)).get("gid");
  if (gid !== null && !/^\d{1,16}$/.test(gid)) throw new Error("The Google Sheets tab ID is invalid.");
  const target = new URL(`/spreadsheets/d/${match[1] ?? ""}${match[2]}/${match[1] ? "pub" : "export"}`, link.origin);
  target.searchParams.set(match[1] ? "output" : "format", "csv");
  if (gid !== null) target.searchParams.set("gid", gid);
  return target;
}

export async function fetchGoogleSheet(value: string, signal: AbortSignal) {
  let target = googleCsvUrl(value);
  const label = `Google Sheets · ${target.pathname.split("/").at(-2)?.slice(-12) ?? "sheet"}${target.searchParams.has("gid") ? ` · tab ${target.searchParams.get("gid")}` : ""}`;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  for (let hop = 0; hop < 4; hop++) {
    const result = await fetchHttp(target.href, { maxBytes: 2_000_000, signal: deadline });
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      target = new URL(result.headers.location, target);
      if (target.protocol !== "https:" || target.port || target.username || target.password ||
          !/^(docs\.google\.com|docs\.googleusercontent\.com|(?:[a-z0-9-]+-)?sheets\.googleusercontent\.com)$/.test(target.hostname)) break;
      continue;
    }
    if (result.status === 200 && /^(text\/(csv|plain)|application\/octet-stream)\b/i.test(result.headers["content-type"] ?? "")) {
      return { label, rows: tableInput(label, parseTable(result.body.toString("utf8"))) };
    }
    break;
  }
  throw new Error("Could not read this Google Sheet. Use a link accessible without sign-in, or download it as Excel or CSV.");
}
