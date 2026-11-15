"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { prepareUrlImport } from "@/url-import";

const maxFileBytes = 2_000_000;

export function UrlImportDialog({ current, onImport, onClose }: {
  current: string;
  onImport: (urls: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const revision = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<(ReturnType<typeof prepareUrlImport> & { filename: string }) | null>(null);

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    chooseButton.current?.focus();
    return () => { revision.current++; modal?.close(); };
  }, []);

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    const request = ++revision.current;
    setPreview(null);
    setError("");
    setLoading(false);
    if (files.length !== 1) { setError("Choose one file at a time."); return; }
    const file = files[0];
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setError("Choose a CSV, TSV, or TXT file."); return; }
    if (file.size > maxFileBytes) { setError("Choose a file smaller than 2 MB."); return; }
    setLoading(true);
    try {
      const bytes = await file.arrayBuffer();
      if (request !== revision.current) return;
      const bom = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      const encoding = bom[0] === 255 && bom[1] === 254 ? "utf-16le" : bom[0] === 254 && bom[1] === 255 ? "utf-16be" : "utf-8";
      let text: string;
      try {
        text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch {
        throw new Error("Save the file as UTF-8 and try again.");
      }
      setPreview({ ...prepareUrlImport(file.name, text, current), filename: file.name });
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
        <input ref={input} type="file" accept=".csv,.tsv,.txt" hidden onChange={(event) => {
          void readFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }} />
        <small>CSV, TSV, or TXT · Up to 2 MB</small>
      </div>
      <p className="url-import-hint">Use one domain or URL per line in a text file, or a URL or Address column in a table.</p>
      {loading && <p className="url-import-hint" role="status">Reading file…</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      {preview && <div className="url-import-preview" role="status">
        <div><FileText size={16} /><strong>{preview.filename}</strong></div>
        <p>{preview.added.length === 1 ? "1 new URL ready to add" : preview.added.length
          ? `${preview.added.length.toLocaleString()} new URLs ready to add` : "No new URLs to add"}
          {preview.duplicates === 1 ? " · 1 duplicate skipped" : preview.duplicates > 0 ? ` · ${preview.duplicates.toLocaleString()} duplicates skipped` : ""}
          {preview.invalid === 1 ? " · 1 invalid or missing URL skipped" : preview.invalid > 0 ? ` · ${preview.invalid.toLocaleString()} invalid or missing URLs skipped` : ""}
        </p>
        {preview.added.length > 0 && <ul>{preview.added.slice(0, 3).map((url) => <li key={url}>{url}</li>)}</ul>}
      </div>}
      <div className="url-import-actions">
        <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-primary" disabled={!preview?.added.length || loading}
          onClick={() => { if (preview?.added.length) onImport(preview.combined); }}>Add URLs</button>
      </div>
    </div>
  </dialog>;
}
