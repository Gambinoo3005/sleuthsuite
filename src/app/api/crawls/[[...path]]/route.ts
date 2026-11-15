import { database, createRun, getRun, recentRuns, setRunState } from "@/db";
import { parseSettings } from "@/crawler/urls";
import { redirectTrace } from "@/crawler/rules";
import { sitemapXml } from "@/crawler/xml";
import { compareRuns, evidence, findings, issueGroups, makeExport, pages, pathGroups, resources, xmlCandidates } from "@/queries";
import { SAMPLE_ID, sampleDatabase } from "@/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status: number) => json({ error: message }, status);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function allowed(request: Request, write = false) {
  const origin = new URL(process.env.SLEUTHSUITE_ORIGIN || "http://127.0.0.1:3000");
  if (request.headers.get("host") !== origin.host) return false;
  return !write || request.headers.get("origin") === origin.origin;
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Provide crawl settings.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 700_000) {
      await reader.cancel();
      throw new Error("The request body is too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function GET(request: Request, context: Context) {
  if (!allowed(request)) return error("Open SleuthSuite on its local address.", 403);
  const [id, view, ...extra] = (await context.params).path ?? [];
  const params = new URL(request.url).searchParams;
  if (extra.length || (id && id !== SAMPLE_ID && !uuid.test(id))) return error("Crawl not found.", 404);
  const db = id === SAMPLE_ID ? sampleDatabase() : database();
  if (!id) return json(recentRuns(db));
  const crawl = getRun(db, id);
  if (!crawl) return error("Crawl not found.", 404);
  if (!view) return json({ crawl, issues: issueGroups(db, id), folders: pathGroups(db, id) });
  if (view === "urls") return json(pages(db, id, params));
  if (view === "findings") return json(findings(db, id, params));
  if (view === "sitemaps") {
    const candidates = crawl.state === "complete" && crawl.settings.mode === "site" ? xmlCandidates(db, id) : [];
    return json({ documents: resources(db, id), count: candidates.length, preview: candidates.slice(0, 40) });
  }
  if (view === "evidence") {
    const url = params.get("url") || "";
    const page = evidence(db, id, url);
    return page ? json({ page, trace: redirectTrace(db, id, url) }) : error("This URL has no stored result in this run.", 404);
  }
  if (view === "compare") {
    const baseline = params.get("baseline") || "";
    if (!uuid.test(baseline) || baseline === id || id === SAMPLE_ID) return error("Select a different saved crawl.", 400);
    const previous = getRun(db, baseline);
    if (!previous || !previous.issuesReady || !crawl.issuesReady) return error("Select two runs with completed analysis.", 409);
    if (params.get("map") === "path" && (previous.settings.mode !== "site" || crawl.settings.mode !== "site")) return error("Path mapping is available for site crawls.", 400);
    return json(compareRuns(db, id, baseline, params));
  }
  if (view === "export") {
    const kind = params.get("kind") || "urls";
    if (kind === "sitemap") {
      if (crawl.state !== "complete" || crawl.settings.mode !== "site") return error("Complete a website crawl to export a sitemap.", 409);
      const candidates = xmlCandidates(db, id);
      if (!candidates.length) return error("No eligible URLs were checked.", 409);
      return new Response(sitemapXml(candidates), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": 'attachment; filename="sleuthsuite-sitemap.xml"', "Cache-Control": "no-store" },
      });
    }
    const body = makeExport(db, id, kind, params);
    if (!body) return error("Unknown export format.", 400);
    return new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sleuthsuite-${kind}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return error("Report not found.", 404);
}

export async function POST(request: Request, context: Context) {
  if (!allowed(request, true)) return error("Submit crawl changes from the local workspace.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return error("Expected JSON settings.", 415);
  const path = (await context.params).path ?? [];
  const db = database();
  try {
    if (!path.length) {
      const body = await readBody(request);
      const settings = parseSettings(body);
      try {
        return json({ id: createRun(db, settings) }, 201);
      } catch (problem) {
        if (problem instanceof Error && /UNIQUE constraint failed/.test(problem.message)) return error("There is already an active crawl. Finish or stop it to start a new one.", 409);
        throw problem;
      }
    }
    const [id, action] = path;
    if (path.length !== 2 || !uuid.test(id) || !getRun(db, id)) return error("Crawl not found.", 404);
    if (action === "rerun") {
      try {
        return json({ id: createRun(db, getRun(db, id)!.settings) }, 201);
      } catch (problem) {
        if (problem instanceof Error && /UNIQUE constraint failed/.test(problem.message)) return error("Finish or stop the active crawl before starting another.", 409);
        throw problem;
      }
    }
    if (!setRunState(db, id, action)) return error("That action is unavailable in the current crawl state.", 409);
    return json({ ok: true });
  } catch (problem) {
    if (problem instanceof Error && !("code" in problem)) return error(problem instanceof SyntaxError ? "Enter valid JSON settings." : problem.message, 400);
    console.error("SleuthSuite write failed", problem);
    return error("Could not save the crawl change.", 500);
  }
}
