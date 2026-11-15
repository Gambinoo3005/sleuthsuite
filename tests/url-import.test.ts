import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareUrlImport } from "../src/url-import.ts";

test("reads the URL column in a quoted CSV and appends only new URLs", () => {
  const result = prepareUrlImport("export.CSV", '\uFEFF"Title","Address"\r\n"Sale, today","https://example.com/shop"\r\n"Duplicate","https://example.com/shop#top"\r\n"Already present","https://example.com/"\r\n"Invalid","example.org"\r\n"Missing",', "https://example.com");
  assert.deepEqual(result.added, ["https://example.com/shop"]);
  assert.equal(result.combined, "https://example.com\nhttps://example.com/shop");
  assert.equal(result.duplicates, 2);
  assert.equal(result.invalid, 2);
});

test("accepts TSV and TXT, and reports ambiguous or malformed imports", () => {
  assert.deepEqual(prepareUrlImport("export.tsv", "URL\tTitle\nhttps://example.net/path\tExample", "").added, ["https://example.net/path"]);
  assert.deepEqual(prepareUrlImport("export.txt", "\uFEFFhttps://example.net\r\n\r\nhttps://example.net/more", "").added, ["https://example.net/", "https://example.net/more"]);
  assert.throws(() => prepareUrlImport("export.csv", "Page,Title\nhttps://example.net,Example", ""), /Name the URL column/);
  assert.throws(() => prepareUrlImport("export.csv", 'URL,Title\n"https://example.net', ""), /could not be read/);
  assert.throws(() => prepareUrlImport("export.xlsx", "", ""), /Choose a CSV/);
});
