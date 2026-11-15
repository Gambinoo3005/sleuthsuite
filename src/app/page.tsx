import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Braces, ChevronDown, Download, Fingerprint, GitPullRequest, HardDrive, Link2, ScanSearch } from "lucide-react";
import { Brand } from "@/components/common";
import { LandingPreview } from "@/components/landing-preview";
import { severityCounts } from "@/components/crawl-summary";
import { getRun } from "@/db";
import { issueGroups } from "@/queries";
import { SAMPLE_ID, sampleDatabase } from "@/sample";

const steps = [
  { icon: ScanSearch, title: "Crawl the site", text: "Start at a URL or paste a migration list. Set the scope and rate, then watch pages and redirects appear as they’re checked." },
  { icon: Fingerprint, title: "Follow the evidence", text: "Open a finding to see the exact URL, HTTP response, observed directives and incoming links that explain it." },
  { icon: Download, title: "Hand off the fix", text: "Export affected URLs and source links to CSV. Run the same crawl again and compare what changed." },
];

export default function Home() {
  const db = sampleDatabase();
  const sample = getRun(db, SAMPLE_ID)!;
  const counts = severityCounts(issueGroups(db, SAMPLE_ID));
  return <div className="landing">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="landing-header">
      <div className="landing-container marketing-nav">
        <Brand />
        <nav aria-label="Main navigation"><a href="#workflow">Workflow</a><a href="#capabilities">Capabilities</a><a href="#faq">FAQ</a></nav>
        <Link className="button button-outline button-small" href="/workspace">Open workspace <ArrowUpRight size={15} /></Link>
      </div>
    </header>
    <main id="content">
      <section className="hero">
        <div className="hero-grid" aria-hidden><div className="route-line route-left" /><div className="route-line route-right" /></div>
        <div className="landing-container hero-inner">
          <div className="hero-kicker"><ScanSearch size={15} /> TECHNICAL SEO CRAWLER</div>
          <h1>Find what broke.<br /><span>See where to fix it.</span></h1>
          <p className="hero-copy">Crawl your site, trace issues to their source, and send developers a clear list of what to fix.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/workspace">Open workspace <ArrowRight size={17} /></Link>
            <a className="button button-quiet" href="#sample">Explore a sample <ArrowDown size={16} /></a>
          </div>
          <div id="sample" className="preview-wrap">
            <LandingPreview checked={sample.checked} discovered={sample.discovered} findings={sample.findings}
              errors={counts.error} warnings={counts.warning} />
          </div>
        </div>
      </section>
      <section className="landing-container marketing-section" id="workflow">
        <div className="section-lead">
          <span className="section-label">THE WORKFLOW</span>
          <h2>From a URL to a fix.</h2>
          <p>Every finding leads back to the page and link that produced it.</p>
        </div>
        <div className="step-grid">{steps.map(({ icon: Icon, title, text }) => <article className="step-card" key={title}>
          <span className="step-icon"><Icon size={22} strokeWidth={1.7} /></span><h3>{title}</h3><p>{text}</p>
        </article>)}</div>
      </section>
      <section className="landing-container marketing-section capability-section" id="capabilities">
        <div className="section-lead">
          <span className="section-label">WHAT YOU CAN CHECK</span>
          <h2>A clearer view of your site.</h2>
        </div>
        <div className="capabilities">
          <article><Link2 /><div><h3>Links, redirects and sitemaps</h3><p>Find broken pages, redirect chains, and sitemap entries that conflict with observed indexability signals.</p></div></article>
          <article><Braces /><div><h3>Metadata and rendered content</h3><p>Inspect titles, canonicals, robots directives, hreflang, and the changes Chromium sees after scripts run.</p></div></article>
          <article><GitPullRequest /><div><h3>Changes between crawls</h3><p>Compare saved audits to see changed metadata, response states, and findings after a fix or migration.</p></div></article>
          <article><HardDrive /><div><h3>Local audit history</h3><p>Pause a run, reopen saved results, and export reports. Your crawl records stay on your machine.</p></div></article>
        </div>
      </section>
      <section className="landing-container marketing-section faq" id="faq">
        <div className="section-lead"><span className="section-label">FAQ</span><h2>Good to know.</h2></div>
        <div className="faq-items">
          <details><summary>Where do crawls run? <ChevronDown size={18} /></summary><p>SleuthSuite runs locally. It fetches the pages you ask it to audit, saves the results in a local database, and opens the workspace in your browser.</p></details>
          <details><summary>Can I crawl JavaScript websites? <ChevronDown size={18} /></summary><p>Yes. Install Chromium using the setup command in the repository, then choose Chromium in the crawl settings. It renders same-origin page resources and records raw and rendered evidence. HTML mode is faster for sites that serve their content directly.</p></details>
          <details><summary>What does the audit tell me about indexing? <ChevronDown size={18} /></summary><p>The audit reports what it observes, such as a noindex header, blocked crawl access, or a canonical pointing elsewhere. Check your search engine’s inspection tools for actual indexing status.</p></details>
        </div>
      </section>
      <section className="landing-container next-action">
        <div><h2>Start with a URL.</h2><p>Open the workspace to run your first audit.</p></div>
        <Link className="button button-primary" href="/workspace">Open workspace <ArrowRight size={17} /></Link>
      </section>
    </main>
    <footer className="landing-container marketing-footer"><Brand /><span>Technical SEO, with evidence.</span><Link href="/workspace/crawls/sample">Sample audit <ArrowUpRight size={14} /></Link></footer>
  </div>;
}
