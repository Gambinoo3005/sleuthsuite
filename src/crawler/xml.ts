import { gunzipSync } from "node:zlib";
import { SaxesParser } from "saxes";

const MAX_XML = 8 * 1024 * 1024;

export function parseSitemap(buffer: Buffer): { index: boolean; urls: string[] } {
  const body = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer, { maxOutputLength: MAX_XML }) : buffer;
  if (body.length > MAX_XML) throw new Error("Sitemap exceeds the XML body limit.");
  const parser = new SaxesParser({ xmlns: true });
  const nodes: string[] = [];
  const urls: string[] = [];
  let root = "";
  let location = "";
  parser.on("doctype", () => { throw new Error("Sitemap cannot contain a document type declaration."); });
  parser.on("opentag", (node) => {
    nodes.push(node.local);
    if (nodes.length === 1) {
      root = node.local;
      if (root !== "urlset" && root !== "sitemapindex") throw new Error("Expected a sitemap URL set or index.");
    }
    if (nodes.length > 50) throw new Error("Sitemap XML is nested too deeply.");
    if (nodes.length === 3 && node.local === "loc") location = "";
  });
  const addText = (text: string) => {
    if (nodes.length === 3 && nodes[2] === "loc") location = (location + text).slice(0, 4_097);
  };
  parser.on("text", addText);
  parser.on("cdata", addText);
  parser.on("closetag", () => {
    if (nodes.length === 3 && nodes[2] === "loc" &&
      ((root === "urlset" && nodes[1] === "url") || (root === "sitemapindex" && nodes[1] === "sitemap"))) {
      if (urls.length >= 50_000) throw new Error("Sitemap contains more than 50,000 locations.");
      if (location.trim()) urls.push(location.trim());
    }
    nodes.pop();
  });
  parser.write(body.toString("utf8")).close();
  return { index: root === "sitemapindex", urls };
}

export function sitemapXml(urls: string[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => `  <url><loc>${escape(url)}</loc></url>`).join("\n") + "\n</urlset>\n";
}
