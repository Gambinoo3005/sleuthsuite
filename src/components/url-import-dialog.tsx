"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { readTextInput, tableInput } from "@/url-import";
import { MAX_INPUT_ROWS, reviewInput } from "@/crawler/urls";
import type { InputRow } from "@/model";
import { api } from "./common";
import { UrlListReview } from "./url-list-review";

const maxFileBytes = 2_000_000;

export function UrlImportDialog({ current, onImport, onClose }: {
  current: InputRow[];
  onImport: (source: { label: string; rows: InputRow[] }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const revision = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ label: string; rows: InputRow[] } | null>(null);
  const [workbook, setWorkbook] = useState<{ bytes: ArrayBuffer; filename: string; tabs: string[] } | null>(null);
  const [tab, setTab] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const reviewed = preview ? reviewInput([...current, ...preview.rows]).slice(current.length) : [];
  const ready = reviewed.filter((row) => row.status === "ready").length;
  const duplicates = reviewed.filter((row) => row.status === "duplicate").length;
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    chooseButton.current?.focus();
    return () => { revision.current++; controller.current?.abort(); modal?.close(); };
  }, []);

  async function readTab(book: NonNullable<typeof workbook>, name: string, request: number) {
    const xlsx = await import("xlsx");
    const sheet = xlsx.read(book.bytes, { sheets: name, sheetRows: MAX_INPUT_ROWS + 2, cellFormula: false, cellHTML: false }).Sheets[name];
    const label = `${book.filename} · ${name}`.slice(0, 240);
    if (sheet?.["!fullref"] && sheet["!fullref"] !== sheet["!ref"]) throw new Error("This worksheet exceeds the import row limit.");
    const range = sheet?.["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
    if (range && range.e.c - range.s.c >= 200) throw new Error("This tab is too wide. Copy the URL column to a separate tab.");
    const rows = range ? tableInput(label, xlsx.utils.sheet_to_json<string[]>(sheet, {
      header: 1, raw: false, defval: "", blankrows: true,
    }), range.s.r + 1) : [];
    if (request === revision.current) setPreview({ label, rows });
  }

  async function chooseTab(name: string) {
    if (!workbook) return;
    const request = ++revision.current;
    setTab(name);
    setPreview(null);
    setError("");
    setLoading(true);
    try { await readTab(workbook, name, request); }
    catch (problem) { if (request === revision.current) setError((problem as Error).message); }
    finally { if (request === revision.current) setLoading(false); }
  }

  async function readGoogleSheet() {
    const request = ++revision.current;
    controller.current?.abort();
    const signal = new AbortController();
    controller.current = signal;
    setWorkbook(null);
    setPreview(null);
    setError("");
    setLoading(true);
    try {
      const result = await api<{ label: string; rows: InputRow[] }>("/google-sheet", {
        method: "POST", body: JSON.stringify({ url: sheetLink }), signal: signal.signal,
      });
      if (request === revision.current) setPreview(result);
    } catch (problem) {
      if (request === revision.current) setError((problem as Error).message);
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    const request = ++revision.current;
    controller.current?.abort();
    setWorkbook(null);
    setPreview(null);
    setError("");
    setLoading(false);
    if (files.length !== 1) { setError("Choose one file at a time."); return; }
    const file = files[0];
    if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(file.name)) { setError("Choose a CSV, TSV, TXT, XLSX, or XLS file."); return; }
    if (file.size > maxFileBytes) { setError("Choose a file smaller than 2 MB."); return; }
    setLoading(true);
    try {
      const bytes = await file.arrayBuffer();
      if (request !== revision.current) return;
      if (/\.xlsx?$/i.test(file.name)) {
        const { read } = await import("xlsx");
        const tabs = read(bytes, { bookSheets: true }).SheetNames;
        if (request !== revision.current) return;
        if (!tabs.length) throw new Error("This workbook has no worksheets.");
        const book = { bytes, filename: file.name, tabs };
        setWorkbook(book);
        setTab(tabs[0]);
        await readTab(book, tabs[0], request);
        return;
      }
      const bom = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      const encoding = bom[0] === 255 && bom[1] === 254 ? "utf-16le" : bom[0] === 254 && bom[1] === 255 ? "utf-16be" : "utf-8";
      let text: string;
      try {
        text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch {
        throw new Error("Save the file as UTF-8 and try again.");
      }
      setPreview({ label: file.name, rows: readTextInput(file.name, text) });
    } catch (problem) {
      if (request === revision.current) setError(problem instanceof Error ? problem.message : "Could not read this file.");
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }

  return <dialog ref={dialog} className="url-import-dialog" aria-labelledby="url-import-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); setDragging(false); void readFiles(event.dataTransfer.files); }}>
    <div className="url-import-content">
      <div className="url-import-heading">
        <h2 id="url-import-title">Import URLs</h2>
        <button type="button" className="icon-button" aria-label="Close import" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="url-drop-zone" data-dragging={dragging}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}>
        <Upload size={23} strokeWidth={1.6} aria-hidden="true" />
        <p>Drop a file here</p>
        <button ref={chooseButton} type="button" className="button button-outline button-small" onClick={() => input.current?.click()}>Choose file</button>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={(event) => {
          void readFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }} />
        <small>CSV, TSV, TXT, XLSX, or XLS · Up to 2 MB</small>
      </div>
      <p className="url-import-hint">Use one domain or URL per line in a text file, or a URL or Address column in a table.</p>
      <div className="url-sheet-field">
        <label className="field"><span>Google Sheets link</span><input type="url" value={sheetLink} placeholder="https://docs.google.com/spreadsheets/…" onChange={(event) => setSheetLink(event.target.value)} /></label>
        <button type="button" className="button button-outline button-small" disabled={!sheetLink.trim() || loading} onClick={() => void readGoogleSheet()}>Load sheet</button>
      </div>
      <p className="url-import-hint">Use a sheet link that opens without sign-in. For a private sheet, upload an Excel or CSV download.</p>
      {workbook && <label className="field"><span>Worksheet</span><select value={tab} onChange={(event) => void chooseTab(event.target.value)}>
        {workbook.tabs.map((name) => <option key={name}>{name}</option>)}
      </select></label>}
      {loading && <p className="url-import-hint" role="status">Reading rows…</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      {preview && <><div className="url-import-preview">
        <div><FileText size={16} /><strong>{preview.label}</strong></div>
        <p role="status">{ready} ready · {duplicates} duplicates · {reviewed.length - ready - duplicates} rejected</p>
      </div>
      {reviewed.length > 0 && <UrlListReview key={preview.label} rows={reviewed} />}</>}
      <div className="url-import-actions">
        <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-primary" disabled={!preview?.rows.length || loading}
          onClick={() => { if (preview?.rows.length) onImport(preview); }}>Add to list</button>
      </div>
    </div>
  </dialog>;
}
