import { parse } from "csv-parse/browser/esm/sync";
import { MAX_CRAWL_URLS, MAX_INPUT_ROWS, MAX_URL_LIST_LENGTH, normalizeCrawlUrl } from "./crawler/urls.ts";
import type { InputRow } from "./model.ts";

const urlHeaders = new Set(["url", "urls", "address", "pageurl", "pageaddress", "websiteurl"]);

export function tableInput(source: string, rows: string[][], firstRow = 1): InputRow[] {
  if (!rows.length) return [];
  const headers = rows[0].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
  const column = headers.findIndex((header) => urlHeaders.has(header));
  if (column < 0 && rows.some((row) => row.slice(1).some((cell) => cell.trim()))) {
    throw new Error("Name the URL column “URL” or “Address” in a table with multiple columns.");
  }
  const start = column < 0 ? 0 : 1;
  if (rows.length - start > MAX_INPUT_ROWS) throw new Error("Use at most 20,000 input rows.");
  return rows.slice(start).map((row, index) => ({
    source: source.slice(0, 240), row: firstRow + index + start, value: row[Math.max(0, column)] ?? "",
  }));
}

export function readTextInput(filename: string, text: string): InputRow[] {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "txt") {
    return tableInput(filename, text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).map((value) => [value]))
      .filter((row) => row.value.trim());
  }
  if (extension !== "csv" && extension !== "tsv") throw new Error("Choose a CSV, TSV, TXT, XLSX, or XLS file.");
  return tableInput(filename, parseTable(text, extension === "tsv" ? "\t" : ",", false));
}

export function parseTable(text: string, delimiter = ",", skipEmpty = false): string[][] {
  let rows: string[][];
  try {
    rows = parse(text, { delimiter, bom: true, skip_empty_lines: skipEmpty, relax_column_count: true, trim: true, to: MAX_INPUT_ROWS + 2 });
  } catch {
    throw new Error("This table could not be read. Check its delimiters and quoted cells.");
  }
  return rows;
}

function readColumn(text: string, delimiter: string): string[] {
  const rows = parseTable(text, delimiter, true);
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
  const seen = new Set(current.split(/\r?\n/).map(normalizeCrawlUrl).filter(Boolean));
  const added: string[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const raw of values) {
    const value = raw.trim();
    const url = normalizeCrawlUrl(value);
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
