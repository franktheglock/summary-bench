import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Summary Arena | Benchmark LLMs",
  description: "A crowdsourced platform to blindly benchmark LLM summarization quality.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${newsreader.variable} ${outfit.variable} antialiased font-sans`}>
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 border-b border-border bg-paper">
            <div className="max-w-7xl mx-auto flex h-16 items-center px-6 justify-between">
              <Link href="/" className="flex items-center gap-3 group">
                <span className="font-serif text-2xl font-semibold tracking-tight text-ink group-hover:text-terracotta transition-colors">
                  Summary Arena
                </span>
              </Link>
              <nav className="flex items-center gap-6">
                <Link href="/leaderboard" className="text-sm font-medium text-stone uppercase tracking-wider hover:text-ink transition-colors">
                  Leaderboard
                </Link>
                <Link href="/arena" className="text-sm font-medium text-stone uppercase tracking-wider hover:text-ink transition-colors">
                  Arena
                </Link>
                <div className="divider-vertical h-6 mx-2"></div>
                <Link href="/upload" className="btn-primary">
                  Upload
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
            {children}
          </main>
          <footer className="border-t border-border py-8">
            <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-sm text-stone">
              <span className="font-serif italic text-stone">Summary Arena v1.0</span>
              <span className="uppercase tracking-wider text-xs text-stone-light">Crowdsourced LLM Benchmark</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}