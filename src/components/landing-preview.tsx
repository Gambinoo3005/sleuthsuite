"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleAlert, CornerDownRight, FileText, Globe2, Layers3, Link2, Route, ScanSearch } from "lucide-react";
import { ResponseStatus } from "./common";

const example = [
  { path: "/guides/old-setup", status: 404, label: "Broken page", sources: [{ path: "/", label: "Setup guide", place: "Footer" }, { path: "/guides", label: "Legacy setup", place: "Main" }, { path: "/guides/getting-started", label: "Classic setup guide", place: "Main" }, { path: "/pricing", label: "Setup guide", place: "Footer" }] },
  { path: "/docs", status: 301, label: "Redirect chain", sources: [{ path: "/guides", label: "Docs", place: "Main" }] },
  { path: "/signup", status: 200, label: "Missing title", sources: [{ path: "/pricing", label: "Sign up", place: "Main" }] },
];

export function LandingPreview() {
  const [active, setActive] = useState(0);
  const selected = example[active];
  return <div className="product-preview">
    <div className="preview-chrome">
      <div className="traffic-dots" aria-hidden><span /><span /><span /></div>
      <div className="preview-address"><Globe2 size={13} /> northstar.example</div>
      <span className="preview-mode"><i /> Sample crawl</span>
    </div>
    <div className="preview-body">
      <aside className="preview-rail" aria-label="Audit preview sections">
        <span className="preview-rail-title">NORTHSTAR</span>
        <span><Layers3 size={15} /> Overview</span>
        <span className="preview-rail-active"><CircleAlert size={15} /> Findings</span>
        <span><FileText size={15} /> URLs</span>
        <span><Route size={15} /> Sitemaps</span>
      </aside>
      <div className="preview-audit">
        <div className="preview-audit-head">
          <div><div className="mono preview-caption">WEBSITE AUDIT</div><h2>Northstar Studio</h2></div>
          <span className="preview-complete"><i /> Complete</span>
        </div>
        <div className="preview-metrics">
          <div><span>Discovered</span><strong>14</strong></div>
          <div><span>Checked</span><strong>13</strong></div>
          <div><span>Broken pages</span><strong className="red-text">1</strong></div>
        </div>
        <div className="preview-table">
          <div className="preview-table-head"><span>URL / Finding</span><span>HTTP</span></div>
          {example.map((item, index) => <button key={item.path} className={`preview-row ${index === active ? "selected" : ""}`}
            aria-pressed={index === active} onClick={() => setActive(index)}>
            <span><b>{item.path}</b><small>{item.label}</small></span><ResponseStatus status={item.status} />
          </button>)}
        </div>
      </div>
      <div className="preview-evidence">
        <div className="preview-evidence-label"><ScanSearch size={15} /> URL evidence <ArrowUpRight size={13} /></div>
        <ResponseStatus status={selected.status} />
        <h3 className="mono">{selected.path}</h3>
        <div className="preview-inlinks"><Link2 size={14} /> Incoming links <b>{selected.sources.length}</b></div>
        {selected.sources.slice(0, 3).map((source) => <div className="preview-source" key={source.path}>
          <CornerDownRight size={13} /><div><span>{source.path}</span><small>{source.place} · {source.label}</small></div>
        </div>)}
        <Link className="preview-open" href="/workspace/crawls/sample">Explore full sample <ArrowRight size={13} /></Link>
      </div>
    </div>
  </div>;
}
