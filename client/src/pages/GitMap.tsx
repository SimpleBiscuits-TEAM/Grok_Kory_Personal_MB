/**
 * Git map — dev feature: server-generated repository graph (origin) in an iframe.
 */
import PpeiHeader from "@/components/PpeiHeader";
import { useCallback, useState } from "react";

export default function GitMapPage() {
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setLoaded(false);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col">
      <PpeiHeader />
      <div className="border-b border-zinc-800/80 px-4 py-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded border border-amber-600/40 text-amber-500/95 bg-amber-950/30"
          title="Experimental developer tooling"
        >
          dev feature
        </span>
        <span className="max-w-3xl">
          Repository graph from the server&apos;s Git remote-tracking refs (origin). Requires a Git
          checkout and network access for fetch on the host.
        </span>
        <button
          type="button"
          onClick={refresh}
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded px-2 py-1 bg-zinc-900/80"
        >
          Reload
        </button>
      </div>
      <div className="flex-1 flex flex-col min-h-0 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none text-sm text-zinc-500">
            Loading graph…
          </div>
        )}
        <iframe
          key={reloadKey}
          title="Git repository graph"
          className="flex-1 w-full min-h-[calc(100vh-140px)] border-0 bg-[#1e1e1e]"
          src={`/api/dev/git-map?refresh=${reloadKey}`}
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
