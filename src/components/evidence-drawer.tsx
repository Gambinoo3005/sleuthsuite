"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Download, ExternalLink, Link2, X } from "lucide-react";
import type { Evidence, Link, RenderEvidence } from "@/model";
import type { RedirectHop } from "@/crawler/rules";
import { api, prettyNumber, ResponseStatus } from "./common";

type EvidenceTab = "Page" | "Incoming" | "Outgoing" | "Headers";
interface Detail { page: Evidence; trace: { hops: RedirectHop[]; loop: string | null; destination: string | null } }

export function EvidenceDrawer({ id, url, close, inspect }: { id: string; url: string; close: () => void; inspect: (url: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Detail | null>(null);
  const [failure, setFailure] = useState("");
  const [tab, setTab] = useState<EvidenceTab>("Page");
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api<Detail>(`/${id}/evidence?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(setData).catch((error: Error) => { if (error.name !== "AbortError") setFailure(error.message); });
    return () => controller.abort();
  }, [id, url]);

  const page = data?.page;
  const linkItems = tab === "Incoming" ? page?.incoming : page?.outgoing;
  return <dialog ref={dialog} className="evidence-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
    if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }
  }} aria-labelledby="evidence-heading">
    <div className="evidence-top"><span><Link2 size={16} /> URL evidence</span><button className="icon-button" aria-label="Close evidence" onClick={close} autoFocus><X size={20} /></button></div>
    <div className="evidence-content">
      <div className="evidence-url">
        {page && <ResponseStatus status={page.http} state={page.state} />}
        <h2 id="evidence-heading">{url}</h2>
        <a className="icon-button" aria-label="Open URL in a new tab" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
      </div>
      {failure && <p className="alert" role="alert">{failure}</p>}
      {!page && !failure && <p className="muted" role="status">Loading URL evidence…</p>}
      {page && <>
        <div className="evidence-tabs" aria-label="Evidence views">
          {(["Page", "Incoming", "Outgoing", "Headers"] as const).map((name) => <button key={name} onClick={() => setTab(name)}
            aria-pressed={tab === name}>{name}{name === "Incoming" ? ` (${page.inlinks})` : ""}</button>)}
        </div>
        {tab === "Page" && <>
          {page.note && <p className="info-message">{page.note}</p>}
          <dl className="evidence-facts">
            <dt>Response</dt><dd>{page.http ? `HTTP ${page.http}` : page.state}</dd>
            <dt>Content type</dt><dd>{page.type || "Unknown"}</dd>
            <dt>Fetch time</dt><dd>{page.ms == null ? "—" : `${prettyNumber(page.ms)} ms`}</dd>
            <dt>Discovery</dt><dd>{page.sources.join(", ") || "—"}</dd>
            <dt>Depth</dt><dd>{page.depth}</dd>
            {page.facts && <>
              <dt>Title</dt><dd>{page.facts.title || "Missing or empty"}</dd>
              <dt>Description</dt><dd>{page.facts.description || "Missing or empty"}</dd>
              <dt>H1</dt><dd>{page.facts.h1.join(" · ") || "Missing or empty"}</dd>
              <dt>Canonical</dt><dd>{page.facts.canonical.join(" · ") || "None observed"}</dd>
              <dt>Robots</dt><dd>{page.facts.robots.join(", ") || "None observed"}</dd>
              <dt>Images</dt><dd>{page.facts.images} total · {page.facts.missingAlt} missing alt · {page.facts.emptyAlt} empty alt</dd>
              <dt>Words</dt><dd>{prettyNumber(page.facts.words)}</dd>
            </>}
          </dl>
          {!!page.location && <section className="evidence-section"><h3>Redirect path</h3>
            <ol className="redirect-list">{data.trace.hops.map((hop) => <li key={hop.url}><ResponseStatus status={hop.http} /><button className="text-button mono" onClick={() => inspect(hop.url)}>{hop.url}</button></li>)}</ol>
            {data.trace.destination && (data.trace.loop || data.trace.hops.at(-1)?.url !== data.trace.destination) &&
              <p className="muted">{data.trace.loop ? "Loop to" : "Unverified destination"} <span className="mono">{data.trace.destination}</span></p>}
          </section>}
          {page.raw && page.facts && <section className="evidence-section"><h3>Source vs. rendered HTML</h3>
            <RenderDiff raw={page.raw} page={page} />
          </section>}
          {!!page.facts?.hreflang.length && <section className="evidence-section"><h3>Hreflang</h3>
            {page.facts.hreflang.map((alternate, index) => <div className="evidence-data" key={index}><b>{alternate.lang || "Empty"}</b><span>{alternate.url || "Invalid URL"}</span></div>)}</section>}
          {page.facts && Object.keys(page.facts.extracted).length > 0 && <section className="evidence-section"><h3>Custom extraction</h3>
            {Object.entries(page.facts.extracted).map(([name, values]) => <div className="evidence-data" key={name}><b>{name}</b><span>{values.join(" · ") || "No match"}</span></div>)}</section>}
        </>}
        {linkItems && <>
          <div className="section-inline link-toolbar"><p>{linkItems.length ? `${linkItems.length} link records shown` : "No links observed."}</p>
            {tab === "Incoming" && <a className="button button-outline button-small" href={`/api/crawls/${id}/export?kind=inlinks&target=${encodeURIComponent(url)}`}><Download size={14} /> CSV</a>}</div>
          {linkItems.map((link, index) => <LinkEvidence key={index} item={link} incoming={tab === "Incoming"} inspect={inspect} />)}
          {linkItems.length === 150 && <p className="muted">This view shows up to 150 link records. Use the inlinks export for the complete link report.</p>}
        </>}
        {tab === "Headers" && <dl className="evidence-facts headers-list">
          {Object.keys(page.headers).length === 0 && <dd>No response headers were recorded.</dd>}
          {Object.entries(page.headers).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
        </dl>}
      </>}
    </div>
  </dialog>;
}

function LinkEvidence({ item, incoming, inspect }: { item: Link; incoming: boolean; inspect: (url: string) => void }) {
  const url = incoming ? item.source : item.target;
  return <div className="evidence-link">
    {incoming ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
    <div><button className="text-button mono" onClick={() => inspect(url)}>{url}</button>
      <small>{item.placement} · {item.anchor || "(no anchor text)"}{item.nofollow ? " · nofollow" : ""}</small></div>
    <ChevronRight size={14} />
  </div>;
}

function RenderDiff({ raw, page }: { raw: RenderEvidence; page: Evidence }) {
  const facts = page.facts!;
  const fields = [
    ["Title", raw.title, facts.title], ["Description", raw.description, facts.description],
    ["H1", raw.h1.join(" · "), facts.h1.join(" · ")],
    ["Robots", raw.robots.join(", "), facts.robots.join(", ")], ["Canonical", raw.canonical.join(" · "), facts.canonical.join(" · ")],
  ];
  const changed = fields.filter(([, a, b]) => a !== b);
  return <>
    <p className="muted">Source HTML contained {raw.links} links. Stored evidence includes {page.outgoingCount} distinct links across source and rendered HTML.</p>
    {changed.length ? changed.map(([label, a, b]) => <div className="render-diff" key={label}><b>{label}</b><div><span>Source</span>{a || "—"}</div><div><span>Rendered</span>{b || "—"}</div></div>)
      : <p className="muted">The captured title, description, headings, robots and canonical were the same.</p>}
  </>;
}
