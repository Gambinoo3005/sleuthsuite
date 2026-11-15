import { WorkspaceNavigation } from "@/components/workspace-navigation";
import "./workspace.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="workspace">
    <a className="skip-link" href="#content">Skip to content</a>
    <WorkspaceNavigation />
    <div className="workspace-content">{children}</div>
  </div>;
}
