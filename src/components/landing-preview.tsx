"use client";

import { useState } from "react";
import Link from "next/link";
import { AppWindow, ArrowRight, CornerDownRight, FlaskConical, Globe2, Layers3, Link2, ScanSearch } from "lucide-react";
import { ResponseStatus } from "./common";
import { CoverageBar } from "./crawl-summary";

const example = [
  { path: "/guides/old-setup", status: 404, label: "Broken page", sources: [{ path: "/", label: "Setup guide", place: "Footer" }, { path: "/guides", label: "Legacy setup", place: "Main" }, { path: "/guides/getting-started", label: "Classic setup guide", place: "Main" }, { path: "/pricing", label: "Setup guide", place: "Footer" }] },
  { path: "/docs", status: 301, label: "Redirect chain", sources: [{ path: "/guides", label: "Docs", place: "Main" }] },
  { path: "/signup", status: 200, label: "Missing title", sources: [{ path: "/pricing", label: "Sign up", place: "Main" }] },
];

export function LandingPreview({ checked, discovered, findings, errors, warnings }: {
  checked: number; discovered: number; findings: number; errors: number; warnings: number;
}) {
  const [active, setActive] = useState(0);
  const selected = example[active];
  return <div className="product-preview">
    <div className="preview-chrome">
      <div className="traffic-dots" aria-hidden><span /><span /><span /></div>
      <div className="preview-address"><Globe2 size={13} /> northstar.example</div>
      <span className="preview-mode"><i /> Sample crawl</span>
    </div>
    <div className="preview-body">
      <aside className="preview-rail" aria-hidden="true">
        <span className="preview-rail-mark"><ScanSearch size={16} strokeWidth={2.3} /></span>
        <span><Layers3 size={15} /> Crawls</span>
        <span className="preview-rail-active"><FlaskConical size={15} /> Sample</span>
        <span><AppWindow size={15} /> Home</span>
      </aside>
      <div className="preview-audit">
        <div className="preview-audit-head">
          <h2>Northstar Studio</h2>
          <span className="preview-complete"><i /> Complete</span>
        </div>
        <div className="preview-summary">
          <div className="preview-coverage"><span>Crawl coverage</span><div><strong>{checked}</strong><span>of {discovered} URLs checked</span></div>
            <CoverageBar checked={checked} excluded={discovered - checked} queued={0} />
          </div>
          <div className="preview-findings"><span>Findings</span><strong>{findings}</strong>
            <small>{errors} {errors === 1 ? "error" : "errors"} · {warnings} {warnings === 1 ? "warning" : "warnings"}</small>
          </div>
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
        <div className="preview-evidence-label"><ScanSearch size={15} /> URL evidence</div>
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
