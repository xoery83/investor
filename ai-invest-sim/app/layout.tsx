import type { Metadata } from "next";
import { AppShell } from "../components/app-shell"
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Invest Sim",
  description: "AI-assisted portfolio simulation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
