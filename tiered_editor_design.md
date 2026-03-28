# Tiered Calibration Editor Design

## Categorization Results (E42 / 2024 L5P)

| Level | Name | Maps | Description |
|-------|------|------|-------------|
| 1 | Basic | 734 | Speed limiter, driver demand, tire size, idle, cruise |
| 2 | Street Performance | 3,185 | Torque mgmt, injection timing, boost/rail targets, trans/TCC |
| 3 | Advanced Tuning | 1,994 | Rail pressure control, EGR, turbo/VGT, engine protection |
| 4 | Expert / Emissions | 11,471 | DPF, SCR, NOx, diagnostics/DTC, freeze frame, OBD monitors |
| 5 | Full A2L | 33,252 | All remaining maps by module prefix (928 unique prefixes) |
| **Total** | | **50,636** | |

## Level 1: Basic (734 maps, 6 folders)
- Idle Speed Control (485)
- Speed Limiters (172)
- Cruise Control (32)
- Speed / Acceleration Limiters (24)
- Tire / Wheel Size (19)
- Driver Demand / Pedal (2)

## Level 2: Street Performance (3,185 maps, 7 folders)
- Transmission (1,169)
- Torque Management (1,164)
- Injection Timing (505)
- Torque Converter / TCC (303)
- Rail Pressure Targets (44)

## Level 3: Advanced Tuning (1,994 maps, 8 folders)
- Rail Pressure Control (635)
- EGR System (545)
- Engine Protection (447)
- Turbo / VGT Control (271)
- Air System / Throttle (56)
- Active Surge Damper (22)
- Injector Curves / Pilot-Post (10)
- Cylinder Balance (8)

## Level 4: Expert / Emissions (11,471 maps, 10 folders)
- Diagnostics / DTC (6,384)
- NOx Sensors / Model (2,064)
- DPF / Particulate Filter (1,812)
- SCR / DEF Dosing (1,135)
- Exhaust Temperature Control (36)
- OBD Monitors (13)
- Urea System (11)
- Lambda / O2 Sensors (9)
- Oxidation Catalyst (5)
- Freeze Frame (2)

## Level 5: Full A2L (33,252 maps)
Sub-grouped by module prefix. Top modules:
- KaDFIR (3,407) - Fault Information Records
- KaFFRG (3,366) - Freeze Frame Groups
- KaCMBC (3,080) - Combustion Control
- KaSSMR (2,486) - Subsystem Monitoring
- KtFULC (2,362) - Fuel Control
- KaDPFC (2,317) - DPF Control
- KaCOMR (2,028) - Communication
- KaFADC (1,804) - Fuel Additive Control
- KaETQC (982) - Engine Torque Control
- KtAICC (916) - Air Charge Control

## Navigation Design
- Level selector tabs at top (1-5 with map counts)
- Collapsible folder tree on left
- Search bar with instant filter (searches name + description)
- Breadcrumb trail showing Level > Folder > Map
- Keyboard shortcuts: Ctrl+1-5 for levels, Ctrl+F for search, arrow keys for tree
- Virtualized list for folders with 1000+ maps (only render visible rows)
- "Jump to map" quick-search overlay (Ctrl+G)
- Folder items capped at ~50 visible; auto-paginate or sub-folder if more

## Erika Integration
- On A2L load, Erika can suggest which level a user should start at based on their question
- Erika knows which maps in each level are most commonly tuned
- Erika can explain what each map does in context of the P654 control strategy
- "Show me the maps Erika recommends for [goal]" - filtered view
