import { parse } from "csv-parse/browser/esm/sync";
import { MAX_CRAWL_URLS, MAX_URL_LIST_LENGTH, normalizeUrl } from "./crawler/urls.ts";

const urlHeaders = new Set(["url", "urls", "address", "pageurl", "pageaddress", "websiteurl"]);

function readColumn(text: string, delimiter: string): string[] {
  let rows: string[][];
  try {
    rows = parse(text, { delimiter, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  } catch {
    throw new Error("This table could not be read. Check its delimiters and quoted cells.");
  }
  if (!rows.length) return [];
  const headers = rows[0].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
  const column = headers.findIndex((header) => urlHeaders.has(header));
  if (column >= 0) return rows.slice(1).map((row) => row[column] ?? "");
  if (rows.every((row) => row.length === 1)) return rows.map(([value]) => value);
  throw new Error("Name the URL column “URL” or “Address” in a table with multiple columns.");
}

export function prepareUrlImport(filename: string, text: string, current: string) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "tsv" && extension !== "txt") {
    throw new Error("Choose a CSV, TSV, or TXT file.");
  }
  const values = extension === "txt" ? text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/) :
    readColumn(text, extension === "tsv" ? "\t" : ",");
  const seen = new Set(current.split(/\r?\n/).map((line) => normalizeUrl(line.trim())).filter(Boolean));
  const added: string[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const raw of values) {
    const value = raw.trim();
    const url = /^https?:\/\//i.test(value) && !/[\r\n\t]/.test(value) ? normalizeUrl(value) : null;
    if (!url) {
      if (value || extension !== "txt") invalid++;
    } else if (seen.has(url)) {
      duplicates++;
    } else {
      seen.add(url);
      added.push(url);
    }
  }
  const combined = [current.trim(), ...added].filter(Boolean).join("\n");
  if (seen.size > MAX_CRAWL_URLS) throw new Error("The combined list can contain at most 10,000 URLs.");
  if (combined.length > MAX_URL_LIST_LENGTH) throw new Error("This would make the URL list too long. Import a smaller file.");
  return { added, combined, duplicates, invalid };
}
