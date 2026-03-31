/*
 * StatsBar — Top-level aggregate metrics in a dense horizontal strip.
 * Motorsport telemetry style: monospaced numbers, color-coded status indicators.
 */

interface StatsBarProps {
  stats: {
    total: number;
    passed: number;
    failed: number;
    inProgress: number;
    blocked: number;
    notStarted: number;
    p1Total: number;
    p1Passed: number;
    p2Total: number;
    p2Passed: number;
    p3Total: number;
    p3Passed: number;
  };
}

export function StatsBar({ stats }: StatsBarProps) {
  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;

  return (
    <div className="border-b border-border bg-card/50">
      <div className="container py-3">
        {/* Progress rail */}
        <div className="h-1.5 bg-muted rounded-sm overflow-hidden mb-3">
          <div className="h-full flex">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(stats.passed / stats.total) * 100}%`,
                backgroundColor: "oklch(0.72 0.19 145)",
              }}
            />
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(stats.failed / stats.total) * 100}%`,
                backgroundColor: "oklch(0.62 0.24 25)",
              }}
            />
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(stats.inProgress / stats.total) * 100}%`,
                backgroundColor: "oklch(0.75 0.15 85)",
              }}
            />
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(stats.blocked / stats.total) * 100}%`,
                backgroundColor: "oklch(0.55 0.15 300)",
              }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard label="TOTAL" value={stats.total} accent="text-foreground" />
          <StatCard label="PASSED" value={stats.passed} accent="text-[oklch(0.72_0.19_145)]" sub={`${passRate}%`} />
          <StatCard label="FAILED" value={stats.failed} accent="text-[oklch(0.62_0.24_25)]" />
          <StatCard label="IN PROGRESS" value={stats.inProgress} accent="text-[oklch(0.75_0.15_85)]" />
          <StatCard label="BLOCKED" value={stats.blocked} accent="text-[oklch(0.55_0.15_300)]" />
          <StatCard label="NOT STARTED" value={stats.notStarted} accent="text-muted-foreground" />
        </div>

        {/* Priority breakdown */}
        <div className="flex gap-4 mt-3 flex-wrap">
          <PriorityMini label="P1" done={stats.p1Passed} total={stats.p1Total} color="bg-[oklch(0.52_0.22_25)]" />
          <PriorityMini label="P2" done={stats.p2Passed} total={stats.p2Total} color="bg-[oklch(0.75_0.15_85)]" />
          <PriorityMini label="P3" done={stats.p3Passed} total={stats.p3Total} color="bg-[oklch(0.65_0.15_200)]" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] text-muted-foreground tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-2xl font-semibold ${accent}`}>{value}</span>
        {sub && <span className="font-mono text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

function PriorityMini({
  label,
  done,
  total,
  color,
}: {
  label: string;
  done: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="font-mono text-xs text-muted-foreground">
        {label}: {done}/{total}
      </span>
      <div className="w-16 h-1 bg-muted rounded-sm overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}
