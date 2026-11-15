import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareUrlImport, readTextInput } from "../src/url-import.ts";
import { pastedInput, reviewInput } from "../src/crawler/urls.ts";
import { googleCsvUrl } from "../src/google-sheet.ts";

test("reads the URL column in a quoted CSV and appends only new URLs", () => {
  const result = prepareUrlImport("export.CSV", '\uFEFF"Title","Address"\r\n"Sale, today","example.com/shop"\r\n"Duplicate","https://example.com/shop#top"\r\n"Already present","https://example.com/"\r\n"Invalid","example"\r\n"Missing",', "example.com");
  assert.deepEqual(result.added, ["https://example.com/shop"]);
  assert.equal(result.combined, "example.com\nhttps://example.com/shop");
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

test("review keeps original input rows, including duplicate and blank CSV records", () => {
  const pasted = pastedInput("\nexample.com");
  const imported = readTextInput("export.csv", "Title,URL\r\nDuplicate,https://example.com/#x\r\nMissing,\r\nNew,example.ph");
  assert.deepEqual(reviewInput([...pasted, ...imported]).map(({ row, id, status, url }) => [id, row, status, url]), [
    [1, 2, "ready", "https://example.com/"], [2, 2, "duplicate", "https://example.com/"],
    [3, 3, "rejected", null], [4, 4, "ready", "https://example.ph/"],
  ]);
});

test("Google Sheets imports retain the selected tab and only accept Google spreadsheet links", () => {
  assert.equal(googleCsvUrl("https://docs.google.com/spreadsheets/d/abcdefgh/edit#gid=42").href,
    "https://docs.google.com/spreadsheets/d/abcdefgh/export?format=csv&gid=42");
  assert.equal(googleCsvUrl("https://docs.google.com/spreadsheets/d/e/abcdefgh/pubhtml?gid=0").href,
    "https://docs.google.com/spreadsheets/d/e/abcdefgh/pub?output=csv&gid=0");
  assert.throws(() => googleCsvUrl("https://docs.google.com.example.com/spreadsheets/d/abcdefgh/edit"), /docs.google.com/);
});
