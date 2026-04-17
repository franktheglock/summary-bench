import { Cpu } from "lucide-react";

export default function Loading() {
  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-300">
      <div className="h-5 w-40 rounded bg-paper-dark animate-pulse" />

      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-paper-dark border border-border animate-pulse shrink-0" />
        <div className="flex-1 w-full space-y-4">
          <div className="h-6 w-20 rounded bg-paper-dark animate-pulse" />
          <div className="h-12 w-full max-w-2xl rounded bg-paper-dark animate-pulse" />
          <div className="space-y-2 max-w-3xl">
            <div className="h-4 w-full rounded bg-paper-dark animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-paper-dark animate-pulse" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="panel p-6 col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-20 rounded bg-paper-dark animate-pulse" />
              <div className="h-8 w-24 rounded bg-paper-dark animate-pulse" />
              <div className="h-3 w-16 rounded bg-paper-dark animate-pulse" />
            </div>
          ))}
        </div>

        <div className="panel p-6 bg-gradient-to-br from-[#fdfbf7] to-[#f7f6f3] border-terracotta/20">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-terracotta" />
            <div className="h-5 w-40 rounded bg-paper-dark animate-pulse" />
          </div>
          <div className="space-y-3 mb-6">
            <div className="h-4 rounded bg-paper-dark animate-pulse" />
            <div className="h-4 rounded bg-paper-dark animate-pulse" />
            <div className="h-4 rounded bg-paper-dark animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-10 rounded bg-paper-dark animate-pulse" />
            <div className="h-10 rounded bg-paper-dark animate-pulse" />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="h-8 w-56 rounded bg-paper-dark animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-28 rounded bg-paper-dark animate-pulse" />
                  <div className="h-3 w-24 rounded bg-paper-dark animate-pulse" />
                </div>
                <div className="w-16 h-12 rounded bg-paper-dark animate-pulse" />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <div className="h-3 w-12 rounded bg-paper-dark animate-pulse" />
                    <div className="h-3 w-10 rounded bg-paper-dark animate-pulse" />
                  </div>
                  <div className="h-1.5 rounded-full bg-paper-dark animate-pulse" />
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <div className="h-3 w-16 rounded bg-paper-dark animate-pulse" />
                  <div className="h-3 w-10 rounded bg-paper-dark animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}