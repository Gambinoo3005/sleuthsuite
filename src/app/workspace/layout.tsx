import { WorkspaceHeader } from "@/components/common";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="workspace"><a className="skip-link" href="#content">Skip to content</a><WorkspaceHeader />{children}</div>;
}
