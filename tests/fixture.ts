import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

export function html(title: string, body: string, head = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
    <meta name="description" content="Description for ${title}">${head}</head><body><h1>${title}</h1>${body}</body></html>`;
}

export async function fixture(size = 0) {
  let origin = "";
  const hits = new Map<string, number>();
  const server = createServer((request, response) => {
    const path = new URL(request.url || "/", origin).pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const send = (body: string | Buffer, type = "text/html; charset=utf-8", status = 200) => {
      response.writeHead(status, { "Content-Type": type });
      response.end(body);
    };
    const redirect = (url: string) => { response.writeHead(301, { Location: url }); response.end(); };
    if (path === "/robots.txt") return send(`User-agent: *\nDisallow: /blocked\nSitemap: ${origin}/sitemap.xml\n`, "text/plain");
    if (path === "/sitemap.xml" && size) return send("<urlset></urlset>", "application/xml");
    if (path === "/sitemap.xml") return send(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-child.xml.gz</loc></sitemap></sitemapindex>`, "application/xml");
    if (path === "/sitemap-child.xml.gz") return send(gzipSync(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/orphan", "/noindex", "/blocked", "/missing"].map((url) => `<url><loc>${origin}${url}</loc></url>`).join("")}</urlset>`), "application/gzip");
    if (size) {
      const index = path === "/" ? 0 : Number(path.slice(1));
      if (!Number.isFinite(index) || index >= size) return send("Not found", "text/plain", 404);
      const start = index * 10 + 1;
      const links = Array.from({ length: 10 }, (_, i) => start + i).filter((child) => child < size)
        .map((child) => `<a href="/${child}">Page ${child}</a>`).join("");
      return send(html(`Page ${index}`, `<main>${links}</main><footer><a href="/">Home</a></footer>`));
    }
    if (path === "/") return send(html("Fixture", `<main>${["missing", "redirect", "loop-a", "blocked", "duplicate-a", "duplicate-b", "noindex", "localized", "en", "render", "slow", "retry", "canonical"].map((url) => `<a href="/${url}">${url}</a>`).join("")}
      <a href="/nofollow" rel="nofollow">Ignored</a><a href="https://example.net/">Outside</a>
      <img src="/test.png"><img src="/decor.png" alt=""></main>`));
    if (path === "/redirect") return redirect("/second");
    if (path === "/second") return redirect("/final");
    if (path === "/loop-a") return redirect("/loop-b");
    if (path === "/loop-b") return redirect("/loop-a");
    if (path === "/missing") return send("Gone", "text/plain", 404);
    if (path === "/retry" && hits.get(path)! < 3) {
      response.setHeader("Retry-After", "0");
      return send("Later", "text/plain", 429);
    }
    if (path === "/noindex") response.setHeader("X-Robots-Tag", "noindex");
    if (path === "/canonical") return send(html("Canonical source", "", '<link rel="canonical" href="/missing">'));
    if (path === "/localized") return send(html("Français", "", '<link rel="alternate" hreflang="en" href="/en"><script type="application/ld+json">{ invalid</script>'));
    if (path === "/render") return send(html("Before scripts", '<main id="content"></main><script src="/fixture.js"></script>'));
    if (path === "/fixture.js") return send('document.title="After scripts";document.querySelector("#content").innerHTML="<a href=\'/js-only\'>Dynamic link</a>";', "application/javascript");
    if (path.startsWith("/duplicate-")) return send(html("Same", '<article data-id="42"><h2>Extract this</h2></article>'));
    return send(html(path.slice(1) || "Home", "<p>Fixture content</p>"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, hits, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
