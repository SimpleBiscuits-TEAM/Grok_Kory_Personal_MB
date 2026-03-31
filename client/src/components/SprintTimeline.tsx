/*
 * SprintTimeline — Horizontal 4-week sprint bar with current day marker.
 * Motorsport style: sharp edges, monospaced dates, red accent for current position.
 */

export function SprintTimeline() {
  const weeks = [
    { week: 1, label: "WEEK 1 — CRITICAL PATH", start: "Mar 31", end: "Apr 6", focus: "P1 Items" },
    { week: 2, label: "WEEK 2 — IMPORTANT", start: "Apr 7", end: "Apr 13", focus: "P2 Items" },
    { week: 3, label: "WEEK 3 — SECONDARY", start: "Apr 14", end: "Apr 20", focus: "P3 Items" },
    { week: 4, label: "WEEK 4 — POLISH", start: "Apr 21", end: "Apr 27", focus: "Regression" },
  ];

  // Calculate current position in sprint
  const sprintStart = new Date("2026-03-31");
  const sprintEnd = new Date("2026-04-27");
  const now = new Date();
  const totalDays = (sprintEnd.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24);
  const elapsed = Math.max(0, (now.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
  const progress = Math.min(100, (elapsed / totalDays) * 100);

  // Determine current week
  const currentWeek = elapsed <= 7 ? 1 : elapsed <= 14 ? 2 : elapsed <= 21 ? 3 : elapsed <= 28 ? 4 : 0;

  return (
    <div className="border-b border-border bg-card/30">
      <div className="container py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-[10px] text-muted-foreground tracking-widest">SPRINT TIMELINE</span>
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[10px] text-primary">
            {elapsed < 0 ? "STARTS MAR 31" : elapsed > totalDays ? "SPRINT COMPLETE" : `DAY ${Math.ceil(elapsed)} / ${Math.ceil(totalDays)}`}
          </span>
        </div>

        {/* Timeline bar */}
        <div className="relative">
          <div className="grid grid-cols-4 gap-px">
            {weeks.map((w) => (
              <div
                key={w.week}
                className={`relative px-2 py-1.5 transition-colors ${
                  currentWeek === w.week
                    ? "bg-primary/10 border border-primary/30"
                    : w.week < currentWeek
                    ? "bg-muted/30 border border-border/50"
                    : "bg-muted/10 border border-border/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-[10px] tracking-wider ${
                      currentWeek === w.week ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {w.label}
                  </span>
                  {currentWeek === w.week && (
                    <span className="font-mono text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm animate-pulse">
                      ACTIVE
                    </span>
                  )}
                  {w.week < currentWeek && (
                    <span className="font-mono text-[9px] text-[oklch(0.72_0.19_145)]">DONE</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-[9px] text-muted-foreground/60">
                    {w.start} – {w.end}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/60">{w.focus}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Progress indicator */}
          {progress > 0 && progress < 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 transition-all duration-1000"
              style={{ left: `${progress}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
