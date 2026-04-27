# PPEI Flash — Team Sandbox

This directory contains **wrapper components** for the Flash tab that the PPEI team can freely modify and experiment with.

## Architecture

These wrappers import Tobi's production flash components as a base. When Tobi pushes updates to his branch, improvements automatically flow into these wrappers.

```
PpeiFlashContainerPanel.tsx
    └── imports FlashContainerPanel (Tobi's PROTECTED original)
        ├── EcuScanPanel (PROTECTED)
        ├── FlashMissionControl (PROTECTED)
        ├── FlashDashboard (PROTECTED)
        └── TuneDeployWorkspace (PROTECTED)
```

## Rules

1. **NEVER modify Tobi's original files** — only modify files in this `ppei-flash/` directory
2. **Add overrides in the TEAM OVERRIDE ZONE** sections marked in each wrapper
3. **Breaking these wrappers does NOT break Tobi's production Flash tab**
4. **Test your changes in the PPEI FLASHER tab** (not the original FLASH tab)

## How to Add Custom Behavior

Each wrapper has clearly marked zones:

- `usePpeiFlashOverrides()` — Add custom hooks and state
- `TEAM PRE-FLASH ZONE` — Add UI above the flash panel
- `TEAM POST-FLASH ZONE` — Add UI below the flash panel

## Future Expansion

If you need to override deeper behavior (e.g., custom EcuScanPanel logic), create a new wrapper file in this directory that imports the original and adds your overrides.
