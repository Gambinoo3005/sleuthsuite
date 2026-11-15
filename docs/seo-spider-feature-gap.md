# SleuthSuite vs. Screaming Frog SEO Spider

Feature gap and product opportunities · November 15, 2026 · SEO Spider 25.1

**How to read this:** **Missing** means no equivalent was found in SleuthSuite. **Partial** means something works today, with the remaining gap spelled out. **Covered** means we already support the basic workflow, even if the controls differ. The last column describes possible improvements, not features we ship today.

**Scope:** This inventory covers publicly documented feature families and their user-facing functions across the free and paid editions. It groups individual issue variants under the relevant function rather than reproducing Screaming Frog’s entire issue catalog or its implementation. The linked catalog is the checklist for exact rule parity. This is a code and documentation comparison, without a side-by-side crawl benchmark. Hosting, subscription tiers, and infrastructure are outside this document.

## 1. Starting, scoping, and managing a crawl

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Website crawl | Starts at a URL and discovers links. | **Covered.** Site mode discovers in-scope URLs and shows discovery and scope details inline. Outgoing evidence explains scope exclusions. | Extend scope previews when multi-host and pattern rules are added. |
| URL list | Accepts pasted or uploaded URLs, with depth and discovery controls. | **Partial.** Pasted lists, CSV/TSV/TXT, Excel, and Google Sheets links accessible without sign-in work. List discovery is optional and depth limited. Input review and CSV reconcile normalized, duplicate, and rejected rows by ID. Private Google Sheets need a file download. | Add connected Google accounts if users need to import private sheets directly. |
| List import from XML | Imports one or more XML sitemaps as URL lists. | **Partial.** Site mode reads sitemaps. List mode cannot import them as standalone seed files. | Preview sitemap entries and let users choose which lists and indexes to include. |
| Preserve input order | Exports list results in their original order. | **Partial.** Input rows CSV exports one record per input in review order, with the original value, normalized URL, and response. Redirect target is the immediate hop. | Add a final destination column for migration checks. |
| Subfolders and subdomains | Controls whether a crawl stays within a folder, host, or group of subdomains. | **Partial.** Origin and starting-path scope are supported. No multi-host scope controls. | Show an explicit preview of included hosts and why a URL is outside scope. |
| External destinations | Checks external URLs separately from internal discovery. | **Partial.** Outgoing links can be recorded, but we lack a dedicated external crawl and response inventory. | Check each external destination once per run and show every affected source page. |
| CDN or related-domain rules | Treats selected domains or paths as internal. | **Missing.** No related-host rules. | Distinguish asset-only hosts from hosts whose pages can expand the crawl. |
| Include and exclude rules | Uses URL patterns and can exclude links based on their location in the source. | **Partial.** Starting-path restriction only. | Add a live rule preview and show which rule matched each excluded URL. |
| URL rewriting | Removes selected parameters or rewrites discovered URLs using configurable rules. | **Partial.** Basic normalization is built in. No user-defined rewriting or parameter rules. | Show original and rewritten URLs side by side and preview collisions. |
| Resource types | Separately discovers, stores, or fetches HTML, images, media, CSS, JS, PDFs, and other resources. | **Partial.** HTML and page responses are the focus. Rendering can fetch some resources, but there is no equivalent asset inventory. | Offer page-only, page-plus-assets, and asset-only presets with visible coverage. |
| Discovery sources | Offers controls for canonicals, alternates, pagination, iframes, linked sitemaps, and other discovery sources. | **Partial.** Seeds, links, redirects, and sitemaps can enqueue pages. Canonical and hreflang evidence is collected, but they lack independent discovery controls. | Keep a selectable discovery trail with a reason for every new URL. |
| Nofollow and link handling | Configures internal and external nofollow handling and other link behaviors. | **Partial.** One nofollow discovery switch and link evidence. | Let users separate evidence collection from link-following rules. |
| Crawl limits | Fine controls for total URLs, depth, folders, parameters, and response sizes. | **Partial.** URL cap up to 10,000, depth and rate controls, and internal safety bounds. | Surface every applicable limit and the count affected by it. |
| Rate, retries and recovery | Configurable threads, pacing, retries, adaptive throttle and host pause. | **Partial.** Fixed per-origin pacing and bounded retries for some 429/503 responses. No configurable adaptive slowdown or recovery. | Show what triggered a slowdown, how long it lasted, and how much coverage it affected. |
| Robots policy | Uses robots.txt, shows matching rules, and provides a custom robots tester. | **Partial.** Respects live robots rules and reports blocked pages. No rule simulator or matching-line view. | Preview which URLs a proposed robots file affects without issuing a crawl. |
| Request identity and settings | Configurable user agents, request headers, cookies, network options, proxies, and trusted certificates. | **Partial.** The crawler has a defined identity and fixed request policy. No equivalent settings UI. | Add repeatable request profiles with a clear record of how the request was made. |
| Authorized staging access | Supports HTTP and forms-based authentication, including configured use in automated runs. | **Missing.** No private-site sign-in workflow. | Use project-scoped credentials, redact secrets from evidence, and verify access before the audit. |
| Reusable settings | Saves defaults and profiles and imports or exports JSON configuration. | **Partial.** Rerun reuses a saved run’s settings. No named, shareable profiles. | Offer versioned profiles and show settings differences before comparing runs. |
| Pause, resume, stop and rerun | Controls manual and automated jobs and can reopen stored crawls. | **Partial.** Core run controls and saved history work. No comparable bulk crawl management or targeted retry workflow. | Add retry for failed URLs and distinguish a partial result from a completed audit. |
| Large crawl handling | Can scale beyond a fixed small cap using its storage and memory settings. | **Partial.** SQLite-backed crawl queue, with a 10,000 URL cap. The local fixture is not a real-world capacity benchmark. | Prove coverage, responsiveness, and recovery under interruption before raising the cap. |
| Storage configuration | Offers memory/database storage modes and memory allocation controls. | **Partial.** One persistent SQLite implementation. | Keep defaults simple and surface actual storage usage and retention effects. |
| Specialized modes | Offers Spider, List, SERP, Compare, and API workflows. | **Partial.** Site and List modes and a report Compare tab. No standalone SERP or API enrichment mode. | Provide task entry points such as Check redirects, Review snippets, and Compare a release. |

Sources: [Configuration](https://www.screamingfrog.co.uk/seo-spider/user-guide/configuration/) · [General guide](https://www.screamingfrog.co.uk/seo-spider/user-guide/general/) · [List mode](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-use-list-mode/) · [SleuthSuite settings](../src/crawler/urls.ts) · [Crawl engine](../src/crawler/engine.ts)

## 2. HTTP, URL structure, and internal linking

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Response inventory | Dedicated internal/external views and filters by response class, type, and no-response reason. | **Partial.** URL status filters, errors, timing, and headers are available. No equivalent resource tabs or failure taxonomy. | Put the cause and a suggested next action next to each failed URL. |
| Redirect tracing | Reports chains, loops, temporary/permanent redirects, and HTML or JavaScript redirects. | **Partial.** HTTP traces, chains, and loops work. No dedicated meta-refresh or JavaScript redirect audits. | Export full source → hop → destination traces and group them by the fix required. |
| Redirect migration audit | List mode supports auditing destination behavior and seeing redirect/canonical relationships. | **Partial.** We can load migration URLs and inspect actual destinations. No expected-destination input or pass/fail reconciliation. | Accept old URL and expected new URL pairs. Flag wrong destinations and intermediate hops. |
| URL hygiene | Checks common path, size, casing, encoding, parameter, and internal search patterns. | **Missing.** No dedicated URL hygiene findings. | Group issues by the pattern generating them so template fixes are obvious. |
| HTTPS and page security hygiene | Reports insecure pages, mixed content, insecure forms or protocol links, and selected header issues. | **Missing.** HTTP and header evidence exists, but there is no dedicated hygiene audit. | Bundle each problem with the exact resource or markup and the affected templates. |
| Inlinks and outlinks | Dedicated source/target inventories and link attributes, types, positions and bulk reports. | **Partial.** We show link evidence, anchor, placement and nofollow, and export inlinks. No broad outlink export or deep link taxonomy. | Give every finding a one-click affected-links export scoped to the current filter. |
| Anchor text | Aggregates anchors and finds issues such as empty or non-descriptive link text. | **Partial.** Anchor text is captured. No aggregation or dedicated anchor findings. | Separate sparse, repeated, icon-only and accessible-name cases so users can triage correctly. |
| Link extraction coverage | Identifies uncrawlable link markup and supports custom link positions. | **Partial.** The extractor looks at normal anchors and areas and infers placement from ancestor elements. | Show uncrawlable elements and their markup, while distinguishing link hints from usable links. |
| Link equity and structure | Computes Link Score, counts, unique link metrics, and depth filters. | **Partial.** We show depth and incoming link counts. No graph-based score, crawl-wide link ratio analysis, or equivalent filters. | Prioritize deep or weakly linked pages using both the graph and business context. |
| Response time analysis | Provides a distribution view and filters for slow responses. | **Partial.** Response time is stored and exported, with limited aggregate analysis. | Show percentiles by route group and separate server time from browser rendering time where measured. |

Sources: [SEO Spider tabs](https://www.screamingfrog.co.uk/seo-spider/user-guide/tabs/) · [Issue catalog](https://www.screamingfrog.co.uk/seo-spider/issues/) · [SleuthSuite evidence and exports](../src/queries.ts)

## 3. Indexability, metadata, and localization

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Indexability classification | A filterable indexability status and reason across relevant reports. | **Partial.** Separate signals for noindex, robots and some canonical issues, without a unified reason column. | Offer a ranked explanation with the raw evidence for every signal, including unknown states. |
| Directives inventory | Inspects meta robots and HTTP directives, including individual values and conflicts. | **Partial.** We capture selected meta and header directives and flag noindex. We lack dedicated directive views and comprehensive conflict checks. | Label whether a directive came from source HTML, rendered HTML, or a header. |
| Canonical declarations | Audits missing, multiple, conflicting, inaccessible, chained and otherwise problematic canonicals. | **Partial.** HTML and HTTP canonicals are captured. We flag invalid/conflicting declarations and some error or redirect targets, with narrower relationship analysis. | Give each canonical a flow view and flag conflicting sitemap, internal link, and indexability signals together. |
| Page titles | Filters for missing, duplicate, too long/short, multiple tags and other conditions. | **Partial.** Missing and duplicate findings and title tag counts. No configurable length or pixel checks or full tag diagnostics. | Show the exact source and a bulk preview of proposed titles. |
| Meta descriptions | Filters for missing, duplicate, shortened/oversized or multiple descriptions and other markup concerns. | **Partial.** Missing and duplicate findings and tag counts. No equivalent length, width, or placement audits. | Group repeated metadata by template and let users export actionable groups. |
| Meta keywords | Dedicated extraction and filters for legacy keyword tags. | **Missing.** No native inventory. | Keep this optional for legacy migrations. |
| H1 and H2 | Separate heading inventories and filters for missing, duplicate, multiple, oversized, or misordered headings. | **Partial.** Extracts H1 elements and flags missing H1. No full H1 audit or dedicated H2 extraction. | Show the heading tree and aggregate template-level patterns. |
| SERP snippet mode | Edits and previews titles/descriptions and accepts bulk drafts without a live crawl. | **Missing.** No preview or draft import. | Compare current and proposed snippets for desktop and mobile with clear width estimates. |
| Hreflang discovery | Reads HTML, HTTP-header, and sitemap declarations. | **Partial.** Reads HTML declarations. No equivalent header or sitemap extraction. | Reconcile the three sources and show exactly where they disagree. |
| Hreflang consistency | Audits reciprocity, self-reference, language/region codes, x-default, non-200 and non-indexable alternates, and other conflicts. | **Partial.** Invalid declarations and missing return links are flagged. No equivalent breadth or locale reports. | Use a locale matrix with one row per page cluster and clear missing or conflicting cells. |
| HTML language | Flags language discrepancies in relevant reports. | **Missing.** No dedicated HTML language audit. | Compare the HTML language, locale URL, and declared alternates in one view. |
| Pagination | Discovers and validates next/previous links, target status, and crawlable links across a series. | **Missing.** No dedicated extraction or series checks. | Trace the affected series and prioritize pagination discovery over legacy indicator matching. |
| AMP | Discovers AMP relationships and reports validation, response and canonical issues. | **Missing.** No AMP audit. | Add as an optional legacy-site audit where customers still use AMP. |
| Social tags | Audits Open Graph and X Cards, including missing fields and image status or dimensions. | **Missing.** No native social reporting. | Show a share preview with actionable image and tag evidence. |
| Markup validation | Finds structural problems such as invalid head markup or misplaced elements. | **Missing.** HTML is parsed for facts, with no validation report. | Prioritize markup faults that can change which SEO tags a crawler sees. |

Sources: [SEO Spider tabs](https://www.screamingfrog.co.uk/seo-spider/user-guide/tabs/) · [25.x social checks](https://www.screamingfrog.co.uk/blog/seo-spider-25/) · [SleuthSuite extraction](../src/crawler/extract.ts) · [SleuthSuite audit rules](../src/crawler/rules.ts)

## 4. Sitemaps, orphan pages, and images

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Sitemap discovery and input | Finds linked sitemaps and accepts multiple explicit sitemap inputs. | **Partial.** Reads robots declarations, a user-supplied sitemap, and a default fallback. Supports sitemap indexes and compression. No comparable multiple-input workflow. | Show the origin, processing result, and URL counts for every sitemap. |
| Sitemap coverage | Identifies crawl URLs missing from sitemaps, orphan sitemap entries, and problematic URLs included in a sitemap. | **Partial.** Flags some exclusion signals and sitemap URLs without observed inlinks. No full two-way coverage matrix. | Break down missing, excluded, duplicate, redirected, and intentionally omitted URLs per sitemap. |
| Orphan page discovery | Compares crawled URLs with sitemap, GA4 and Search Console URLs. | **Partial.** Sitemap-only signal. No analytics or Search Console discovery. | Distinguish confirmed source-only URLs from URLs that may be unlinked because the crawl was incomplete. |
| XML sitemap output | Generates XML with configurable inclusion rules and optional fields and splits large outputs into index files. | **Partial.** Exports eligible URL candidates with a preview. No configurable fields, broad inclusion controls, or large sitemap output workflow. | Show a diff and the inclusion or exclusion reason before downloading. |
| Image sitemap | Generates image sitemap entries and can include images hosted externally. | **Missing.** Only regular XML output. | Explain why an image qualifies and let users exclude repeated sitewide assets. |
| Image inventory and origins | Audits individual asset URLs, status, sizes, dimensions and source pages, including configured responsive image sources. | **Partial.** Counts images and alt gaps per page, without asset-level rows or image fetch audits. | Deduplicate assets and group problems by shared asset or component. |
| Image alt and title diagnostics | Finds missing attributes and other image text issues with source evidence. | **Partial.** Missing and empty alt counts are captured. Only missing alt is a dedicated finding. | Show the exact image and source element, and distinguish intentionally decorative images. |

Sources: [Sitemap and report guide](https://www.screamingfrog.co.uk/seo-spider/user-guide/general/) · [Issue catalog](https://www.screamingfrog.co.uk/seo-spider/issues/) · [SleuthSuite sitemap code](../src/crawler/xml.ts)

## 5. JavaScript rendering, content, and custom extraction

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Render modes and controls | Offers raw HTML and Chromium, configurable waits including network idle, and device or viewport settings. | **Partial.** HTML and Chromium are available. No user-defined device or wait presets. | Preview one URL in both modes before committing to a full crawl. |
| Render resource coverage | Reports resource errors and rendering issues and supports wider rendering configuration. | **Partial.** A capped set of same-origin resources is fetched. No request waterfall, failed-resource inventory, or configurable external resource coverage. | Show which resources were blocked, skipped or failed and how that limits the evidence. |
| Raw vs. rendered differences | Reports how metadata, links and other values change after JavaScript. | **Partial.** Selected raw fields and link counts are retained for comparison. No full link or DOM diff. | Highlight changes with the original and rendered evidence and the likely SEO impact. |
| Screenshots, source and cookies | Dedicated rendered screenshot, source, resources and cookie views, plus stored source and Markdown export. | **Missing.** No screenshot, source snapshot export or cookie inspector. | Store opt-in snapshots and provide clear links from findings to relevant markup. |
| Text and PDF analysis | Configurable content area, word counts, readability, thin content and PDF text parsing. | **Partial.** Basic HTML word count; no main-content controls, PDF parsing, or dedicated readability and thin-content findings. | Compare pages by template and show when navigation or boilerplate dominates the count. |
| Exact duplicate analysis | Identifies identical pages and provides relationship and detail views. | **Partial.** Exact HTML hash finding, without configurable comparison scope or a dedicated group view. | Show the full group, its representative URL, and shared canonical or indexing signals. |
| Near duplicates | Measures textual similarity with configurable content regions and thresholds. | **Missing.** Exact hashes only. | Show the passages that match so users can decide whether to merge or keep pages. |
| Spelling and grammar | Audits language quality with dictionaries, language settings and detailed matches. | **Missing.** No language-quality engine. | Support client dictionaries and deduplicate errors that come from shared templates. |
| N-grams and word clouds | Summarizes repeated words or phrases in page content and linking text. | **Missing.** No phrase analysis or word clouds. | Show which templates and source pages account for each phrase. |
| Semantic similarity | Uses embeddings to find similar pages, outliers and topic clusters. | **Missing.** No embeddings. | Explain why pages were matched and use the results in content consolidation decisions. |
| Semantic search and redirect mapping | Finds relevant pages for a query or proposes content matches across URL sets. | **Missing.** URL search is lexical; no topic search or similarity-based matching. | Rank suggested matches with reasons and require explicit approval before exporting a redirect map. |
| Custom search | Finds strings or regex matches in source or rendered content, with reusable rules and bulk entry. | **Missing.** Searching URLs or titles does not scan source markup. | Show matching snippets, counts and test results before applying a rule to the entire site. |
| Custom extraction | Supports CSS, XPath, regex and visual extraction with configurable outputs. | **Partial.** Up to five CSS rules for text or attributes with bounded results. No XPath, regex, visual builder, or dedicated output columns. | Add a selector preview, a sample result table, and one export column per field. |
| Custom JavaScript | Runs user snippets for page actions or extraction and provides a reusable snippet library. | **Missing.** Chromium renders page scripts; there is no custom snippet feature. | Start with safe built-in actions and typed extraction templates, and show results and errors per URL. |

Sources: [Rendering, content and extraction configuration](https://www.screamingfrog.co.uk/seo-spider/user-guide/configuration/) · [PDF support](https://www.screamingfrog.co.uk/seo-spider/faq/) · [Semantic analysis](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-identify-semantically-similar-pages-outliers/) · [25.x changes](https://www.screamingfrog.co.uk/blog/seo-spider-25/) · [SleuthSuite renderer](../src/crawler/render.ts)

## 6. Structured data, performance, accessibility, and mobile

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Structured data inventory | Extracts JSON-LD, Microdata, and RDFa by item type and property. | **Partial.** Flags JSON-LD syntax errors. No entity or property inventory. | Show normalized entities and their source markup, including differences after rendering. |
| Schema.org validation | Checks types and properties and reports detailed errors. | **Missing.** Syntax checking does not validate schema semantics. | Point to the exact property path and group common failures by template. |
| Rich-result validation | Checks supported Google rich-result requirements and recommended fields. | **Missing.** No rich-result validation engine. | Publish the supported validation rules and version so users can reproduce a finding. |
| PageSpeed Insights and Lighthouse | Runs performance checks, presents lab and available field metrics, and reports optimization opportunities. | **Missing.** HTTP response timing alone is available. No Lighthouse or PSI integration. | Sample representative templates and keep lab results separate from field data. |
| Performance details | Reports resource bottlenecks, image inefficiency, compression, and current Lighthouse insights. | **Missing.** No performance diagnostics or fix grouping. | Identify repeated bottlenecks once and show the routes that share them. |
| Mobile usability | Checks mobile viewport, sizing, touch targets and related mobile issues. | **Missing.** No device-specific audit. | Pair the diagnostic with a reproducible mobile viewport and relevant element. |
| Accessibility | Uses axe for automated WCAG and best-practice checks, with violation and element details. | **Partial.** Missing-alt detection covers one narrow area. No axe audit, WCAG grading, or element-level accessibility report. | Group repeated defects by component and label results as automated checks with manual review still needed. |
| Carbon estimates | Estimates page carbon footprint and ratings using its performance analysis workflow. | **Missing.** No carbon estimates. | Add only if users need it, with assumptions and uncertainty visible. |

Sources: [Structured data, PageSpeed, mobile and accessibility tabs](https://www.screamingfrog.co.uk/seo-spider/user-guide/tabs/) · [Issue details](https://www.screamingfrog.co.uk/seo-spider/issues/) · [Release history](https://www.screamingfrog.co.uk/seo-spider/release-history/)

## 7. Reports, comparison, visualization, and desktop workflow

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Overview and issue management | Searchable issue catalog, filters, configurable severity/priority, disable switches and a customizable dashboard. | **Partial.** Shows coverage and fixed issue groups and severity. No issue configuration or saved dashboards. | Start with task-specific views and remember how each project prioritizes findings. |
| Site structure and segments | Site structure views and rule-based URL segments usable across reports. | **Partial.** Path groups and query/status/issue filters. No saved rule-based segments or comparable structure view. | Save filters as meaningful groups like Products or Help Center and show their health over time. |
| Table and view customization | Advanced column controls, customizable tables, search and dedicated evidence tabs. | **Partial.** Fixed columns, selected sorts and basic filters. No column chooser, saved views, or broad context actions. | Preserve each audit view and its filters when users drill into a finding and return. |
| Comparison keys | Compares crawls with custom URL mapping. | **Partial.** Exact URL and path/query mapping. No configurable transformation rules. | Preview mappings and flag missing, ambiguous, and many-to-one matches. |
| Change detection | Shows change across issue filters, page elements and other crawl details. | **Partial.** Selected fields and added/resolved findings are detected. No rich before/after evidence or user-defined fields. | Show old/new values and group changes by likely template or deployment. |
| Crawl and directory diagrams | Interactive tree and force graphs, including 3D and link exploration. | **Missing.** No crawl graph. | Start with a focused 2D path view that answers how a crawler reached a page. |
| Evidence and snapshots | Dedicated detail views for source, images, duplicates, headers, screenshots, rich data, accessibility and performance. | **Partial.** URL details, headers, links and redirect evidence. Dedicated views for many other domains are absent. | Give each issue a deep link and preserve why it fired in the export. |
| Specialized bulk reports | Exports issue-specific reports such as redirect chains, canonical errors, hreflang relationships and affected link sources. | **Partial.** URL, finding and inlink CSVs exist, plus sitemap XML. No comparable report catalog or bulk comparison export. | Bundle affected URLs, sources and suggested fixes in one export per issue. |
| Export formats and packaging | CSV, Excel, Google Sheets, batch export presets, multi-tab workbooks, and filename patterns. | **Partial.** CSV and XML only, with fixed naming and individual downloads. | Export exactly what users filtered and offer a single workbook for client handoff. |
| Looker Studio and client summaries | Crawl overview exports and configurable reporting feeds. | **Missing.** No reporting integration. | Provide a recurring shareable summary with changes, coverage and affected URLs. |
| Saved crawl library | Projects, bulk actions, crawl file import/export, configurable auto-retention and locks. | **Partial.** Local saved crawl list with reopen, rerun, and compare. No project folders, retention controls or portable crawl files. | Pin baselines, group by project, and show how much data each project retains. |
| Accessibility and preferences of the app | Desktop appearance settings, themes, languages, and update workflows. | **Partial.** Browser UI with responsive layouts. No equivalent theme, language, and desktop settings surface. | Prioritize keyboard navigation, mobile report usability, and localization when requested. |
| Packaging and support | Desktop downloads across supported platforms, auto updates, training, and technical support. | **Partial.** Local source-based setup and README. No equivalent installers or support program. | In a browser SaaS, guided setup, issue explanations, and diagnostics are more valuable than copying desktop installers. |

Sources: [General guide and reports](https://www.screamingfrog.co.uk/seo-spider/user-guide/general/) · [Compare guide](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-compare-crawls/) · [Release history](https://www.screamingfrog.co.uk/seo-spider/release-history/) · [SleuthSuite report queries](../src/queries.ts)

## 8. Automation and external data

| Function | What SEO Spider offers | SleuthSuite today and the gap | How we could do better |
|---|---|---|---|
| Scheduled audits | One-off and recurring launches with saved settings, run-now controls, and configured outputs. | **Missing.** No user-facing scheduler. | Make schedules easy to preview and show when and why a scheduled run was skipped. |
| Automatic comparisons and email | Compares scheduled runs and can send crawl changes, exports, and notifications by email. | **Missing.** Manual comparisons only. | Alert on regressions users care about and keep routine results in a digest. |
| Headless CLI | Starts, loads and manages runs and projects and automates reports without the desktop UI. | **Missing.** The launcher starts the app and worker; there is no audit CLI. | Offer structured output and a release gate based on newly introduced findings. |
| MCP and agent tooling | Lets authorized assistants configure crawls, retrieve evidence and inspect configuration or execution. | **Missing.** No MCP interface. | Start with scoped access to existing reports and explicit controls for starting new audits. |
| API-only enrichment | Can enrich URL lists with supported integrations without doing a full website crawl. | **Missing.** No dedicated enrichment workflow. | Let users selectively enrich high-priority URLs and show what each data source returned. |
| Google Search Console | Joins search metrics and URL Inspection data and helps discover orphans. | **Missing.** No connector. Crawl observations are separate from search-engine indexing data. | Prioritize findings on pages with impressions or clicks and label when the inspection was last recorded. |
| Google Analytics 4 | Joins traffic and other configured analytics data to a crawl. | **Missing.** No connector. | Highlight crawl issues affecting landing pages with traffic or conversions. |
| Backlink data | Connects to Majestic, Ahrefs, and Moz for link metrics. | **Missing.** There is internal crawl link evidence only. | Use external link signals to prioritize broken destinations and migration checks. |
| AI providers and prompts | Integrates with OpenAI, Gemini, Anthropic and Ollama for supported prompt or embedding workflows. | **Missing.** No configurable AI enrichment. | Prioritize evidence-backed summaries with user opt-in and control over data sent out. |

Sources: [Scheduling and CLI](https://www.screamingfrog.co.uk/seo-spider/user-guide/general/) · [API and MCP configuration](https://www.screamingfrog.co.uk/seo-spider/user-guide/configuration/) · [Free and paid features](https://www.screamingfrog.co.uk/seo-spider/pricing/)

## Recommended build order

1. **Make crawl results more trustworthy.** Add scope previews, include/exclude rules, query parameter controls, selectively checked external links, and clear skipped or failed reasons.
2. **Make fixes easier to assign.** Add unified indexability reasons, stronger canonical and hreflang checks, URL hygiene, image evidence, and contextual exports that include the affected sources.
3. **Make release checks repeatable.** Add saved crawl profiles, before/after evidence, expected redirect destinations, and shareable comparisons.
4. **Make audits worth repeating.** Add scheduled runs and focused regression alerts. Connect Search Console so users can prioritize pages that receive search traffic.
5. **Expand by demand.** Add structured data validation, rendered evidence, near duplicates, and performance or accessibility sampling. Treat semantic analysis, 3D graphs, and legacy checks as separate product decisions.

## Reference checklist for future updates

- [SEO Spider release history](https://www.screamingfrog.co.uk/seo-spider/release-history/) and [25.x release notes](https://www.screamingfrog.co.uk/blog/seo-spider-25/) for features added after this comparison.
- [User guide index](https://www.screamingfrog.co.uk/seo-spider/user-guide/), [all documented tabs](https://www.screamingfrog.co.uk/seo-spider/user-guide/tabs/), and [configuration guide](https://www.screamingfrog.co.uk/seo-spider/user-guide/configuration/) for UI functions and settings.
- [Issue catalog](https://www.screamingfrog.co.uk/seo-spider/issues/) for individual findings and validation rules, including the detailed accessibility and performance subchecks.
- [General guide](https://www.screamingfrog.co.uk/seo-spider/user-guide/general/) for reports, modes, workflows, scheduling, visualizations, and exports.
- [SleuthSuite data model](../src/model.ts), [page extraction](../src/crawler/extract.ts), [audit rules](../src/crawler/rules.ts), [crawl settings](../src/crawler/urls.ts), and [report queries](../src/queries.ts) for verifying what is implemented.
