/**
 * Standalone Tune Deploy page — same workspace as Advanced → FLASH → Tune Deploy.
 */
import PpeiHeader from "@/components/PpeiHeader";
import TuneDeployWorkspace from "@/components/tune-deploy/TuneDeployWorkspace";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function TuneDeployPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <PpeiHeader />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Link
          href="/advanced"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-6 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to Advanced
        </Link>
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-red-500/90 font-mono mb-2">
            V-OP · Flash ops
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-red-200/90 bg-clip-text text-transparent">
            Tune Deploy
          </h1>
          <p className="mt-2 text-sm text-zinc-500 max-w-2xl">
            Smart calibration ingest: heuristic OS and part-number extraction, R2-style object paths, and a
            searchable library — foundation for vehicle-connected auto-match.
          </p>
        </header>
        <TuneDeployWorkspace />
      </main>
    </div>
  );
}
