import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard · AI Invest Sim",
  description: "Portfolio overview, performance, and AI research activity",
}

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
