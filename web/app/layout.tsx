import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";
import Header from "./_components/Header";
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
          <Header />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-12">
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