import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SleuthSuite — Technical SEO crawler", template: "%s · SleuthSuite" },
  description: "Crawl your site, investigate technical SEO issues, and trace every finding back to the page where you can fix it.",
  icons: { icon: "/sleuthsuite.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
