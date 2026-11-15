import { RULES } from "@/model";
import type { IssueGroup, RunSummary } from "@/model";
import { prettyNumber } from "./common";

export function CoverageBar({ checked, excluded, queued }: { checked: number; excluded: number; queued: number }) {
  const segments = [
    { label: "Checked", count: checked, tone: "checked" },
    { label: "Excluded", count: excluded, tone: "excluded" },
    { label: "Queued", count: queued, tone: "queued" },
  ];
  return <div className="coverage-bar" role="img" aria-label={segments.map(({ label, count }) => `${label}: ${count}`).join(", ")}>
    {segments.filter(({ count }) => count > 0).map(({ count, tone }) => (
      <span key={tone} className={`coverage-${tone}`} style={{ flexGrow: count }} />
    ))}
  </div>;
}

export function severityCounts(groups: IssueGroup[]) {
  const counts = { error: 0, warning: 0, notice: 0 };
  for (const group of groups) counts[RULES[group.code].severity] += group.count;
  return counts;
}

export function CrawlSummary({ run, groups }: { run: RunSummary; groups: IssueGroup[] }) {
  const excluded = run.skipped + run.failed + run.cancelled;
  const status = [
    run.truncated && "Crawl limit reached",
    run.skipped > 0 && `${prettyNumber(run.skipped)} skipped`,
    run.failed > 0 && `${prettyNumber(run.failed)} failed`,
    run.cancelled > 0 && `${prettyNumber(run.cancelled)} cancelled`,
  ].filter(Boolean).join(" · ");
  const counts = severityCounts(groups);
  return <section className="scan-summary" aria-label="Crawl overview">
    <div className="scan-coverage">
      <h2>Crawl coverage</h2>
      <div className="coverage-total"><strong>{prettyNumber(run.checked)}</strong><span>of {prettyNumber(run.discovered)} URLs checked</span></div>
      <CoverageBar checked={run.checked} excluded={excluded} queued={run.queued} />
      <div className="coverage-key">
        <span><i className="coverage-checked" /> Checked</span>
        {excluded > 0 && <span><i className="coverage-excluded" /> Excluded</span>}
        {run.queued > 0 && <span><i className="coverage-queued" /> Queued <b>{prettyNumber(run.queued)}</b></span>}
        {status && <span className="coverage-detail">{status}</span>}
      </div>
    </div>
    <div className="scan-findings">
      <div className="scan-findings-heading"><h2>Findings by severity</h2><span>{prettyNumber(run.findings)} total</span></div>
      <dl>
        {([["error", "Errors"], ["warning", "Warnings"], ["notice", "Notices"]] as const).map(([code, label]) => (
          <div key={code}><dt><i className={`severity-dot severity-${code}`} />{label}</dt><dd>{prettyNumber(counts[code])}</dd></div>
        ))}
      </dl>
    </div>
  </section>;
}
