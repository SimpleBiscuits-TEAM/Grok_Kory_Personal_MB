export type Priority = "P1" | "P2" | "P3" | "P4";
export type Status = "not_started" | "in_progress" | "passed" | "failed" | "blocked";

/** The 6 top-level sections the user can filter by and move tasks between */
export type TopSection =
  | "ANALYZER"
  | "VEHICLE SUPPORT"
  | "LIVE DATALOGGING"
  | "CALIBRATION EDITOR"
  | "REVERSE ENGINEERING"
  | "MISC";

export const TOP_SECTIONS: TopSection[] = [
  "ANALYZER",
  "VEHICLE SUPPORT",
  "LIVE DATALOGGING",
  "CALIBRATION EDITOR",
  "REVERSE ENGINEERING",
  "MISC",
];

export interface Task {
  id: string;
  name: string;
  topSection: TopSection;
  subsection: string;
  priority: Priority;
  status: Status;
  /** Legacy module number — kept for data continuity */
  module: number;
  moduleName: string;
  section: string;
}

function t(
  id: string,
  name: string,
  topSection: TopSection,
  subsection: string,
  priority: Priority,
  status: Status = "not_started",
  module: number = 0,
  moduleName: string = "",
  section: string = "",
): Task {
  return { id, name, topSection, subsection, priority, status, module, moduleName, section };
}

export const defaultTasks: Task[] = [
  // ═══════════════════════════════════════════════════════════
  // ANALYZER
  // ═══════════════════════════════════════════════════════════

  // — File Parsing —
  t("1.1.1", "Upload standard EFILive CSV datalog", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.9", "Upload multiple files sequentially", "ANALYZER", "File Parsing", "P2", "passed"),
  t("1.1.2", "Upload HP Tuners CSV datalog", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.3", "Upload WP8 (WinOLS) datalog — WP8 parser", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.4", "Upload WinOLS CSV datalog", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.5", "Upload DBC file for CAN decoding", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.6", "Upload raw CAN log and apply DBC", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.7", "Upload .tun binary calibration file", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.8", "Upload .bin raw binary calibration file", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.10", "Drag-and-drop file upload works", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.11", "File type auto-detection works", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.12", "Invalid file shows error message", "ANALYZER", "File Parsing", "P1", "passed"),
  t("1.1.13", "Large file (>50MB) handled gracefully", "ANALYZER", "File Parsing", "P2", "passed"),

  // — Data Processing —
  t("1.2.1", "PID columns detected and labeled", "ANALYZER", "Data Processing", "P1", "passed"),
  t("1.2.2", "PID substitution replaces internal names with friendly labels", "ANALYZER", "Data Processing", "P1", "passed"),
  t("1.2.3", "VIN decoded from datalog header", "ANALYZER", "Data Processing", "P1", "passed"),
  t("1.2.4", "VIN decode returns year/make/model/engine", "ANALYZER", "Data Processing", "P1", "passed"),
  t("1.2.5", "Unit conversion (metric/imperial) works", "ANALYZER", "Data Processing", "P2", "passed"),
  t("1.2.6", "Timestamp parsing handles all formats", "ANALYZER", "Data Processing", "P1", "passed"),
  t("1.2.7", "Data summary stats computed (min/max/avg)", "ANALYZER", "Data Processing", "P1", "passed"),

  // — Charts & Visualization —
  t("1.3.1", "Time-series chart renders from datalog", "ANALYZER", "Charts & Visualization", "P1", "passed"),
  t("1.3.2", "Multi-PID overlay on single chart", "ANALYZER", "Charts & Visualization", "P1", "passed"),
  t("1.3.3", "Zoom and pan on charts", "ANALYZER", "Charts & Visualization", "P1", "passed"),
  t("1.3.4", "Chart export as PNG", "ANALYZER", "Charts & Visualization", "P2", "passed"),
  t("1.3.5", "Dyno chart (HP/TQ vs RPM) renders", "ANALYZER", "Charts & Visualization", "P1", "in_progress"),
  t("1.3.6", "Virtual dyno estimation from datalog", "ANALYZER", "Charts & Visualization", "P2", "in_progress"),
  t("1.3.7", "Fault event markers on timeline chart", "ANALYZER", "Charts & Visualization", "P1", "passed"),
  t("1.3.8", "Chart color coding matches PID categories", "ANALYZER", "Charts & Visualization", "P2", "passed"),

  // — Diagnostics —
  t("1.4.1", "Fault detection rules fire on known patterns", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.2", "Boost deviation fault detected", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.3", "EGT spread fault detected", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.4", "Rail pressure fault detected", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.5", "Coolant temp fault detected", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.6", "Transmission temp fault detected", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.7", "False-positive suppression works (idle, cold start, DPF regen)", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.8", "Severity levels assigned correctly (info/warning/critical)", "ANALYZER", "Diagnostics", "P1", "passed"),
  t("1.4.9", "Fault correlation engine links related faults", "ANALYZER", "Diagnostics", "P2", "passed"),
  t("1.4.10", "Predictive fault detection flags trending issues", "ANALYZER", "Diagnostics", "P2", "passed"),
  t("1.4.11", "Diagnostic agent provides AI-powered analysis", "ANALYZER", "Diagnostics", "P2", "passed"),

  // — Health Reports —
  t("1.5.1", "Health report generated from datalog analysis", "ANALYZER", "Health Reports", "P1", "passed"),
  t("1.5.2", "Report includes vehicle info, faults, recommendations", "ANALYZER", "Health Reports", "P1", "passed"),
  t("1.5.3", "PDF export of health report", "ANALYZER", "Health Reports", "P1", "passed"),
  t("1.5.4", "Report severity summary (green/yellow/red)", "ANALYZER", "Health Reports", "P1", "passed"),
  t("1.5.5", "Report includes chart snapshots", "ANALYZER", "Health Reports", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════════
  // VEHICLE SUPPORT
  // ═══════════════════════════════════════════════════════════

  // — GM Duramax —
  t("2.1.1", "LBZ Duramax datalog parses correctly", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),
  t("2.1.2", "LML Duramax datalog parses correctly", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),
  t("2.1.3", "L5P Duramax datalog parses correctly", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),
  t("2.1.4", "Allison transmission PIDs recognized", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),
  t("2.1.5", "Duramax-specific fault rules fire correctly", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),
  t("2.1.6", "GM HD DTC database loads and searches", "VEHICLE SUPPORT", "GM Duramax", "P1", "passed"),

  // — Ford Powerstroke —
  t("2.2.1", "6.7L Powerstroke datalog parses correctly", "VEHICLE SUPPORT", "Ford Powerstroke", "P1", "in_progress"),
  t("2.2.2", "Ford-specific PIDs recognized", "VEHICLE SUPPORT", "Ford Powerstroke", "P2", "in_progress"),
  t("2.2.3", "Ford fault rules fire correctly", "VEHICLE SUPPORT", "Ford Powerstroke", "P2", "in_progress"),

  // — Cummins —
  t("2.3.1", "6.7L Cummins datalog parses correctly", "VEHICLE SUPPORT", "Cummins", "P1", "in_progress"),
  t("2.3.2", "Cummins-specific PIDs recognized", "VEHICLE SUPPORT", "Cummins", "P2", "in_progress"),
  t("2.3.3", "Cummins fault rules fire correctly", "VEHICLE SUPPORT", "Cummins", "P2", "in_progress"),

  // — European —
  t("2.4.1", "BMW N57/B57 diesel datalog parses correctly", "VEHICLE SUPPORT", "European", "P2", "in_progress"),
  t("2.4.2", "European PID mapping works", "VEHICLE SUPPORT", "European", "P2", "in_progress"),

  // — Powersports —
  t("2.5.1", "Can-Am Maverick datalog parses correctly", "VEHICLE SUPPORT", "Powersports", "P1", "passed"),
  t("2.5.2", "Polaris RZR datalog parses correctly", "VEHICLE SUPPORT", "Powersports", "P2", "passed"),
  t("2.5.3", "Kawasaki KRX datalog parses correctly", "VEHICLE SUPPORT", "Powersports", "P2", "passed"),
  t("2.5.4", "Honda Talon datalog parses correctly", "VEHICLE SUPPORT", "Powersports", "P2", "passed"),
  t("2.5.5", "Powersports-specific PIDs recognized", "VEHICLE SUPPORT", "Powersports", "P1", "passed"),
  t("2.5.6", "Powersports fault rules fire correctly", "VEHICLE SUPPORT", "Powersports", "P2", "passed"),

  // — Can-Am VIN & DESS —
  t("12.1", "Can-Am VIN changer loads", "VEHICLE SUPPORT", "Can-Am VIN & DESS", "P2", "passed"),
  t("12.2", "VIN field editable in binary", "VEHICLE SUPPORT", "Can-Am VIN & DESS", "P2", "passed"),
  t("12.3", "DESS key management", "VEHICLE SUPPORT", "Can-Am VIN & DESS", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════════
  // LIVE DATALOGGING
  // ═══════════════════════════════════════════════════════════

  // — OBD-II Connection —
  t("3.1.1", "WebSerial connects to V-OP Can2USB adapter", "LIVE DATALOGGING", "OBD-II Connection", "P1", "passed"),
  t("3.1.2", "PCAN bridge connects via WebSocket", "LIVE DATALOGGING", "OBD-II Connection", "P1", "passed"),
  t("3.1.3", "Connection status indicator works", "LIVE DATALOGGING", "OBD-II Connection", "P1", "passed"),
  t("3.1.4", "Disconnect and reconnect works cleanly", "LIVE DATALOGGING", "OBD-II Connection", "P1", "passed"),
  t("3.1.5", "CAN sniff auto-detects vehicle type", "LIVE DATALOGGING", "OBD-II Connection", "P2", "passed"),

  // — Live Gauges & Data —
  t("3.2.1", "Live PID values display in real-time", "LIVE DATALOGGING", "Live Gauges & Data", "P1", "in_progress"),
  t("3.2.2", "Gauge display mode works", "LIVE DATALOGGING", "Live Gauges & Data", "P1", "in_progress"),
  t("3.2.3", "PID preset selection works", "LIVE DATALOGGING", "Live Gauges & Data", "P1", "passed"),
  t("3.2.4", "Custom PID list creation", "LIVE DATALOGGING", "Live Gauges & Data", "P2", "passed"),
  t("3.2.5", "Data refresh rate configurable", "LIVE DATALOGGING", "Live Gauges & Data", "P2", "passed"),

  // — Recording & Export —
  t("3.3.1", "Start/stop recording datalog", "LIVE DATALOGGING", "Recording & Export", "P1", "in_progress"),
  t("3.3.2", "Export recorded datalog as CSV", "LIVE DATALOGGING", "Recording & Export", "P1", "in_progress"),
  t("3.3.3", "Auto-save recording on disconnect", "LIVE DATALOGGING", "Recording & Export", "P2", "in_progress"),
  t("3.3.4", "Flash log export to Excel", "LIVE DATALOGGING", "Recording & Export", "P2", "passed"),

  // — Protocols —
  t("3.4.1", "J1939 protocol communication works", "LIVE DATALOGGING", "Protocols", "P1", "passed"),
  t("3.4.2", "J1939 flashing works", "LIVE DATALOGGING", "Protocols", "P1"),
  t("3.4.3", "K-Line protocol communication works", "LIVE DATALOGGING", "Protocols", "P2", "passed"),
  t("3.4.4", "UDS diagnostic services work (0x10, 0x22, 0x2E, 0x31, 0x34-0x37)", "LIVE DATALOGGING", "Protocols", "P1", "passed"),
  t("3.4.5", "Multi-protocol auto-detection", "LIVE DATALOGGING", "Protocols", "P2", "passed"),
  t("3.4.6", "Protocol error handling and retry logic", "LIVE DATALOGGING", "Protocols", "P1", "passed"),

  // — ECU Scanner —
  t("7.1.1", "Module scanner discovers ECU modules", "LIVE DATALOGGING", "ECU Scanner", "P2", "passed"),
  t("7.1.2", "Module scanner displays addresses", "LIVE DATALOGGING", "ECU Scanner", "P2", "passed"),
  t("7.1.3", "Module scanner returns part numbers", "LIVE DATALOGGING", "ECU Scanner", "P2", "passed"),

  // — Vehicle Coding —
  t("7.2.1", "Vehicle coding panel loads", "LIVE DATALOGGING", "Vehicle Coding", "P3", "passed"),
  t("7.2.2", "Write coding to ECU works", "LIVE DATALOGGING", "Vehicle Coding", "P3", "in_progress"),
  t("7.2.3", "Verify coding after write", "LIVE DATALOGGING", "Vehicle Coding", "P3", "in_progress"),

  // — DTC Reading & Clearing —
  t("7.3.1", "DTC reader displays stored codes", "LIVE DATALOGGING", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.2", "DTC search by code works", "LIVE DATALOGGING", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.3", "GM HD DTC database loads", "LIVE DATALOGGING", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.4", "DTC clear command sent and confirmed", "LIVE DATALOGGING", "DTC Reading & Clearing", "P2", "passed"),
  t("7.3.5", "IntelliSpy real-time DTC monitoring", "LIVE DATALOGGING", "DTC Reading & Clearing", "P2", "passed"),

  // ═══════════════════════════════════════════════════════════
  // CALIBRATION EDITOR
  // ═══════════════════════════════════════════════════════════

  // — Binary Loading —
  t("4.1.1", "Load .bin binary file into editor", "CALIBRATION EDITOR", "Binary Loading", "P1", "passed"),
  t("4.1.2", "Load .tun binary file into editor", "CALIBRATION EDITOR", "Binary Loading", "P1", "passed"),
  t("4.1.3", "Binary metadata extracted (part number, OS, size)", "CALIBRATION EDITOR", "Binary Loading", "P1", "passed"),
  t("4.1.4", "ECU type auto-detected from binary", "CALIBRATION EDITOR", "Binary Loading", "P1", "passed"),
  t("4.1.5", "Multiple binary formats supported", "CALIBRATION EDITOR", "Binary Loading", "P1", "passed"),

  // — A2L & Mapping —
  t("4.2.1", "A2L file parsed and maps loaded", "CALIBRATION EDITOR", "A2L & Mapping", "P1", "passed"),
  t("4.2.2", "A2L auto-matched to binary by part number", "CALIBRATION EDITOR", "A2L & Mapping", "P1", "passed"),
  t("4.2.3", "A2L registry stores definitions for reuse", "CALIBRATION EDITOR", "A2L & Mapping", "P1", "passed"),
  t("4.2.4", "Manual A2L upload and assignment", "CALIBRATION EDITOR", "A2L & Mapping", "P2", "passed"),
  t("4.2.5", "A2L version mismatch warning", "CALIBRATION EDITOR", "A2L & Mapping", "P2", "passed"),

  // — Map Editing —
  t("4.3.1", "1D map (curve) renders correctly", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.2", "2D map (table) renders correctly", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.3", "3D map (surface) renders correctly", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.4", "Reference tool works for map comparison", "CALIBRATION EDITOR", "Map Editing", "P1", "in_progress"),
  t("4.3.5", "Cell editing works in map editor", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.6", "Map search finds maps by name", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.7", "Category tree navigation works", "CALIBRATION EDITOR", "Map Editing", "P1", "passed"),
  t("4.3.8", "Map smoothing algorithms work", "CALIBRATION EDITOR", "Map Editing", "P2", "passed"),
  t("4.3.9", "Hex view tab shows raw hex data", "CALIBRATION EDITOR", "Map Editing", "P2", "passed"),

  // — MG1 Alignment —
  t("4.4.3", "DEADBEEF header parsed — flash addresses extracted", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "passed"),
  t("4.4.4", "Alignment engine finds correct base from DEADBEEF candidates", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "passed"),
  t("4.4.5", "Knox autoHealAlignment fixes misaligned maps", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "passed"),
  t("4.4.9", "Offset calibration panel allows manual adjustment", "CALIBRATION EDITOR", "MG1 Alignment", "P2", "passed"),
  t("4.4.1", "MG1 Can-Am binary AirPah values match reference (set 1)", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "in_progress"),
  t("4.4.2", "MG1 Can-Am binary AirPah values match reference (set 2)", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "in_progress"),
  t("4.4.6", "Alignment shows 'Healed' status after auto-correction", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "in_progress"),
  t("4.4.7", "Multiple MG1 binaries tested — all align correctly", "CALIBRATION EDITOR", "MG1 Alignment", "P1", "in_progress"),
  t("4.4.8", "Polaris MG1 binary aligns correctly", "CALIBRATION EDITOR", "MG1 Alignment", "P2", "in_progress"),

  // — Tune Compare —
  t("4.5.1", "Load two binaries for comparison", "CALIBRATION EDITOR", "Tune Compare", "P1", "passed"),
  t("4.5.2", "Diff view shows byte-level differences", "CALIBRATION EDITOR", "Tune Compare", "P1", "passed"),
  t("4.5.3", "File size mismatch warning displayed", "CALIBRATION EDITOR", "Tune Compare", "P1", "passed"),
  t("4.5.4", "Compare engine attempts to make offsets compatible", "CALIBRATION EDITOR", "Tune Compare", "P2", "passed"),
  t("4.5.5", "Side-by-side map comparison view", "CALIBRATION EDITOR", "Tune Compare", "P1", "passed"),

  // — Segment Swap —
  t("4.6.1", "Upload two binaries for segment comparison", "CALIBRATION EDITOR", "Segment Swap", "P1", "passed"),
  t("4.6.2", "Part number validation for segment swap", "CALIBRATION EDITOR", "Segment Swap", "P1", "passed"),
  t("4.6.3", "Identical offsets/OS required for swap", "CALIBRATION EDITOR", "Segment Swap", "P1", "passed"),
  t("4.6.4", "Warning displayed for incompatible segments", "CALIBRATION EDITOR", "Segment Swap", "P1", "passed"),
  t("4.6.5", "Download swapped binary file", "CALIBRATION EDITOR", "Segment Swap", "P1", "in_progress"),
  t("4.6.6", "Format conversion attempted if formats differ", "CALIBRATION EDITOR", "Segment Swap", "P3", "in_progress"),

  // — Checksums —
  t("4.7.1", "Auto-checksum toggle works", "CALIBRATION EDITOR", "Checksums", "P1", "passed"),
  t("4.7.2", "ECU checksum algorithm auto-detected", "CALIBRATION EDITOR", "Checksums", "P1", "passed"),
  t("4.7.3", "Checksum recalculated after map edit", "CALIBRATION EDITOR", "Checksums", "P1", "passed"),
  t("4.7.4", "Checksum validation passes for valid binary", "CALIBRATION EDITOR", "Checksums", "P1", "in_progress"),
  t("4.7.5", "Checksum validation fails for corrupted binary", "CALIBRATION EDITOR", "Checksums", "P2", "in_progress"),

  // — Unlock Patches —
  t("4.8.1", "Dynojet unlock patch applies correctly", "CALIBRATION EDITOR", "Unlock Patches", "P2", "passed"),
  t("4.8.2", "HPTuners unlock patch applies correctly", "CALIBRATION EDITOR", "Unlock Patches", "P2", "passed"),
  t("4.8.3", "Patched file exports successfully", "CALIBRATION EDITOR", "Unlock Patches", "P2", "passed"),

  // — Export —
  t("4.9.1", "Download modified binary file", "CALIBRATION EDITOR", "Export", "P1", "passed"),
  t("4.9.2", "Export to Dynojet format", "CALIBRATION EDITOR", "Export", "P2", "passed"),
  t("4.9.3", "Export to HPTuners format", "CALIBRATION EDITOR", "Export", "P2", "passed"),
  t("4.9.4", "Binary writer produces valid output", "CALIBRATION EDITOR", "Export", "P1", "passed"),

  // ═══════════════════════════════════════════════════════════
  // REVERSE ENGINEERING
  // ═══════════════════════════════════════════════════════════

  // — Auto-Definition Generation —
  t("5.1.1", "Binary definition engine scans unknown binary for maps", "REVERSE ENGINEERING", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.2", "Pattern database matches known ECU signatures", "REVERSE ENGINEERING", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.3", "Map discovery finds 1D, 2D, and 3D structures", "REVERSE ENGINEERING", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.4", "Generated A2L saved to database for reuse", "REVERSE ENGINEERING", "Auto-Definition Generation", "P2", "passed"),
  t("5.1.5", "Reverse engineering panel shows discovery progress", "REVERSE ENGINEERING", "Auto-Definition Generation", "P2", "in_progress"),
  t("5.1.6", "ME17 template comparison for definition building", "REVERSE ENGINEERING", "Auto-Definition Generation", "P3", "passed"),

  // — Knox AI Map Search —
  t("5.2.1", "Knox map search finds maps by description", "REVERSE ENGINEERING", "Knox AI Map Search", "P1", "passed"),
  t("5.2.2", "Knox map search finds maps by parameter name", "REVERSE ENGINEERING", "Knox AI Map Search", "P1", "passed"),
  t("5.2.3", "Knox learning engine improves results over time", "REVERSE ENGINEERING", "Knox AI Map Search", "P3", "passed"),
  t("5.2.4", "Knox reasoning feedback loop works", "REVERSE ENGINEERING", "Knox AI Map Search", "P3", "passed"),

  // — Knox AI Assistant —
  t("6.1.1", "Knox chat opens and responds to messages", "REVERSE ENGINEERING", "Knox AI Assistant", "P1", "passed"),
  t("6.1.2", "Knox answers diagnostic questions using LLM", "REVERSE ENGINEERING", "Knox AI Assistant", "P1", "passed"),
  t("6.1.3", "Knox references uploaded datalog in responses", "REVERSE ENGINEERING", "Knox AI Assistant", "P1", "passed"),
  t("6.1.4", "Knox provides map recommendations for tuning", "REVERSE ENGINEERING", "Knox AI Assistant", "P2", "passed"),
  t("6.1.5", "Knox Shield prevents harmful/unsafe tuning advice", "REVERSE ENGINEERING", "Knox AI Assistant", "P1", "passed"),
  t("6.1.6", "Markdown rendering in Knox responses (Streamdown)", "REVERSE ENGINEERING", "Knox AI Assistant", "P2", "passed"),
  t("6.2.1", "Voice command button activates microphone", "REVERSE ENGINEERING", "Knox AI Assistant", "P2", "passed"),
  t("6.2.2", "Speech-to-text transcription works", "REVERSE ENGINEERING", "Knox AI Assistant", "P2", "passed"),
  t("6.2.3", "Voice command triggers correct action", "REVERSE ENGINEERING", "Knox AI Assistant", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════════
  // MISC
  // ═══════════════════════════════════════════════════════════

  // — Drag Racing —
  t("8.1.1", "Create drag racing profile", "MISC", "Drag Racing", "P1", "passed"),
  t("8.1.2", "Submit a run with timeslip data", "MISC", "Drag Racing", "P1", "passed"),
  t("8.1.3", "Timeslip component renders correctly", "MISC", "Drag Racing", "P1", "passed"),
  t("8.1.4", "Drag analyzer processes run data", "MISC", "Drag Racing", "P1", "passed"),
  t("8.1.5", "Best ET/MPH tracked correctly", "MISC", "Drag Racing", "P1", "passed"),
  t("8.1.6", "Summary banner displays correctly", "MISC", "Drag Racing", "P1", "passed"),
  t("8.2.1", "Leaderboard displays ranked by ET", "MISC", "Drag Racing", "P1", "passed"),
  t("8.2.2", "Leaderboard filters work (class, location, time)", "MISC", "Drag Racing", "P2", "passed"),
  t("8.2.3", "Regional badges display on profiles", "MISC", "Drag Racing", "P2", "passed"),
  t("8.2.4", "'Fastest in' badge displays correctly", "MISC", "Drag Racing", "P2", "in_progress"),
  t("8.3.1", "Create a challenge", "MISC", "Drag Racing", "P2", "passed"),
  t("8.3.2", "Challenge notification sent", "MISC", "Drag Racing", "P2", "in_progress"),
  t("8.3.3", "Accept/decline challenge works", "MISC", "Drag Racing", "P2", "passed"),
  t("8.3.4", "Callout system works", "MISC", "Drag Racing", "P2", "passed"),
  t("8.3.5", "Challenge links shareable via URL", "MISC", "Drag Racing", "P3", "in_progress"),
  t("8.4.1", "Create a league", "MISC", "Drag Racing", "P2", "passed"),
  t("8.4.2", "Join a league", "MISC", "Drag Racing", "P2", "passed"),
  t("8.4.3", "League standings display correctly", "MISC", "Drag Racing", "P2", "passed"),
  t("8.4.4", "Playoff bracket renders", "MISC", "Drag Racing", "P2", "in_progress"),
  t("8.4.5", "Tournament bracket renders", "MISC", "Drag Racing", "P2", "in_progress"),
  t("8.4.6", "Wallet and transaction system works", "MISC", "Drag Racing", "P3", "passed"),
  t("8.5.1", "Share timeslip via ShareCard", "MISC", "Drag Racing", "P2", "passed"),
  t("8.5.2", "Share generates image/link", "MISC", "Drag Racing", "P2", "in_progress"),

  // — Fleet Management —
  t("9.1.1", "Create fleet organization", "MISC", "Fleet Management", "P1", "passed"),
  t("9.1.2", "Add vehicle to fleet", "MISC", "Fleet Management", "P1", "passed"),
  t("9.1.3", "Vehicle details display correctly", "MISC", "Fleet Management", "P1", "passed"),
  t("9.1.4", "Fleet members can be invited and managed", "MISC", "Fleet Management", "P2", "passed"),
  t("9.1.5", "Summary banner explains module purpose", "MISC", "Fleet Management", "P1", "passed"),
  t("9.2.1", "Fleet dashboard shows vehicle overview", "MISC", "Fleet Management", "P1", "passed"),
  t("9.2.2", "Trip logging works", "MISC", "Fleet Management", "P2", "passed"),
  t("9.2.3", "Fuel log works", "MISC", "Fleet Management", "P2", "passed"),
  t("9.2.4", "Fleet events tracked", "MISC", "Fleet Management", "P2", "passed"),
  t("9.2.5", "Fleet alerts fire correctly", "MISC", "Fleet Management", "P2", "passed"),
  t("9.2.6", "Alert rules configurable per vehicle", "MISC", "Fleet Management", "P3", "passed"),
  t("9.3.1", "Remote diagnostic session connects to vehicle", "MISC", "Fleet Management", "P2", "in_progress"),
  t("9.3.2", "Fleet sensor data displays", "MISC", "Fleet Management", "P3", "in_progress"),
  t("9.3.3", "Device sync works", "MISC", "Fleet Management", "P3", "in_progress"),
  t("9.3.4", "AI insights for fleet", "MISC", "Fleet Management", "P3", "in_progress"),
  t("9.3.5", "Geofence alerts work", "MISC", "Fleet Management", "P3", "passed"),
  t("9.3.6", "Maintenance scheduling and tracking", "MISC", "Fleet Management", "P2", "in_progress"),
  t("9.3.7", "Fleet access tokens for API integration", "MISC", "Fleet Management", "P3"),
  t("9.3.8", "Fleet stats share via ShareCard", "MISC", "Fleet Management", "P2", "passed"),

  // — Community Forum —
  t("10.1.1", "Forum categories display", "MISC", "Community Forum", "P1", "passed"),
  t("10.1.2", "Forum channels display", "MISC", "Community Forum", "P1", "passed"),
  t("10.1.3", "Create a thread", "MISC", "Community Forum", "P1", "passed"),
  t("10.1.4", "Reply to a thread", "MISC", "Community Forum", "P1", "passed"),
  t("10.1.5", "Like a post", "MISC", "Community Forum", "P2", "passed"),
  t("10.1.6", "Thread view shows all posts in order", "MISC", "Community Forum", "P1", "passed"),
  t("10.2.1", "Forum membership tracking", "MISC", "Community Forum", "P2", "passed"),
  t("10.2.2", "Share thread via ShareCard", "MISC", "Community Forum", "P2", "passed"),
  t("10.2.3", "Share post via ShareCard", "MISC", "Community Forum", "P2", "passed"),
  t("10.2.4", "Forum search works", "MISC", "Community Forum", "P2", "in_progress"),

  // — Tune Management —
  t("11.1.1", "Save tune to library", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.2", "Open saved tune from library", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.3", "Save tune to local device", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.4", "Tune library matches vehicle part numbers and OS", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.5", "Tune distribution auto-sends to customer hardware", "MISC", "Tune Management", "P2", "in_progress"),
  t("11.1.6", "OS/part number mismatch prevention", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.7", "Only PPEI-approved calibrations can be flashed", "MISC", "Tune Management", "P1", "passed"),
  t("11.1.8", "Tune file sharing between tuners", "MISC", "Tune Management", "P2", "in_progress"),
  t("11.1.9", "Deleted tunes permanently removed and inaccessible", "MISC", "Tune Management", "P1", "passed"),
  t("11.2.1", "Upload multiple datalogs for side-by-side comparison", "MISC", "Tune Management", "P1", "in_progress"),
  t("11.2.2", "Analyzer pairs datalogs under similar conditions", "MISC", "Tune Management", "P2"),
  t("11.2.3", "Comparison report shows differences after tune change", "MISC", "Tune Management", "P1", "in_progress"),
  t("11.2.4", "Uses existing upload box for comparison files", "MISC", "Tune Management", "P2", "in_progress"),

  // — Auth & Access Control —
  t("13.1.1", "OAuth sign in works", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.1.2", "Session created after sign in", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.1.3", "Sign out works", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.1.4", "Avatar displays correctly", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.1.5", "Guest sees SIGN IN button", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.1.6", "Protected routes redirect unauthenticated users", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.2.1", "Advanced section requires auth (no legacy passcode)", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.2.2", "Admin approval required for advanced access", "MISC", "Auth & Access Control", "P1", "in_progress"),
  t("13.2.3", "Admin role can access admin features", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.2.4", "Regular user restricted from admin features", "MISC", "Auth & Access Control", "P1", "passed"),
  t("13.2.5", "Account deletion only by user or Kory Willis", "MISC", "Auth & Access Control", "P2", "in_progress"),
  t("13.2.6", "Access rights detection works per user role", "MISC", "Auth & Access Control", "P2", "passed"),

  // — Admin Panel —
  t("14.1.1", "DEV TOOLS tab visible only to admin users", "MISC", "Admin Panel", "P1", "passed"),
  t("14.1.2", "User management panel — view/edit users", "MISC", "Admin Panel", "P1", "passed"),
  t("14.1.3", "Admin messaging system works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.4", "Push notifications from admin panel", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.5", "Notification preferences panel works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.6", "QA checklist panel works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.7", "Support admin panel works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.8", "Debug dashboard works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.9", "Debug permissions and audit log", "MISC", "Admin Panel", "P3", "passed"),
  t("14.1.10", "Feedback panel works", "MISC", "Admin Panel", "P2", "passed"),
  t("14.1.11", "PID audit panel works", "MISC", "Admin Panel", "P3", "in_progress"),

  // — UI/UX & Branding —
  t("15.1.1", "All text readable against dark background", "MISC", "UI/UX & Branding", "P1", "in_progress"),
  t("15.1.2", "PPEI branding consistent (logo, red accent, dark theme)", "MISC", "UI/UX & Branding", "P1", "passed"),
  t("15.1.3", "Version number displays correctly (v0.03)", "MISC", "UI/UX & Branding", "P1", "passed"),
  t("15.1.4", "Responsive layout — works on tablet and mobile", "MISC", "UI/UX & Branding", "P2", "in_progress"),
  t("15.1.5", "Navigation between all tabs works without errors", "MISC", "UI/UX & Branding", "P1", "passed"),
  t("15.1.6", "404 page displays correctly", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.1.7", "Error boundary catches errors gracefully", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.1.8", "Loading states display correctly", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.1.9", "Empty states display correctly", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.2.1", "What's New panel shows on login", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.2.2", "What's New panel is dismissible", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.2.3", "What's New manager tracks versions", "MISC", "UI/UX & Branding", "P2", "passed"),
  t("15.3.1", "Real-time session sharing works", "MISC", "Collaboration & Remote Support", "P3", "in_progress"),
  t("15.3.2", "Session recording works", "MISC", "Collaboration & Remote Support", "P3", "in_progress"),
  t("15.3.3", "Support join page loads for remote assistance", "MISC", "Collaboration & Remote Support", "P2", "passed"),
  t("15.3.4", "Debug report button generates shareable report", "MISC", "Collaboration & Remote Support", "P2", "passed"),

  // — Knowledge Base —
  t("16.1", "ECU reference panel loads with correct data per ECU type", "MISC", "Knowledge Base", "P1", "passed"),
  t("16.2", "Knowledge base returns relevant articles", "MISC", "Knowledge Base", "P2", "passed"),
  t("16.3", "Vehicle knowledge base covers all supported platforms", "MISC", "Knowledge Base", "P2", "in_progress"),
  t("16.4", "Service procedures display for common tasks", "MISC", "Knowledge Base", "P3", "in_progress"),
  t("16.5", "Search engine finds content across all modules", "MISC", "Knowledge Base", "P2", "in_progress"),

  // — Notifications —
  t("17.1", "Notification bell shows unread count", "MISC", "Notifications", "P2", "passed"),
  t("17.2", "Notification dropdown lists recent notifications", "MISC", "Notifications", "P2", "passed"),
  t("17.3", "Notification preferences configurable", "MISC", "Notifications", "P3", "passed"),
  t("17.4", "Admin conversation system works", "MISC", "Notifications", "P2", "passed"),
  t("17.5", "Owner notification (notifyOwner) fires on key events", "MISC", "Notifications", "P2", "passed"),

  // — Data Persistence —
  t("18.1", "Datalog cache saves uploaded data for quick reload", "MISC", "Data Persistence", "P2", "passed"),
  t("18.2", "Editor session persistence saves work across page reloads", "MISC", "Data Persistence", "P1", "in_progress"),
  t("18.3", "Project system saves and loads user projects", "MISC", "Data Persistence", "P2", "passed"),
  t("18.4", "Offset profiles saved per binary/A2L combination", "MISC", "Data Persistence", "P2", "passed"),
  t("18.5", "All uploaded files remain confidential (never shared publicly)", "MISC", "Data Persistence", "P1", "passed"),
];
