import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

export default function Page() { return <Dashboard />; }
