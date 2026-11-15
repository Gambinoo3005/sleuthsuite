import { useState } from "react";
import type { ReviewedInputRow } from "@/model";

export function UrlListReview({ rows, showIds = false }: { rows: ReviewedInputRow[]; showIds?: boolean }) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const selected = filter ? rows.filter((row) => row.status === filter) : rows;
  const pages = Math.max(1, Math.ceil(selected.length / 25));
  const current = Math.min(page, pages);
  return <div className="url-review">
    <label className="field"><span>Show rows</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
      <option value="">All rows</option><option value="ready">Ready</option><option value="duplicate">Duplicates</option><option value="rejected">Rejected</option>
    </select></label>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="URL input review"><table className="data-table url-review-table">
      <thead><tr>{showIds && <th>Input ID</th>}<th>Source row</th><th>Original input</th><th>Normalized URL</th><th>Status</th></tr></thead>
      <tbody>{selected.slice((current - 1) * 25, current * 25).map((row) => <tr key={row.id}>
        {showIds && <td>{row.id}</td>}<td>{row.source} · {row.row}</td><td>{row.value || "Empty cell"}</td>
        <td>{row.url ?? "—"}</td><td>{row.status === "ready" ? "Ready" : row.status === "duplicate" ? "Duplicate" : "Rejected"}</td>
      </tr>)}</tbody>
    </table></div>
    {!selected.length && <p className="table-note">No rows match this filter.</p>}
    {pages > 1 && <div className="pagination">
      <span>Page {current} of {pages}</span>
      <button type="button" className="button button-outline button-small" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
      <button type="button" className="button button-outline button-small" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button>
    </div>}
  </div>;
}
