import Link from "next/link";
import { ScanSearch } from "lucide-react";
import type { RunState, UrlState } from "@/model";

export function Brand() {
  return <Link href="/" className="brand" aria-label="SleuthSuite home">
    <span className="brand-mark"><ScanSearch size={18} strokeWidth={2.3} /></span>
    <span>Sleuth<span className="brand-suffix">Suite</span></span>
  </Link>;
}


export const stateLabel: Record<RunState, string> = {
  queued: "Queued", running: "Crawling", pausing: "Pausing", paused: "Paused",
  stopping: "Stopping", stopped: "Stopped", complete: "Complete", failed: "Failed",
};

export function RunStatus({ state }: { state: RunState }) {
  return <span className={`state-pill state-${state}`}><i />{stateLabel[state]}</span>;
}

export function ResponseStatus({ status, state }: { status: number | null; state?: UrlState }) {
  const tone = status ? status >= 400 ? "bad" : status >= 300 ? "warn" : "good" : "neutral";
  const label = status || (state === "done" ? "—" : state ?? "—");
  return <span className={`response response-${tone}`}>{label}</span>;
}

export function prettyDate(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function prettyNumber(value: number) { return value.toLocaleString(); }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/crawls${path}`, {
    ...init, cache: "no-store", headers: init?.method === "POST" ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong. Try again.");
  return body as T;
}
