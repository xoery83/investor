import type { Metadata } from "next";
import { AppShell } from "../components/app-shell"
import { I18nProvider } from "../components/i18n-provider"
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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
