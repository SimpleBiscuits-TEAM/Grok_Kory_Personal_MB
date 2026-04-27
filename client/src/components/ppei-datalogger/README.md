# PPEI Datalogger — Team Sandbox

This directory contains **wrapper components** for the Datalogger tab that the PPEI team can freely modify and experiment with.

## Architecture

These wrappers import Tobi's production datalogger components as a base. When Tobi pushes updates to his branch, improvements automatically flow into these wrappers.

```
PpeiDataloggerPanel.tsx
    └── imports DataloggerPanel (Tobi's PROTECTED original)
        ├── PCAN-USB adapter (WebSocket bridge)
        ├── V-OP Can2USB adapter (USB CAN bridge)
        └── ELM327 adapter (WebSerial AT)
```

## Rules

1. **NEVER modify Tobi's original files** — only modify files in this `ppei-datalogger/` directory
2. **Add overrides in the TEAM OVERRIDE ZONE** sections marked in each wrapper
3. **Breaking these wrappers does NOT break Tobi's production Datalogger tab**
4. **Test your changes in the PPEI DATALOGGER tab** (not the original DATALOGGER tab)

## How to Add Custom Behavior

Each wrapper has clearly marked zones:

- `usePpeiDataloggerOverrides()` — Add custom hooks and state
- `PpeiDataloggerPanelProps` — Add PPEI-specific props
- `handleOpenInAnalyzer` — Intercept the analyzer callback
- `processedPids` — Inject custom PIDs
- `TEAM PRE-DATALOGGER ZONE` — Add UI above the datalogger panel
- `TEAM POST-DATALOGGER ZONE` — Add UI below the datalogger panel

## Future Expansion

If you need to override deeper behavior (e.g., custom adapter logic, custom PID manager), create new wrapper files in this directory that import the originals and add your overrides.
