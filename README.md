# SleuthSuite

SleuthSuite is a local technical SEO crawler. Crawl a site or a list of URLs, open a finding to see the page and link that produced it, and export the evidence for a fix.

## Run locally

Use Node.js 24.15 or newer in the 24.x series and pnpm 11.25.0. SleuthSuite is verified on Windows.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The landing page includes an interactive sample audit, and **Open workspace** lets you start a real crawl. For development, run `pnpm dev`.

The launcher runs both the local Next.js server and the crawl worker. Keep the launcher running for jobs to continue. You can close the browser tab and reopen a run from **Saved crawls**. The database is `.sleuthsuite/sleuthsuite.sqlite` in the checkout. Set `SLEUTHSUITE_DATA_DIR` to put it in another directory or `PORT` to change the local port.

Install Chromium before choosing **Chromium** in crawl settings.

```sh
pnpm setup:browser
```

## What SleuthSuite checks

- **Discovery and coverage.** Crawl an origin or its starting path. See each URL’s discovery source and scope in the results, and see why outgoing links were excluded in page evidence. Set the rate, depth and URL cap. Check robots rules and sitemap indexes, including compressed sitemap files.
- **URL list review.** Paste URLs or import CSV, TSV, TXT, Excel, or a Google Sheets link accessible without signing in. Review original values, normalized URLs, duplicates and rejected rows before crawling. List mode checks just the seeds and in-scope redirects by default. Turn on link discovery to follow each seed’s origin up to the depth limit. Export the input row mapping to reconcile results with the original list.
- **Responses and links.** Find broken destinations, server and client errors, chains and loops. View response headers, redirect hops, and incoming and outgoing links with anchor text and HTML placement.
- **Page and indexability signals.** Inspect titles, descriptions, headings, canonical and robots signals, exact duplicates, missing alt attributes, hreflang return links, and invalid JSON-LD syntax. Filter by finding, URL status or path group.
- **Rendering and extraction.** Run Chromium for JavaScript pages and compare observed fields with the original HTML. Use simple CSS selectors to extract text or attribute values into the evidence and CSV.
- **History and handoff.** Pause, resume or stop a crawl, rerun its configuration, and compare saved results. Match staging and production URLs by path and query. Export filtered pages and findings, incoming links, and reviewed XML sitemap candidates.

SleuthSuite reports observed technical signals. Search Console or an equivalent search-engine tool is needed to confirm actual indexing. The local worker fetches public HTTP(S) addresses, respects robots rules and follows in-scope links. Chromium runs with a capped set of same-origin resources. Sites that depend on external scripts, login or user interaction may show partial rendered evidence. JSON-LD checks validate syntax.

The default cap is 1,000 unique URLs at two requests per second per origin. HTML crawls support a configurable cap of 10,000 URLs. Host throughput, rate limits and Chromium rendering change how long actual crawls take. The UI and API bind to loopback, and crawl records stay in the local SQLite database.

## Verify the project

```sh
pnpm check
pnpm test
pnpm test:scale
pnpm build
pnpm setup:browser
pnpm test:browser
```

Set `SLEUTHSUITE_BROWSER_TEST=1` when running `pnpm test` to include the Chromium fixture. The browser test also covers the landing page, mobile layouts, saved audits, inlink CSV, and comparisons through the running production build.

On Windows with an Intel Core Ultra 5 235U and 15 GiB of RAM, the 10,000-URL HTML fixture took 30.91 seconds, used about 321 MiB peak RSS, and produced a 19.86 MiB SQLite database. The p95 for filtered and paginated reads during the run was 38.93 ms. The fixture serves local HTML with request pacing disabled so it measures crawl processing and storage performance.

## Code layout

- `src/app` contains the landing page, workspace routes and local API.
- `src/components` contains the crawl form, results, evidence and sample preview.
- `src/crawler` contains HTTP fetching, crawl scheduling, HTML and sitemap processing, Chromium rendering and audit rules.
- `src/db.ts` and `src/queries.ts` manage the persistent queue, evidence, comparisons and exports.
- `tests` contains controlled site fixtures, browser checks and the scale benchmark.
