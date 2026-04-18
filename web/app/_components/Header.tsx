"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import UserProfile from "./UserProfile";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-paper">
      <div className="max-w-7xl mx-auto flex h-16 items-center px-4 md:px-6 justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          onClick={() => setOpen(false)}
        >
          <span className="font-serif text-xl md:text-2xl font-semibold tracking-tight text-ink group-hover:text-terracotta transition-colors">
            Summary Arena
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/leaderboard"
            className="text-sm font-medium text-stone uppercase tracking-wider hover:text-ink transition-colors"
          >
            Leaderboard
          </Link>
          <Link
            href="/arena"
            className="text-sm font-medium text-stone uppercase tracking-wider hover:text-ink transition-colors"
          >
            Arena
          </Link>
          <div className="divider-vertical h-6 mx-2" />
          <Link href="/upload" className="btn-primary">
            Upload
          </Link>
          <div className="divider-vertical h-6 mx-1" />
          <UserProfile />
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -mr-1 text-stone hover:text-ink transition-colors"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-border bg-paper">
          <nav className="flex flex-col px-4 py-2">
            <Link
              href="/leaderboard"
              className="py-3.5 text-sm font-semibold text-stone uppercase tracking-wider hover:text-ink transition-colors border-b border-border"
              onClick={() => setOpen(false)}
            >
              Leaderboard
            </Link>
            <Link
              href="/arena"
              className="py-3.5 text-sm font-semibold text-stone uppercase tracking-wider hover:text-ink transition-colors border-b border-border"
              onClick={() => setOpen(false)}
            >
              Arena
            </Link>
            <div className="py-3 flex items-center gap-4">
              <Link
                href="/upload"
                className="btn-primary flex-1 justify-center"
                onClick={() => setOpen(false)}
              >
                Upload
              </Link>
              <UserProfile />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
