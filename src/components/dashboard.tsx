"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronDown, CircleHelp, FileSearch, Globe, List, Plus, SlidersHorizontal, X } from "lucide-react";
import { isActive } from "@/model";
import type { ExtractionRule, Mode, RunSummary } from "@/model";
import { api, prettyDate, prettyNumber, RunStatus } from "./common";

export function Dashboard() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [mode, setMode] = useState<Mode>("site");
  const [urls, setUrls] = useState("");
  const [pending, setPending] = useState(false);
  const [rules, setRules] = useState<ExtractionRule[]>([]);
  const active = runs?.find((run) => isActive(run.state));

  const refresh = useCallback(async () => {
    try {
      setRuns(await api<RunSummary[]>(""));
      setLoadError("");
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ id: string }>("", {
        method: "POST",
        body: JSON.stringify({ ...Object.fromEntries(data), mode, urls, extract: rules, followNofollow: data.get("followNofollow") === "on" }),
      });
      router.push(`/workspace/crawls/${result.id}`);
    } catch (error) {
      setFormError((error as Error).message);
      setPending(false);
    }
  }

  function updateRule(index: number, key: keyof ExtractionRule, value: string) {
    setRules((current) => current.map((rule, cursor) => cursor === index ? { ...rule, [key]: value } : rule));
  }

  return <main id="content" className="work-main">
    <div className="workspace-heading"><h1>Crawls</h1></div>
    <form onSubmit={submit} className="work-card crawl-form" aria-labelledby="new-crawl-title">
      <div className="composer-heading">
        <h2 id="new-crawl-title">New crawl</h2>
        <div className="segmented" role="group" aria-label="Crawl mode">
          <button type="button" aria-pressed={mode === "site"} onClick={() => { setMode("site"); setUrls((current) => current.split(/\r?\n/)[0]); setFormError(""); }}><Globe size={16} /> Website</button>
          <button type="button" aria-pressed={mode === "list"} onClick={() => { setMode("list"); setFormError(""); }}><List size={16} /> URL list</button>
        </div>
      </div>
      <div className="compose-target">
        <div className="field">
          <label htmlFor="crawl-address">{mode === "site" ? "Starting URL" : "URLs to check"}</label>
          {mode === "site" ? <input id="crawl-address" name="address" type="url" placeholder="https://example.com/" value={urls.split("\n")[0]} required
            onChange={(event) => setUrls(event.target.value)} spellCheck={false} autoComplete="url" aria-describedby="crawl-address-help" /> :
            <textarea id="crawl-address" className="url-list-input" name="addresses" rows={3} placeholder={"https://example.com/old-page\nhttps://example.com/new-page"} value={urls} required
              onChange={(event) => setUrls(event.target.value)} spellCheck={false} aria-describedby="crawl-address-help" />}
          <small id="crawl-address-help">{mode === "site" ? "Discovers links on the starting origin." : "Enter one absolute URL per line."}</small>
        </div>
        <button className="button button-primary launch-button" type="submit" disabled={pending || Boolean(active)}>
          {pending ? "Starting crawl…" : "Start crawl"} <ArrowRight size={17} />
        </button>
      </div>
      {formError && <p className="alert" role="alert">{formError}</p>}
      {active && <div className="info-message"><CircleHelp size={17} /><span><Link href={`/workspace/crawls/${active.id}`}>{active.settings.name}</Link> is active. Finish or stop it to start another crawl.</span></div>}
      <details className="form-details">
        <summary><span><SlidersHorizontal size={16} /> Crawl settings</span><ChevronDown size={16} /></summary>
        <div className="settings-grid">
          <label className="field"><span>Crawl name</span><input name="name" placeholder="Optional" maxLength={85} /></label>
          <label className="field"><span>Rendering mode</span><select name="rendering"><option value="html">HTML</option><option value="chromium">Chromium</option></select></label>
          {mode === "site" && <label className="field"><span>Scope</span><select name="scope"><option value="origin">Starting origin</option><option value="path">Starting path and descendants</option></select></label>}
          <label className="field"><span>URL limit</span><input name="limit" type="number" defaultValue="1000" min="1" max="10000" required /></label>
          {mode === "site" && <label className="field"><span>Link depth limit</span><input name="depth" type="number" defaultValue="10" min="0" max="40" required /></label>}
          <label className="field"><span>Requests per second</span><input name="rate" type="number" defaultValue="2" min="1" max="15" required /></label>
          {mode === "site" && <>
            <label className="field full-field"><span>Sitemap URL</span><input name="sitemap" placeholder="/sitemap.xml" /><small>Optional. Crawls also read sitemap declarations in robots.txt.</small></label>
            <label className="check-field full-field"><input name="followNofollow" type="checkbox" /> Discover URLs from nofollow links</label>
          </>}
        </div>
        <div className="extraction-form"><div className="section-inline"><div><h3>Custom extraction</h3><p>Optional CSS selectors for text or an attribute.</p></div>
          <button type="button" className="button button-outline button-small" disabled={rules.length >= 5} onClick={() => setRules([...rules, { name: "", selector: "" }])}><Plus size={14} /> Add rule</button></div>
          {rules.map((rule, index) => <div className="extraction-row" key={index}>
            <input aria-label={`Rule ${index + 1} name`} placeholder="Name" value={rule.name} required onChange={(event) => updateRule(index, "name", event.target.value)} />
            <input aria-label={`Rule ${index + 1} selector`} placeholder="article h2" value={rule.selector} required onChange={(event) => updateRule(index, "selector", event.target.value)} />
            <input aria-label={`Rule ${index + 1} attribute`} placeholder="Attribute (optional)" value={rule.attribute ?? ""} onChange={(event) => updateRule(index, "attribute", event.target.value)} />
            <button className="icon-button" type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(rules.filter((_, cursor) => cursor !== index))}><X size={15} /></button>
          </div>)}
        </div>
      </details>
    </form>
    <section className="history-section" aria-labelledby="history-title">
      <div className="history-heading"><h2 id="history-title">Saved crawls</h2>{runs?.length ? <span className="mono">{runs.length}</span> : null}</div>
      {loadError && <div className="alert" role="alert">{loadError} <button className="text-button" onClick={() => void refresh()}>Retry</button></div>}
      {runs === null && !loadError && <p className="table-note" role="status">Loading saved crawls…</p>}
      {runs?.length === 0 && <div className="empty-state"><FileSearch size={22} strokeWidth={1.5} /><span>No crawls yet. Start one above to save a report here.</span></div>}
      {runs && runs.length > 0 && <div className="table-scroll history-table" tabIndex={0} role="region" aria-label="Saved crawl history">
        <table className="data-table"><thead><tr><th scope="col">Crawl</th><th scope="col">Status</th><th scope="col">URLs</th><th scope="col">Findings</th><th scope="col">Started</th></tr></thead>
          <tbody>{runs.map((run) => <tr className="saved-run" key={run.id}>
            <td><Link href={`/workspace/crawls/${run.id}`}>{run.settings.name} <ArrowUpRight size={14} /></Link><small>{run.origin}</small></td>
            <td><RunStatus state={run.state} /></td>
            <td className="mono">{prettyNumber(run.discovered)}</td>
            <td className="mono">{prettyNumber(run.findings)}</td>
            <td>{prettyDate(run.createdAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </main>;
}
