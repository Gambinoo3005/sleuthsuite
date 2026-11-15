"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppWindow, FlaskConical, Layers3 } from "lucide-react";
import { Brand } from "./common";

const links = [
  { href: "/workspace", label: "Crawls", icon: Layers3 },
  { href: "/workspace/crawls/sample", label: "Sample", icon: FlaskConical },
  { href: "/", label: "Home", icon: AppWindow },
];

export function WorkspaceNavigation() {
  const pathname = usePathname();
  const section = pathname === "/workspace/crawls/sample" ? pathname : "/workspace";
  return <aside className="workspace-nav-shell">
    <Brand />
    <nav aria-label="Workspace navigation">
      {links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}
        aria-current={pathname === href ? "page" : undefined} data-active={section === href}>
        <Icon size={19} strokeWidth={1.7} /><span>{label}</span>
      </Link>)}
    </nav>
    <div className="workspace-local" title="Crawls run on this machine"><span /> Local</div>
  </aside>;
}
