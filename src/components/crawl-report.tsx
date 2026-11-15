"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpDown, ChevronLeft, ChevronRight, CircleAlert, Download,
  FileText, GitCompare, Link2, ListChecks, Pause, Play, RotateCw, Route, Search, Square,
} from "lucide-react";
import { isActive, RULES } from "@/model";
import type { Finding, IssueGroup, ListResult, PageRecord, RuleCode, RunSummary, SitemapRecord } from "@/model";
import type { Change } from "@/queries";
import { api, prettyDate, prettyNumber, ResponseStatus, RunStatus } from "./common";
import { EvidenceDrawer } from "./evidence-drawer";

type View = "findings" | "urls" | "sitemaps" | "compare";
type Sort = "url" | "http" | "title" | "depth" | "inlinks";
interface Overview { crawl: RunSummary; issues: IssueGroup[]; folders: { path: string; count: number }[] }
interface Sitemaps { documents: SitemapRecord[]; count: number; preview: string[] }
const viewList = [{ id: "findings", label: "Findings", icon: CircleAlert }, { id: "urls", label: "URLs", icon: FileText },
  { id: "sitemaps", label: "Sitemaps", icon: Route }, { id: "compare", label: "Compare", icon: GitCompare }] as const;
const order = { error: 0, warning: 1, notice: 2 };

export function CrawlReport({ id }: { id: string }) {
  const router = useRouter();
  const sample = id === "sample";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mainError, setMainError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [view, setView] = useState<View>("findings");
  const [rule, setRule] = useState<RuleCode | "">("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("");
  const [folder, setFolder] = useState("");
  const [sort, setSort] = useState<Sort | "">("");
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(1);
  const [loadedList, setLoadedList] = useState<{ key: string; value: ListResult<PageRecord | Finding | Change> } | null>(null);
  const [sitemaps, setSitemaps] = useState<Sitemaps | null>(null);
  const [reportError, setReportError] = useState("");
  const [selectedUrl, selectUrl] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<RunSummary[] | null>(null);
  const [baseline, setBaseline] = useState("");
  const [pathMapping, setPathMapping] = useState(false);
  const run = overview?.crawl;
  const active = run ? isActive(run.state) && run.state !== "paused" : false;
  const updateKey = run ? `${run.state}:${run.discovered}:${run.checked}:${run.failed}:${run.skipped}:${run.findings}` : "";

  const refresh = useCallback(async () => {
    try {
      setOverview(await api<Overview>(`/${id}`));
      setMainError("");
    } catch (error) { setMainError((error as Error).message); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!active && run) return;
    const timer = setInterval(() => void refresh(), 1200);
    return () => clearInterval(timer);
  }, [active, refresh, run?.state]); // Poll throughout a run, including the first request.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 230);
    return () => clearTimeout(timer);
  }, [query]);

  const publicParams = new URLSearchParams({ page: String(page), q: debounced, filter, folder, code: rule, sort, dir: desc ? "desc" : "asc" }).toString();
  const reportParams = publicParams + `&baseline=${encodeURIComponent(baseline)}&map=${pathMapping ? "path" : "url"}`;
  const reportKey = `${id}/${view}?${reportParams}`;
  const list = loadedList?.key === reportKey ? loadedList.value : null;
  useEffect(() => {
    if (!updateKey || (view === "compare" && !baseline)) return;
    const controller = new AbortController();
    setReportError("");
    const request = view === "sitemaps"
      ? api<Sitemaps>(`/${id}/sitemaps`, { signal: controller.signal }).then(setSitemaps)
      : api<ListResult<PageRecord | Finding | Change>>(`/${reportKey}`, { signal: controller.signal })
        .then((value) => { if (!controller.signal.aborted) setLoadedList({ key: reportKey, value }); });
    void request.catch((error: Error) => {
      if (error.name !== "AbortError") setReportError(error.message);
    });
    return () => controller.abort();
  }, [id, view, reportKey, updateKey, baseline]);

  useEffect(() => {
    if (view !== "compare" || sample) return;
    const controller = new AbortController();
    void api<RunSummary[]>("", { signal: controller.signal }).then((runs) => setBaselines(runs.filter((item) => item.id !== id && item.issuesReady)))
      .catch((error: Error) => { if (error.name !== "AbortError") setReportError(error.message); });
    return () => controller.abort();
  }, [id, view, sample]);

  async function command(action: string) {
    setActionPending(true);
    setActionError("");
    try {
      const result = await api<{ id?: string }>(`/${id}/${action}`, { method: "POST", body: "{}" });
      if (result.id) router.push(`/workspace/crawls/${result.id}`);
      else await refresh();
    } catch (error) { setActionError((error as Error).message); }
    finally { setActionPending(false); }
  }

  function switchView(next: View) {
    if (next === view) return;
    setView(next); setQuery(""); setDebounced(""); setPage(1); setReportError("");
  }
  function chooseRule(code: RuleCode | "") {
    switchView("findings");
    setRule(code); setPage(1);
  }
  function sortBy(field: Sort) {
    setDesc(sort === field ? !desc : false);
    setSort(field); setPage(1);
  }

  if (!run) return <main id="content" className="work-main">
    <Link className="back-link" href="/workspace"><ArrowLeft size={16} /> Workspace</Link>
    <div className="work-card report-loading">{mainError ? <p className="alert" role="alert">{mainError}</p> : <p role="status">Loading crawl report…</p>}</div>
  </main>;

  const groups = [...(overview?.issues ?? [])].sort((a, b) => order[RULES[a.code].severity] - order[RULES[b.code].severity] || b.count - a.count);
  const complete = run.checked + run.skipped + run.failed + run.cancelled;
  const coverageIncomplete = run.truncated || run.failed > 0 || run.skipped > 0 || run.cancelled > 0;
  const exportUrl = (kind: string, params = "") => `/api/crawls/${id}/export?kind=${kind}${params ? "&" + params : ""}`;

  return <main id="content" className="work-main report-main">
    <Link className="back-link" href="/workspace"><ArrowLeft size={15} /> Workspace</Link>
    <div className="workspace-heading report-heading">
      <div><div className="work-eyebrow"><ListChecks size={15} /> {sample ? "SAMPLE AUDIT" : run.settings.mode === "site" ? "WEBSITE AUDIT" : "URL LIST AUDIT"}</div>
        <div className="run-heading"><h1>{run.settings.name}</h1><RunStatus state={run.state} /></div>
        <p className="run-subtitle"><span className="mono">{run.origin}</span><span>·</span><span>{run.settings.rendering === "chromium" ? "Chromium" : "HTML"}</span>{!sample && <><span>·</span>{prettyDate(run.createdAt)}</>}</p></div>
      {!sample && <div className="report-actions">
        {(run.state === "running" || run.state === "queued") && <button className="button button-outline" disabled={actionPending} onClick={() => void command("pause")}><Pause size={15} /> Pause</button>}
        {run.state === "paused" && <button className="button button-primary" disabled={actionPending} onClick={() => void command("resume")}><Play size={15} /> Resume</button>}
        {["running", "queued", "pausing", "paused"].includes(run.state) && <button className="button button-outline" disabled={actionPending} onClick={() => void command("stop")}><Square size={14} /> Stop</button>}
        {!isActive(run.state) && <button className="button button-outline" disabled={actionPending} onClick={() => void command("rerun")}><RotateCw size={15} /> Run again</button>}
      </div>}
    </div>
    {(mainError || actionError || run.message) && <p className="alert" role="alert">{mainError || actionError || run.message}</p>}
    <div className="audit-metrics">
      {[["Discovered", run.discovered], ["Checked", run.checked], ["Queued", run.queued], ["Excluded / failed", run.skipped + run.failed + run.cancelled], ["Findings", run.findings]].map(([label, value]) =>
        <div className="audit-metric" key={label}><span>{label}</span><strong>{prettyNumber(Number(value))}</strong></div>)}
    </div>
    {isActive(run.state) && <div className="progress-line"><progress value={complete} max={Math.max(1, run.discovered)} aria-label="Crawl progress" /><span>{complete} of {run.discovered} discovered URLs processed</span></div>}
    {coverageIncomplete && <p className="report-note"><CircleAlert size={15} /> Coverage is incomplete. {run.truncated ? "A crawl limit was reached. " : ""}{run.skipped} skipped, {run.failed} failed, {run.cancelled} cancelled.</p>}
    <section className="report-frame">
      <div className="report-tabs" aria-label="Report views">
        {viewList.filter((item) => item.id !== "compare" || !sample).map(({ id: key, label, icon: Icon }) =>
          <button key={key} aria-pressed={view === key} onClick={() => switchView(key)}><Icon size={16} />{label}</button>)}
      </div>
      <div className={`report-content ${view === "findings" ? "has-filters" : ""}`}>
        {view === "findings" && <aside className="finding-rail" aria-label="Filter findings">
          <button aria-pressed={rule === ""} onClick={() => chooseRule("")}><span>All findings</span><b>{run.findings}</b></button>
          {groups.map(({ code, count }) => <button key={code} aria-pressed={rule === code} onClick={() => chooseRule(code)}>
            <span><i className={`severity-dot severity-${RULES[code].severity}`} />{RULES[code].title}</span><b>{count}</b></button>)}
        </aside>}
        <div className="report-table-section">
          {view === "compare" && <div className="compare-settings">
            <label className="field"><span>Compare with</span><select value={baseline} onChange={(event) => { setBaseline(event.target.value); setPage(1); }}>
              <option value="">Select a saved crawl</option>
              {baselines?.map((item) => <option key={item.id} value={item.id}>{item.settings.name} · {prettyDate(item.createdAt)}</option>)}
            </select></label>
            {run.settings.mode === "site" && <label className="check-field"><input type="checkbox" checked={pathMapping}
              onChange={(event) => { setPathMapping(event.target.checked); setPage(1); }} /> Match by path and query</label>}
          </div>}
          {view !== "sitemaps" && (view !== "compare" || baseline) && <div className="table-toolbar">
            <label className="search-field"><Search size={16} /><input type="search" aria-label="Search URLs" placeholder={view === "urls" ? "Search URL or title" : "Search URLs"} value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
            {view !== "compare" && Boolean(overview?.folders.length) &&
              <select aria-label="URL path group" value={folder} onChange={(event) => { setFolder(event.target.value); setPage(1); }}>
                <option value="">All paths</option>
                {overview?.folders.map(({ path, count }) => <option key={path} value={path}>{path.slice(0, 45)} · {count}</option>)}
              </select>}
            {view === "urls" && <select aria-label="URL status filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
              <option value="">All URLs</option><option value="200">HTTP 200</option><option value="redirects">Redirects</option><option value="errors">HTTP errors</option>
              <option value="unchecked">Not checked</option><option value="eligible">Sitemap candidates</option><option value="sitemap">From sitemap</option>
            </select>}
            {view !== "compare" && <a className="button button-outline button-small" href={exportUrl(view, publicParams)}><Download size={15} /> Export CSV</a>}
            {view === "urls" && <a className="button button-outline button-small" href={exportUrl("inlinks")}><Link2 size={15} /> Inlinks CSV</a>}
          </div>}
          {view === "findings" && rule && <div className="finding-description">
            <strong>{RULES[rule].title}</strong><p>{RULES[rule].explanation}</p>
          </div>}
          {view === "findings" && !run.issuesReady && <p className="table-note">Page findings appear as URLs are checked. Cross-page checks finish when the crawl ends.</p>}
          {view === "compare" && <p className="table-note">A URL may be absent because it was outside scope or the crawl ended early. Review both runs’ coverage before treating a change as a fix.</p>}
          {reportError && <p className="alert report-alert" role="alert">{reportError}</p>}
          {view === "sitemaps" && sitemaps && <SitemapView data={sitemaps} download={exportUrl("sitemap")} inspect={selectUrl} />}
          {view === "compare" && !baseline && <div className="results-empty"><GitCompare size={25} /><p>{baselines?.length ? "Choose a saved crawl to see the changes." : "Run another audit to compare saved results."}</p></div>}
          {!list && !reportError && (view !== "compare" || baseline) && (view !== "sitemaps" || !sitemaps) && <p className="table-note" role="status">Loading results…</p>}
          {list && view !== "sitemaps" && (view !== "compare" || baseline) && <>
            {view === "urls" && <UrlsTable items={list.items as PageRecord[]} inspect={selectUrl} changeSort={sortBy} sort={sort} desc={desc} />}
            {view === "findings" && <FindingsTable items={list.items as Finding[]} inspect={selectUrl} />}
            {view === "compare" && <ChangesTable items={list.items as Change[]} inspect={selectUrl} />}
            {!list.items.length && <div className="results-empty"><Search size={24} /><p>{view === "compare" ? "No differences match this view." : "No results match this view."}</p></div>}
            <div className="pagination"><span>{list.total ? `${(list.page - 1) * list.size + 1}–${Math.min(list.page * list.size, list.total)} of ${prettyNumber(list.total)}` : "0 results"}</span>
              <div><button className="icon-button" aria-label="Previous results page" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)}><ChevronLeft size={17} /></button>
                <button className="icon-button" aria-label="Next results page" disabled={list.page * list.size >= list.total} onClick={() => setPage(list.page + 1)}><ChevronRight size={17} /></button></div></div>
          </>}
        </div>
      </div>
    </section>
    {selectedUrl && <EvidenceDrawer key={selectedUrl} id={id} url={selectedUrl} close={() => selectUrl(null)} inspect={selectUrl} />}
  </main>;
}

function UrlsTable({ items, inspect, changeSort, sort, desc }: { items: PageRecord[]; inspect: (url: string) => void; changeSort: (field: Sort) => void; sort: Sort | ""; desc: boolean }) {
  const columns: [Sort, string][] = [["url", "URL"], ["http", "Response"], ["title", "Title"], ["depth", "Depth"], ["inlinks", "Inlinks"]];
  if (!items.length) return null;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Crawled URLs"><table className="data-table urls-table">
    <thead><tr>{columns.map(([key, label]) => <th key={key} aria-sort={sort === key ? desc ? "descending" : "ascending" : "none"}>
      <button onClick={() => changeSort(key)}>{label}{sort === key ? <ArrowDown className={desc ? "" : "rotate-up"} size={13} /> : <ArrowUpDown size={12} />}</button></th>)}</tr></thead>
    <tbody>{items.map((item) => <tr key={item.url}><td><button className="table-url" onClick={() => inspect(item.url)}>{item.url}</button>{item.note && <small>{item.note}</small>}</td>
      <td><ResponseStatus status={item.http} state={item.state} /></td><td title={item.facts?.title}>{item.facts?.title || "—"}</td><td className="mono">{item.depth}</td><td className="mono">{item.inlinks}</td></tr>)}</tbody>
  </table></div>;
}

function FindingsTable({ items, inspect }: { items: Finding[]; inspect: (url: string) => void }) {
  return items.length ? <div className="table-scroll" role="region" tabIndex={0} aria-label="Audit findings"><table className="data-table findings-table">
    <thead><tr><th>Finding</th><th>Affected URL</th><th>Observed evidence</th><th><span className="sr-only">Inspect</span></th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.code + item.url}><td><span className="finding-name"><i className={`severity-dot severity-${RULES[item.code].severity}`} />{RULES[item.code].title}</span>
      <small className="rule-severity">{RULES[item.code].severity}</small></td><td><button className="table-url" onClick={() => inspect(item.url)}>{item.url}</button></td>
      <td className="evidence-cell" title={item.evidence}>{item.evidence}</td><td><button className="icon-button" aria-label={`Inspect ${item.url}`} onClick={() => inspect(item.url)}><ArrowRight size={16} /></button></td></tr>)}</tbody>
  </table></div> : null;
}

function ChangesTable({ items, inspect }: { items: Change[]; inspect: (url: string) => void }) {
  return items.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Crawl changes"><table className="data-table changes-table">
    <thead><tr><th>URL</th><th>Change</th><th>Details</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.url}><td>{item.type === "not-seen" ? <span className="mono">{item.url}</span> : <button className="table-url" onClick={() => inspect(item.url)}>{item.url}</button>}</td>
      <td>{item.type === "changed" ? "Changed" : item.type === "discovered" ? "Newly observed" : "Not observed"}</td>
      <td>{item.fields.join(" · ")}{item.introduced.length > 0 && <small>New findings: {item.introduced.map((code) => RULES[code].title).join(", ")}</small>}
        {item.resolved.length > 0 && <small>Findings no longer observed: {item.resolved.map((code) => RULES[code].title).join(", ")}</small>}</td></tr>)}</tbody>
  </table></div> : null;
}

function SitemapView({ data, download, inspect }: { data: Sitemaps; download: string; inspect: (url: string) => void }) {
  return <div className="sitemap-view">
    <h2>Sitemap documents</h2>
    {!data.documents.length ? <p className="muted">No sitemap documents have been checked.</p> :
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Sitemap documents"><table className="data-table"><thead><tr><th>URL</th><th>Status</th><th>Result</th></tr></thead>
        <tbody>{data.documents.map((item) => <tr key={item.url}><td className="mono">{item.url}</td><td>{item.state}</td><td>{item.detail || "—"}</td></tr>)}</tbody></table></div>}
    <div className="section-inline sitemap-candidate"><div><h2>Sitemap export</h2><p>{data.count ? `${prettyNumber(data.count)} checked URLs are eligible.` : "Eligible URLs appear after a website crawl completes."}</p></div>
      {data.count > 0 && <a className="button button-outline" href={download}><Download size={16} /> Export XML</a>}</div>
    {data.preview.length > 0 && <div className="sitemap-preview">
      {data.preview.map((url) => <button className="table-url" onClick={() => inspect(url)} key={url}>{url}</button>)}
      {data.count > data.preview.length && <p className="muted">First {data.preview.length} candidates shown.</p>}</div>}
  </div>;
}
