"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronDown, CircleHelp, FileSearch, Globe, List, Plus, ScanSearch, X } from "lucide-react";
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
    <div className="workspace-heading"><div><div className="work-eyebrow"><ScanSearch size={15} /> TECHNICAL SEO</div>
      <h1>Audit workspace</h1><p>Start a crawl or investigate a saved result.</p></div>
      <Link href="/workspace/crawls/sample" className="button button-outline">Open sample audit <ArrowUpRight size={16} /></Link>
    </div>
    <div className="dashboard-grid">
      <section className="work-card crawl-card"><div className="section-card-heading"><span className="card-icon"><Plus size={20} /></span><div><h2>New crawl</h2><p>Choose how SleuthSuite should discover pages.</p></div></div>
        <form onSubmit={submit} className="crawl-form">
          <div className="segmented" aria-label="Crawl mode">
            <button type="button" aria-pressed={mode === "site"} onClick={() => { setMode("site"); setUrls((current) => current.split(/\r?\n/)[0]); setFormError(""); }}><Globe size={16} /> Website</button>
            <button type="button" aria-pressed={mode === "list"} onClick={() => { setMode("list"); setFormError(""); }}><List size={16} /> URL list</button>
          </div>
          <label className="field"><span>{mode === "site" ? "Starting URL" : "URLs to check"}</span>
            {mode === "site" ? <input name="address" type="url" placeholder="https://example.com/" value={urls.split("\n")[0]} required
              onChange={(event) => setUrls(event.target.value)} spellCheck={false} autoComplete="url" /> :
              <textarea name="addresses" rows={4} placeholder={"https://example.com/old-page\nhttps://example.com/new-page"} value={urls} required
                onChange={(event) => setUrls(event.target.value)} spellCheck={false} />}
            <small>{mode === "site" ? "Discovers links on the starting origin. Public HTTP(S) sites are supported." : "Use one absolute URL per line. The crawler checks those URLs and their same-origin redirects."}</small>
          </label>
          <details className="form-details">
            <summary>Crawl settings <ChevronDown size={16} /></summary>
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
          {formError && <p className="alert" role="alert">{formError}</p>}
          {active && <div className="info-message"><CircleHelp size={17} /><span><Link href={`/workspace/crawls/${active.id}`}>{active.settings.name}</Link> is active. Finish or stop it to start another crawl.</span></div>}
          <button className="button button-primary launch-button" type="submit" disabled={pending || Boolean(active)}>
            {pending ? "Starting crawl…" : "Start crawl"} <ArrowRight size={17} />
          </button>
        </form>
      </section>
      <section className="work-card history-card"><div className="section-card-heading"><span className="card-icon"><FileSearch size={19} /></span><div><h2>Saved crawls</h2><p>Open a run to review its findings and exports.</p></div></div>
        {loadError && <div className="alert" role="alert">{loadError} <button className="text-button" onClick={() => void refresh()}>Retry</button></div>}
        {runs === null && !loadError && <p className="muted">Loading saved crawls…</p>}
        {runs?.length === 0 && <div className="empty-state"><FileSearch size={31} /><h3>No saved crawls yet</h3><p>Your first crawl will appear here.</p><Link href="/workspace/crawls/sample">Explore an example <ArrowUpRight size={14} /></Link></div>}
        {runs && runs.length > 0 && <div className="run-list">
          {runs.map((run) => <Link className="saved-run" href={`/workspace/crawls/${run.id}`} key={run.id}>
            <div><strong>{run.settings.name}</strong><span>{prettyDate(run.createdAt)} · {prettyNumber(run.discovered)} URLs · {prettyNumber(run.findings)} findings</span></div>
            <RunStatus state={run.state} /><ArrowUpRight className="saved-arrow" size={15} />
          </Link>)}
        </div>}
      </section>
    </div>
  </main>;
}
