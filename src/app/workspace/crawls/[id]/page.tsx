import type { Metadata } from "next";
import { CrawlReport } from "@/components/crawl-report";

export const metadata: Metadata = { title: "Crawl report", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrawlReport key={id} id={id} />;
}
