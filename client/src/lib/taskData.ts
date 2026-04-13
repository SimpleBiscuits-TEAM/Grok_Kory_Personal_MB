export type Priority = "P1" | "P2" | "P3" | "P4";
export type Status = "not_started" | "in_progress" | "passed" | "failed" | "blocked";

export interface Task {
  id: string;
  name: string;
  module: number;
  moduleName: string;
  section: string;
  priority: Priority;
  status: Status;
}

export interface Module {
  id: number;
  name: string;
  sections: string[];
}

/**
 * Functional sections — grouped by what the work IS, not when it should be done.
 * Each section maps to a real area of the product.
 */
export const modules: Module[] = [
  { id: 1, name: "Analyzer — File Parsing", sections: ["EFILive Parser", "HP Tuners Parser", "WinOLS / WP8 Parser", "DBC / CAN Parser", "Upload UX"] },
  { id: 2, name: "Analyzer — Data Processing", sections: ["PID Detection & Substitution", "VIN Decoding", "Data Transforms"] },
  { id: 3, name: "Analyzer — Charts & Visualization", sections: ["Dyno Charts", "Fault Charts", "Chart UX"] },
  { id: 4, name: "Analyzer — Diagnostics", sections: ["Fault Detection Rules", "False-Positive Suppression", "Fault Correlation & Prediction"] },
  { id: 5, name: "Analyzer — Health Reports", sections: ["Report Generation", "PDF Export"] },
  { id: 6, name: "Vehicle Support — GM Duramax", sections: ["Duramax Parsing", "Duramax PIDs & Transmissions"] },
  { id: 7, name: "Vehicle Support — Ford Powerstroke", sections: ["Powerstroke Parsing"] },
  { id: 8, name: "Vehicle Support — Cummins", sections: ["Cummins Parsing"] },
  { id: 9, name: "Vehicle Support — European", sections: ["BMW Diesel"] },
  { id: 10, name: "Vehicle Support — Powersports", sections: ["Can-Am", "Polaris", "Kawasaki", "Honda Talon", "Powersports PIDs"] },
  { id: 11, name: "Live Datalogging — OBD-II", sections: ["Device Connection", "Live Data & Gauges", "Recording & Export", "PID Presets"] },
  { id: 12, name: "Live Datalogging — Protocols", sections: ["J1939", "K-Line", "UDS Services", "Protocol Diagnostics"] },
  { id: 13, name: "Calibration Editor — Binary Loading", sections: ["Binary File Support", "Binary Metadata"] },
  { id: 14, name: "Calibration Editor — A2L & Mapping", sections: ["A2L Parsing", "A2L Registry & Auto-Match"] },
  { id: 15, name: "Calibration Editor — Map Editing", sections: ["Map Display Types", "Editing & Search", "Map Smoothing & Hex"] },
  { id: 16, name: "Calibration Editor — MG1 Alignment", sections: ["DEADBEEF & Alignment Engine", "Alignment Validation"] },
  { id: 17, name: "Calibration Editor — Tune Compare", sections: ["Binary Diff", "Side-by-Side Maps"] },
  { id: 18, name: "Calibration Editor — Segment Swap", sections: ["Swap Validation", "Swap Export"] },
  { id: 19, name: "Calibration Editor — Checksums", sections: ["Checksum Engine"] },
  { id: 20, name: "Calibration Editor — Unlock Patches", sections: ["MG1 Unlock Patches"] },
  { id: 21, name: "Calibration Editor — Export", sections: ["Binary Export"] },
  { id: 22, name: "Reverse Engineering", sections: ["Auto-Definition Generation", "Knox AI Map Search"] },
  { id: 23, name: "Knox AI Assistant", sections: ["Chat & LLM", "Voice Commands"] },
  { id: 24, name: "ECU Scanner & Vehicle Coding", sections: ["Module Scanner", "Vehicle Coding", "DTC Reading & Clearing"] },
  { id: 25, name: "Drag Racing", sections: ["Profile & Runs", "Leaderboard & Regional", "Challenges & Callouts", "Leagues & Tournaments", "Share Integration"] },
  { id: 26, name: "Fleet Management", sections: ["Organization & Vehicles", "Fleet Monitoring", "Fleet Advanced & Remote"] },
  { id: 27, name: "Community Forum", sections: ["Forum Structure", "Community Features"] },
  { id: 28, name: "Tune Management", sections: ["Tune Storage & Distribution", "Datalog Comparison"] },
  { id: 29, name: "Can-Am VIN & DESS", sections: ["VIN & DESS Tools"] },
  { id: 30, name: "Auth & Access Control", sections: ["User Authentication", "Access Control"] },
  { id: 31, name: "Admin Panel (DEV TOOLS)", sections: ["Admin Features"] },
  { id: 32, name: "UI/UX & Branding", sections: ["Visual Quality", "What's New & Onboarding", "Collaboration & Remote Support"] },
  { id: 33, name: "Knowledge Base & Reference", sections: ["ECU Reference", "Search & Knowledge"] },
  { id: 34, name: "Notifications & Messaging", sections: ["Notifications"] },
  { id: 35, name: "Data Persistence & Projects", sections: ["Persistence"] },
];

function t(id: string, name: string, module: number, moduleName: string, section: string, priority: Priority, status: Status = "not_started"): Task {
  return { id, name, module, moduleName, section, priority, status };
}

export const defaultTasks: Task[] = [
  // ═══════════════════════════════════════════════════════
  // 1. ANALYZER — FILE PARSING
  // ═══════════════════════════════════════════════════════
  t("1.1.1", "Upload standard EFILive CSV datalog", 1, "Analyzer — File Parsing", "EFILive Parser", "P1", "passed"),
  t("1.1.9", "Upload multiple files sequentially", 1, "Analyzer — File Parsing", "EFILive Parser", "P2", "passed"),

  t("1.1.2", "Upload HP Tuners CSV datalog", 1, "Analyzer — File Parsing", "HP Tuners Parser", "P1", "passed"),

  t("1.1.3", "Upload WP8 (WinOLS) datalog — WP8 parser", 1, "Analyzer — File Parsing", "WinOLS / WP8 Parser", "P1", "passed"),
  t("1.1.4", "Upload WinOLS CSV export — column mapping", 1, "Analyzer — File Parsing", "WinOLS / WP8 Parser", "P1", "passed"),

  t("1.1.5", "Upload DBC-format CAN log — DBC parser", 1, "Analyzer — File Parsing", "DBC / CAN Parser", "P2", "passed"),

  t("1.1.6", "Drag-and-drop upload works", 1, "Analyzer — File Parsing", "Upload UX", "P1", "passed"),
  t("1.1.7", "Upload file > 50 MB — progress indicator", 1, "Analyzer — File Parsing", "Upload UX", "P2", "in_progress"),
  t("1.1.8", "Upload invalid file — graceful error", 1, "Analyzer — File Parsing", "Upload UX", "P2", "passed"),
  t("1.1.10", "Subtitle text 'Upload your datalog' readable", 1, "Analyzer — File Parsing", "Upload UX", "P1", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 2. ANALYZER — DATA PROCESSING
  // ═══════════════════════════════════════════════════════
  t("1.2.1", "PIDs auto-detected from EFILive column headers", 2, "Analyzer — Data Processing", "PID Detection & Substitution", "P1", "passed"),
  t("1.2.2", "PIDs auto-detected from HP Tuners headers", 2, "Analyzer — Data Processing", "PID Detection & Substitution", "P1", "passed"),
  t("1.2.3", "PID substitution (MAP for missing boost PID)", 2, "Analyzer — Data Processing", "PID Detection & Substitution", "P1", "passed"),
  t("1.2.4", "Boost pressure calculated correctly (MAP minus barometric/idle)", 2, "Analyzer — Data Processing", "PID Detection & Substitution", "P1", "passed"),
  t("1.2.10", "PID selection on graph — multiple PIDs", 2, "Analyzer — Data Processing", "PID Detection & Substitution", "P1", "passed"),

  t("1.2.7", "Vehicle info extracted from VIN in filename", 2, "Analyzer — Data Processing", "VIN Decoding", "P1", "passed"),
  t("1.2.8", "VIN decoded via NHTSA — details populated", 2, "Analyzer — Data Processing", "VIN Decoding", "P1", "passed"),

  t("1.2.5", "Data downsampling for large datasets > 100K rows", 2, "Analyzer — Data Processing", "Data Transforms", "P2", "passed"),
  t("1.2.6", "Binned data creation for scatter plots", 2, "Analyzer — Data Processing", "Data Transforms", "P2", "passed"),
  t("1.2.9", "Combustion mode detected (normal vs regen)", 2, "Analyzer — Data Processing", "Data Transforms", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 3. ANALYZER — CHARTS & VISUALIZATION
  // ═══════════════════════════════════════════════════════
  t("1.3.1", "Dyno HP/TQ chart renders correctly", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P1", "passed"),
  t("1.3.2", "Dyno chart expands to full view", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P1", "passed"),
  t("1.3.3", "Dyno chart clipping works correctly", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P1", "in_progress"),
  t("1.3.4", "Dyno chart zoom works correctly", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P1", "passed"),
  t("1.3.5", "Dyno chart selectable X-axis", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P2", "passed"),
  t("1.3.16", "Dyno graph disclaimer about tuning setup accuracy", 3, "Analyzer — Charts & Visualization", "Dyno Charts", "P2", "passed"),

  t("1.3.6", "Boost efficiency chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P1", "passed"),
  t("1.3.7", "Rail pressure fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P1", "passed"),
  t("1.3.8", "Boost fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P1", "passed"),
  t("1.3.9", "EGT fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P1", "passed"),
  t("1.3.10", "MAF fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P2", "passed"),
  t("1.3.11", "TCC fault chart with gear as third data series", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P1", "passed"),
  t("1.3.12", "VGT fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P2", "passed"),
  t("1.3.13", "Regulator fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P2", "passed"),
  t("1.3.14", "Coolant fault chart renders", 3, "Analyzer — Charts & Visualization", "Fault Charts", "P2", "passed"),

  t("1.3.15", "Chart text readable against dark background", 3, "Analyzer — Charts & Visualization", "Chart UX", "P1", "in_progress"),
  t("1.3.17", "ZoomableChart component for interactive exploration", 3, "Analyzer — Charts & Visualization", "Chart UX", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 4. ANALYZER — DIAGNOSTICS
  // ═══════════════════════════════════════════════════════
  t("1.4.1", "Diagnostic report generates after upload", 4, "Analyzer — Diagnostics", "Fault Detection Rules", "P1", "passed"),
  t("1.4.5", "Rail pressure deviation from desired vs actual + PCV", 4, "Analyzer — Diagnostics", "Fault Detection Rules", "P1", "passed"),
  t("1.4.6", "Converter slip detection via TCC pressure and zero-slip analysis", 4, "Analyzer — Diagnostics", "Fault Detection Rules", "P1", "passed"),
  t("1.4.7", "Converter lockup allows -15/+15 RPM slip range without fault", 4, "Analyzer — Diagnostics", "Fault Detection Rules", "P1", "passed"),
  t("1.4.8", "FPR/PCV channel treated as mA (not PWM duty %)", 4, "Analyzer — Diagnostics", "Fault Detection Rules", "P2", "passed"),

  t("1.4.2", "P0087 fault NOT flagged during decel or throttle < 30%", 4, "Analyzer — Diagnostics", "False-Positive Suppression", "P1", "passed"),
  t("1.4.3", "Diagnostic thresholds increased 30% to reduce false positives", 4, "Analyzer — Diagnostics", "False-Positive Suppression", "P1", "passed"),
  t("1.4.4", "Coolant temp rising from cold to operating NOT flagged", 4, "Analyzer — Diagnostics", "False-Positive Suppression", "P1", "passed"),
  t("1.4.9", "Unpopulated EGT channels NOT shown as faults", 4, "Analyzer — Diagnostics", "False-Positive Suppression", "P1", "passed"),

  t("1.4.10", "Fault correlation engine links related faults", 4, "Analyzer — Diagnostics", "Fault Correlation & Prediction", "P2", "passed"),
  t("1.4.11", "Fault prediction engine provides predictive warnings", 4, "Analyzer — Diagnostics", "Fault Correlation & Prediction", "P3", "passed"),
  t("1.4.12", "Unified diagnostics aggregates all fault sources", 4, "Analyzer — Diagnostics", "Fault Correlation & Prediction", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 5. ANALYZER — HEALTH REPORTS
  // ═══════════════════════════════════════════════════════
  t("1.5.1", "Health report generates with friendly/humorous tone", 5, "Analyzer — Health Reports", "Report Generation", "P1", "passed"),
  t("1.5.2", "Report tone adjusts based on severity", 5, "Analyzer — Health Reports", "Report Generation", "P2", "passed"),
  t("1.5.3", "Report includes BETA AI disclaimer", 5, "Analyzer — Health Reports", "Report Generation", "P1", "passed"),
  t("1.5.4", "Report author shows 'Kory (Maybe?)'", 5, "Analyzer — Health Reports", "Report Generation", "P2", "passed"),
  t("1.5.5", "Report includes graphs from datalogs with explanations", 5, "Analyzer — Health Reports", "Report Generation", "P1", "passed"),
  t("1.5.8", "Reasoning engine report generates with AI analysis", 5, "Analyzer — Health Reports", "Report Generation", "P2", "passed"),

  t("1.5.6", "PDF export generates downloadable file", 5, "Analyzer — Health Reports", "PDF Export", "P1", "passed"),
  t("1.5.7", "Advanced health PDF export works", 5, "Analyzer — Health Reports", "PDF Export", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 6. VEHICLE SUPPORT — GM DURAMAX
  // ═══════════════════════════════════════════════════════
  t("2.1.1", "LBZ datalog parses correctly", 6, "Vehicle Support — GM Duramax", "Duramax Parsing", "P1", "passed"),
  t("2.1.2", "LMM datalog parses correctly", 6, "Vehicle Support — GM Duramax", "Duramax Parsing", "P1", "passed"),
  t("2.1.3", "LML datalog parses correctly", 6, "Vehicle Support — GM Duramax", "Duramax Parsing", "P1", "passed"),
  t("2.1.4", "L5P datalog parses correctly", 6, "Vehicle Support — GM Duramax", "Duramax Parsing", "P1", "passed"),

  t("2.1.5", "L5P ECU reference data loads (extended PIDs, mode 22)", 6, "Vehicle Support — GM Duramax", "Duramax PIDs & Transmissions", "P1", "passed"),
  t("2.1.6", "Allison transmission detected for 2001-2019 models", 6, "Vehicle Support — GM Duramax", "Duramax PIDs & Transmissions", "P1", "passed"),
  t("2.1.7", "10L1000 transmission detected for 2020+ models", 6, "Vehicle Support — GM Duramax", "Duramax PIDs & Transmissions", "P1", "passed"),
  t("2.1.8", "GM-specific extended PIDs (fuel rail, DEF, DPF soot)", 6, "Vehicle Support — GM Duramax", "Duramax PIDs & Transmissions", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 7. VEHICLE SUPPORT — FORD POWERSTROKE
  // ═══════════════════════════════════════════════════════
  t("2.2.1", "6.7L Powerstroke datalog parses correctly", 7, "Vehicle Support — Ford Powerstroke", "Powerstroke Parsing", "P2", "in_progress"),
  t("2.2.2", "6.0L/7.3L legacy format support", 7, "Vehicle Support — Ford Powerstroke", "Powerstroke Parsing", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 8. VEHICLE SUPPORT — CUMMINS
  // ═══════════════════════════════════════════════════════
  t("2.3.1", "6.7L Cummins datalog parses correctly", 8, "Vehicle Support — Cummins", "Cummins Parsing", "P2", "passed"),
  t("2.3.2", "Cummins parameter database loads with correct PIDs", 8, "Vehicle Support — Cummins", "Cummins Parsing", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 9. VEHICLE SUPPORT — EUROPEAN
  // ═══════════════════════════════════════════════════════
  t("2.4.1", "BMW diesel datalog parses correctly", 9, "Vehicle Support — European", "BMW Diesel", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 10. VEHICLE SUPPORT — POWERSPORTS
  // ═══════════════════════════════════════════════════════
  t("2.5.1", "Can-Am datalog parses with powersports PID database", 10, "Vehicle Support — Powersports", "Can-Am", "P1", "passed"),

  t("2.5.2", "Polaris datalog parses correctly", 10, "Vehicle Support — Powersports", "Polaris", "P2", "passed"),

  t("2.5.3", "Kawasaki datalog parses correctly", 10, "Vehicle Support — Powersports", "Kawasaki", "P3", "in_progress"),

  t("2.5.4", "Honda Talon detected automatically from log file", 10, "Vehicle Support — Powersports", "Honda Talon", "P2", "passed"),
  t("2.5.5", "Honda Talon fuel map editor loads (4 separate maps)", 10, "Vehicle Support — Powersports", "Honda Talon", "P2", "passed"),

  t("2.5.6", "Powersports PIDs database includes BRP/Can-Am specific PIDs", 10, "Vehicle Support — Powersports", "Powersports PIDs", "P1", "passed"),

  // ═══════════════════════════════════════════════════════
  // 11. LIVE DATALOGGING — OBD-II
  // ═══════════════════════════════════════════════════════
  t("3.1.1", "OBDLink EX device connects via WebSerial/WebUSB", 11, "Live Datalogging — OBD-II", "Device Connection", "P1", "passed"),
  t("3.1.2", "Protocol auto-detection identifies vehicle protocol", 11, "Live Datalogging — OBD-II", "Device Connection", "P1", "passed"),

  t("3.1.3", "Live data stream displays in real-time gauges", 11, "Live Datalogging — OBD-II", "Live Data & Gauges", "P1", "passed"),
  t("3.1.7", "Live chart renders real-time data without lag", 11, "Live Datalogging — OBD-II", "Live Data & Gauges", "P2", "in_progress"),
  t("3.1.8", "Modern gauge component displays live values", 11, "Live Datalogging — OBD-II", "Live Data & Gauges", "P2", "passed"),

  t("3.1.4", "Data recording starts/stops cleanly", 11, "Live Datalogging — OBD-II", "Recording & Export", "P1", "passed"),
  t("3.1.5", "Recorded data exports as CSV to local device", 11, "Live Datalogging — OBD-II", "Recording & Export", "P1", "passed"),
  t("3.1.6", "Recorded data can be opened directly in analyzer", 11, "Live Datalogging — OBD-II", "Recording & Export", "P1", "in_progress"),

  t("3.1.9", "Protocol presets load correct PID sets per vehicle", 11, "Live Datalogging — OBD-II", "PID Presets", "P2", "passed"),
  t("3.1.10", "Custom PID preset creation", 11, "Live Datalogging — OBD-II", "PID Presets", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 12. LIVE DATALOGGING — PROTOCOLS
  // ═══════════════════════════════════════════════════════
  t("3.2.1", "J1939 protocol initializes on CAN bus", 12, "Live Datalogging — Protocols", "J1939", "P1", "passed"),
  t("3.2.2", "J1939 PGN decoding works for standard messages", 12, "Live Datalogging — Protocols", "J1939", "P1", "passed"),
  t("3.2.3", "J1939 logging panel records data", 12, "Live Datalogging — Protocols", "J1939", "P1", "passed"),
  t("3.2.4", "J1939 DTC reading works", 12, "Live Datalogging — Protocols", "J1939", "P2", "passed"),
  t("3.2.5", "J1939 CSV export with decoded PGN names", 12, "Live Datalogging — Protocols", "J1939", "P2", "in_progress"),
  t("3.2.6", "J1939 flashing capability (if applicable)", 12, "Live Datalogging — Protocols", "J1939", "P3"),

  t("3.3.1", "K-Line protocol initializes (ISO 9141-2 / ISO 14230)", 12, "Live Datalogging — Protocols", "K-Line", "P2", "passed"),
  t("3.3.2", "K-Line logging panel records data", 12, "Live Datalogging — Protocols", "K-Line", "P2", "in_progress"),
  t("3.3.3", "K-Line data exports correctly", 12, "Live Datalogging — Protocols", "K-Line", "P3", "in_progress"),

  t("3.4.1", "UDS transport layer connects to ECU", 12, "Live Datalogging — Protocols", "UDS Services", "P1", "passed"),
  t("3.4.2", "UDS service 0x22 (Read Data By Identifier) works", 12, "Live Datalogging — Protocols", "UDS Services", "P1", "passed"),
  t("3.4.3", "UDS service 0x2E (Write Data By Identifier) works", 12, "Live Datalogging — Protocols", "UDS Services", "P2", "passed"),
  t("3.4.4", "UDS service 0x19 (Read DTC Information) works", 12, "Live Datalogging — Protocols", "UDS Services", "P1", "passed"),
  t("3.4.5", "UDS service 0x14 (Clear DTCs) works", 12, "Live Datalogging — Protocols", "UDS Services", "P2", "passed"),
  t("3.4.6", "UDS service 0x31 (Routine Control) works", 12, "Live Datalogging — Protocols", "UDS Services", "P3", "passed"),
  t("3.4.7", "UDS reference panel shows service descriptions", 12, "Live Datalogging — Protocols", "UDS Services", "P2", "passed"),
  t("3.4.8", "UDS security access (0x27) handshake works", 12, "Live Datalogging — Protocols", "UDS Services", "P2", "passed"),

  t("3.5.1", "Protocol auto-detection UI shows detected protocol", 12, "Live Datalogging — Protocols", "Protocol Diagnostics", "P1", "passed"),
  t("3.5.2", "Protocol selector allows manual override", 12, "Live Datalogging — Protocols", "Protocol Diagnostics", "P2", "passed"),
  t("3.5.3", "Protocol data normalizer converts between formats", 12, "Live Datalogging — Protocols", "Protocol Diagnostics", "P2", "passed"),
  t("3.5.4", "Protocol diagnostics panel shows connection health", 12, "Live Datalogging — Protocols", "Protocol Diagnostics", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 13. CALIBRATION EDITOR — BINARY LOADING
  // ═══════════════════════════════════════════════════════
  t("4.1.1", "Load GM E38 .bin file", 13, "Calibration Editor — Binary Loading", "Binary File Support", "P1", "passed"),
  t("4.1.2", "Load GM E67 / Bosch EDC17 .bin file", 13, "Calibration Editor — Binary Loading", "Binary File Support", "P1", "passed"),
  t("4.1.3", "Load Bosch MG1 (Can-Am) .bin file", 13, "Calibration Editor — Binary Loading", "Binary File Support", "P1", "passed"),
  t("4.1.4", "Load Polaris MG1 .bin file", 13, "Calibration Editor — Binary Loading", "Binary File Support", "P1", "passed"),
  t("4.1.5", "Load Bosch ME17 .bin file", 13, "Calibration Editor — Binary Loading", "Binary File Support", "P2", "passed"),

  t("4.1.6", "Binary file size and header info displayed correctly", 13, "Calibration Editor — Binary Loading", "Binary Metadata", "P1", "passed"),
  t("4.1.7", "VIN extracted from binary file", 13, "Calibration Editor — Binary Loading", "Binary Metadata", "P1", "passed"),
  t("4.1.8", "Operating system and part numbers extracted", 13, "Calibration Editor — Binary Loading", "Binary Metadata", "P1", "passed"),
  t("4.1.9", "Hex offset data displayed from binary", 13, "Calibration Editor — Binary Loading", "Binary Metadata", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 14. CALIBRATION EDITOR — A2L & MAPPING
  // ═══════════════════════════════════════════════════════
  t("4.2.1", "Upload A2L file — parser extracts all characteristics", 14, "Calibration Editor — A2L & Mapping", "A2L Parsing", "P1", "passed"),
  t("4.2.2", "A2L maps listed in categorized tree", 14, "Calibration Editor — A2L & Mapping", "A2L Parsing", "P1", "passed"),
  t("4.2.3", "A2L address-to-file-offset alignment computed correctly", 14, "Calibration Editor — A2L & Mapping", "A2L Parsing", "P1", "passed"),
  t("4.2.4", "Alignment percentage shown (95%+ for good match)", 14, "Calibration Editor — A2L & Mapping", "A2L Parsing", "P1", "passed"),

  t("4.2.5", "A2L registry stores definitions for reuse", 14, "Calibration Editor — A2L & Mapping", "A2L Registry & Auto-Match", "P2", "passed"),
  t("4.2.6", "Binary auto-matches to known A2L", 14, "Calibration Editor — A2L & Mapping", "A2L Registry & Auto-Match", "P2", "passed"),
  t("4.2.7", "A2L stored in database", 14, "Calibration Editor — A2L & Mapping", "A2L Registry & Auto-Match", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 15. CALIBRATION EDITOR — MAP EDITING
  // ═══════════════════════════════════════════════════════
  t("4.3.1", "1D VALUE display works", 15, "Calibration Editor — Map Editing", "Map Display Types", "P1", "passed"),
  t("4.3.2", "1D CURVE display works", 15, "Calibration Editor — Map Editing", "Map Display Types", "P1", "passed"),
  t("4.3.3", "2D MAP display works", 15, "Calibration Editor — Map Editing", "Map Display Types", "P1", "passed"),

  t("4.3.4", "Reference tool works for map comparison", 15, "Calibration Editor — Map Editing", "Editing & Search", "P1", "in_progress"),
  t("4.3.5", "Cell editing works in map editor", 15, "Calibration Editor — Map Editing", "Editing & Search", "P1", "passed"),
  t("4.3.6", "Map search finds maps by name", 15, "Calibration Editor — Map Editing", "Editing & Search", "P1", "passed"),
  t("4.3.7", "Category tree navigation works", 15, "Calibration Editor — Map Editing", "Editing & Search", "P1", "passed"),

  t("4.3.8", "Map smoothing algorithms work", 15, "Calibration Editor — Map Editing", "Map Smoothing & Hex", "P2", "passed"),
  t("4.3.9", "Hex view tab shows raw hex data", 15, "Calibration Editor — Map Editing", "Map Smoothing & Hex", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 16. CALIBRATION EDITOR — MG1 ALIGNMENT
  // ═══════════════════════════════════════════════════════
  t("4.4.3", "DEADBEEF header parsed — flash addresses extracted", 16, "Calibration Editor — MG1 Alignment", "DEADBEEF & Alignment Engine", "P1", "passed"),
  t("4.4.4", "Alignment engine finds correct base from DEADBEEF candidates", 16, "Calibration Editor — MG1 Alignment", "DEADBEEF & Alignment Engine", "P1", "passed"),
  t("4.4.5", "Knox autoHealAlignment fixes misaligned maps", 16, "Calibration Editor — MG1 Alignment", "DEADBEEF & Alignment Engine", "P1", "passed"),
  t("4.4.9", "Offset calibration panel allows manual adjustment", 16, "Calibration Editor — MG1 Alignment", "DEADBEEF & Alignment Engine", "P2", "passed"),

  t("4.4.1", "MG1 Can-Am binary AirPah values match reference (set 1)", 16, "Calibration Editor — MG1 Alignment", "Alignment Validation", "P1", "in_progress"),
  t("4.4.2", "MG1 Can-Am binary AirPah values match reference (set 2)", 16, "Calibration Editor — MG1 Alignment", "Alignment Validation", "P1", "in_progress"),
  t("4.4.6", "Alignment shows 'Healed' status after auto-correction", 16, "Calibration Editor — MG1 Alignment", "Alignment Validation", "P1", "in_progress"),
  t("4.4.7", "Multiple MG1 binaries tested — all align correctly", 16, "Calibration Editor — MG1 Alignment", "Alignment Validation", "P1", "in_progress"),
  t("4.4.8", "Polaris MG1 binary aligns correctly", 16, "Calibration Editor — MG1 Alignment", "Alignment Validation", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 17. CALIBRATION EDITOR — TUNE COMPARE
  // ═══════════════════════════════════════════════════════
  t("4.5.1", "Load two binaries for comparison", 17, "Calibration Editor — Tune Compare", "Binary Diff", "P1", "passed"),
  t("4.5.2", "Diff view shows byte-level differences", 17, "Calibration Editor — Tune Compare", "Binary Diff", "P1", "passed"),
  t("4.5.3", "File size mismatch warning displayed", 17, "Calibration Editor — Tune Compare", "Binary Diff", "P1", "passed"),
  t("4.5.4", "Compare engine attempts to make offsets compatible", 17, "Calibration Editor — Tune Compare", "Binary Diff", "P2", "passed"),

  t("4.5.5", "Side-by-side map comparison view", 17, "Calibration Editor — Tune Compare", "Side-by-Side Maps", "P1", "passed"),

  // ═══════════════════════════════════════════════════════
  // 18. CALIBRATION EDITOR — SEGMENT SWAP
  // ═══════════════════════════════════════════════════════
  t("4.6.1", "Upload two binaries for segment comparison", 18, "Calibration Editor — Segment Swap", "Swap Validation", "P1", "passed"),
  t("4.6.2", "Part number validation for segment swap", 18, "Calibration Editor — Segment Swap", "Swap Validation", "P1", "passed"),
  t("4.6.3", "Identical offsets/OS required for swap", 18, "Calibration Editor — Segment Swap", "Swap Validation", "P1", "passed"),
  t("4.6.4", "Warning displayed for incompatible segments", 18, "Calibration Editor — Segment Swap", "Swap Validation", "P1", "passed"),

  t("4.6.5", "Download swapped binary file", 18, "Calibration Editor — Segment Swap", "Swap Export", "P1", "in_progress"),
  t("4.6.6", "Format conversion attempted if formats differ", 18, "Calibration Editor — Segment Swap", "Swap Export", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 19. CALIBRATION EDITOR — CHECKSUMS
  // ═══════════════════════════════════════════════════════
  t("4.7.1", "Auto-checksum toggle works", 19, "Calibration Editor — Checksums", "Checksum Engine", "P1", "passed"),
  t("4.7.2", "ECU checksum algorithm auto-detected", 19, "Calibration Editor — Checksums", "Checksum Engine", "P1", "passed"),
  t("4.7.3", "Checksum recalculated after map edit", 19, "Calibration Editor — Checksums", "Checksum Engine", "P1", "passed"),
  t("4.7.4", "Checksum validation passes for valid binary", 19, "Calibration Editor — Checksums", "Checksum Engine", "P1", "in_progress"),
  t("4.7.5", "Checksum validation fails for corrupted binary", 19, "Calibration Editor — Checksums", "Checksum Engine", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 20. CALIBRATION EDITOR — UNLOCK PATCHES
  // ═══════════════════════════════════════════════════════
  t("4.8.1", "Dynojet unlock patch applies correctly", 20, "Calibration Editor — Unlock Patches", "MG1 Unlock Patches", "P2", "passed"),
  t("4.8.2", "HPTuners unlock patch applies correctly", 20, "Calibration Editor — Unlock Patches", "MG1 Unlock Patches", "P2", "passed"),
  t("4.8.3", "Patched file exports successfully", 20, "Calibration Editor — Unlock Patches", "MG1 Unlock Patches", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 21. CALIBRATION EDITOR — EXPORT
  // ═══════════════════════════════════════════════════════
  t("4.9.1", "Download modified binary file", 21, "Calibration Editor — Export", "Binary Export", "P1", "passed"),
  t("4.9.2", "Export to Dynojet format", 21, "Calibration Editor — Export", "Binary Export", "P2", "passed"),
  t("4.9.3", "Export to HPTuners format", 21, "Calibration Editor — Export", "Binary Export", "P2", "passed"),
  t("4.9.4", "Binary writer produces valid output", 21, "Calibration Editor — Export", "Binary Export", "P1", "passed"),

  // ═══════════════════════════════════════════════════════
  // 22. REVERSE ENGINEERING
  // ═══════════════════════════════════════════════════════
  t("5.1.1", "Binary definition engine scans unknown binary for maps", 22, "Reverse Engineering", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.2", "Pattern database matches known ECU signatures", 22, "Reverse Engineering", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.3", "Map discovery finds 1D, 2D, and 3D structures", 22, "Reverse Engineering", "Auto-Definition Generation", "P1", "passed"),
  t("5.1.4", "Generated A2L saved to database for reuse", 22, "Reverse Engineering", "Auto-Definition Generation", "P2", "passed"),
  t("5.1.5", "Reverse engineering panel shows discovery progress", 22, "Reverse Engineering", "Auto-Definition Generation", "P2", "in_progress"),
  t("5.1.6", "ME17 template comparison for definition building", 22, "Reverse Engineering", "Auto-Definition Generation", "P3", "passed"),

  t("5.2.1", "Knox map search finds maps by description", 22, "Reverse Engineering", "Knox AI Map Search", "P1", "passed"),
  t("5.2.2", "Knox map search finds maps by parameter name", 22, "Reverse Engineering", "Knox AI Map Search", "P1", "passed"),
  t("5.2.3", "Knox learning engine improves results over time", 22, "Reverse Engineering", "Knox AI Map Search", "P3", "passed"),
  t("5.2.4", "Knox reasoning feedback loop works", 22, "Reverse Engineering", "Knox AI Map Search", "P3", "passed"),

  // ═══════════════════════════════════════════════════════
  // 23. KNOX AI ASSISTANT
  // ═══════════════════════════════════════════════════════
  t("6.1.1", "Knox chat opens and responds to messages", 23, "Knox AI Assistant", "Chat & LLM", "P1", "passed"),
  t("6.1.2", "Knox answers diagnostic questions using LLM", 23, "Knox AI Assistant", "Chat & LLM", "P1", "passed"),
  t("6.1.3", "Knox references uploaded datalog in responses", 23, "Knox AI Assistant", "Chat & LLM", "P1", "passed"),
  t("6.1.4", "Knox provides map recommendations for tuning", 23, "Knox AI Assistant", "Chat & LLM", "P2", "passed"),
  t("6.1.5", "Knox Shield prevents harmful/unsafe tuning advice", 23, "Knox AI Assistant", "Chat & LLM", "P1", "passed"),
  t("6.1.6", "Markdown rendering in Knox responses (Streamdown)", 23, "Knox AI Assistant", "Chat & LLM", "P2", "passed"),

  t("6.2.1", "Voice command button activates microphone", 23, "Knox AI Assistant", "Voice Commands", "P2", "passed"),
  t("6.2.2", "Speech-to-text transcription works", 23, "Knox AI Assistant", "Voice Commands", "P2", "passed"),
  t("6.2.3", "Voice command triggers correct action", 23, "Knox AI Assistant", "Voice Commands", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 24. ECU SCANNER & VEHICLE CODING
  // ═══════════════════════════════════════════════════════
  t("7.1.1", "Module scanner discovers ECU modules", 24, "ECU Scanner & Vehicle Coding", "Module Scanner", "P2", "passed"),
  t("7.1.2", "Module scanner displays addresses", 24, "ECU Scanner & Vehicle Coding", "Module Scanner", "P2", "passed"),
  t("7.1.3", "Module scanner returns part numbers", 24, "ECU Scanner & Vehicle Coding", "Module Scanner", "P2", "passed"),

  t("7.2.1", "Vehicle coding panel loads", 24, "ECU Scanner & Vehicle Coding", "Vehicle Coding", "P3", "passed"),
  t("7.2.2", "Write coding to ECU works", 24, "ECU Scanner & Vehicle Coding", "Vehicle Coding", "P3", "in_progress"),
  t("7.2.3", "Verify coding after write", 24, "ECU Scanner & Vehicle Coding", "Vehicle Coding", "P3", "in_progress"),

  t("7.3.1", "DTC reader displays stored codes", 24, "ECU Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.2", "DTC search by code works", 24, "ECU Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.3", "GM HD DTC database loads", 24, "ECU Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1", "passed"),
  t("7.3.4", "DTC clear command sent and confirmed", 24, "ECU Scanner & Vehicle Coding", "DTC Reading & Clearing", "P2", "passed"),
  t("7.3.5", "IntelliSpy real-time DTC monitoring", 24, "ECU Scanner & Vehicle Coding", "DTC Reading & Clearing", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 25. DRAG RACING
  // ═══════════════════════════════════════════════════════
  t("8.1.1", "Create drag racing profile", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),
  t("8.1.2", "Submit a run with timeslip data", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),
  t("8.1.3", "Timeslip component renders correctly", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),
  t("8.1.4", "Drag analyzer processes run data", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),
  t("8.1.5", "Best ET/MPH tracked correctly", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),
  t("8.1.6", "Summary banner displays correctly", 25, "Drag Racing", "Profile & Runs", "P1", "passed"),

  t("8.2.1", "Leaderboard displays ranked by ET", 25, "Drag Racing", "Leaderboard & Regional", "P1", "passed"),
  t("8.2.2", "Leaderboard filters work (class, location, time)", 25, "Drag Racing", "Leaderboard & Regional", "P2", "passed"),
  t("8.2.3", "Regional badges display on profiles", 25, "Drag Racing", "Leaderboard & Regional", "P2", "passed"),
  t("8.2.4", "'Fastest in' badge displays correctly", 25, "Drag Racing", "Leaderboard & Regional", "P2", "in_progress"),

  t("8.3.1", "Create a challenge", 25, "Drag Racing", "Challenges & Callouts", "P2", "passed"),
  t("8.3.2", "Challenge notification sent", 25, "Drag Racing", "Challenges & Callouts", "P2", "in_progress"),
  t("8.3.3", "Accept/decline challenge works", 25, "Drag Racing", "Challenges & Callouts", "P2", "passed"),
  t("8.3.4", "Callout system works", 25, "Drag Racing", "Challenges & Callouts", "P2", "passed"),
  t("8.3.5", "Challenge links shareable via URL", 25, "Drag Racing", "Challenges & Callouts", "P3", "in_progress"),

  t("8.4.1", "Create a league", 25, "Drag Racing", "Leagues & Tournaments", "P2", "passed"),
  t("8.4.2", "Join a league", 25, "Drag Racing", "Leagues & Tournaments", "P2", "passed"),
  t("8.4.3", "League standings display correctly", 25, "Drag Racing", "Leagues & Tournaments", "P2", "passed"),
  t("8.4.4", "Playoff bracket renders", 25, "Drag Racing", "Leagues & Tournaments", "P2", "in_progress"),
  t("8.4.5", "Tournament bracket renders", 25, "Drag Racing", "Leagues & Tournaments", "P2", "in_progress"),
  t("8.4.6", "Wallet and transaction system works", 25, "Drag Racing", "Leagues & Tournaments", "P3", "passed"),

  t("8.5.1", "Share timeslip via ShareCard", 25, "Drag Racing", "Share Integration", "P2", "passed"),
  t("8.5.2", "Share generates image/link", 25, "Drag Racing", "Share Integration", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 26. FLEET MANAGEMENT
  // ═══════════════════════════════════════════════════════
  t("9.1.1", "Create fleet organization", 26, "Fleet Management", "Organization & Vehicles", "P1", "passed"),
  t("9.1.2", "Add vehicle to fleet", 26, "Fleet Management", "Organization & Vehicles", "P1", "passed"),
  t("9.1.3", "Vehicle details display correctly", 26, "Fleet Management", "Organization & Vehicles", "P1", "passed"),
  t("9.1.4", "Fleet members can be invited and managed", 26, "Fleet Management", "Organization & Vehicles", "P2", "passed"),
  t("9.1.5", "Summary banner explains module purpose", 26, "Fleet Management", "Organization & Vehicles", "P1", "passed"),

  t("9.2.1", "Fleet dashboard shows vehicle overview", 26, "Fleet Management", "Fleet Monitoring", "P1", "passed"),
  t("9.2.2", "Trip logging works", 26, "Fleet Management", "Fleet Monitoring", "P2", "passed"),
  t("9.2.3", "Fuel log works", 26, "Fleet Management", "Fleet Monitoring", "P2", "passed"),
  t("9.2.4", "Fleet events tracked", 26, "Fleet Management", "Fleet Monitoring", "P2", "passed"),
  t("9.2.5", "Fleet alerts fire correctly", 26, "Fleet Management", "Fleet Monitoring", "P2", "passed"),
  t("9.2.6", "Alert rules configurable per vehicle", 26, "Fleet Management", "Fleet Monitoring", "P3", "passed"),

  t("9.3.1", "Remote diagnostic session connects to vehicle", 26, "Fleet Management", "Fleet Advanced & Remote", "P2", "in_progress"),
  t("9.3.2", "Fleet sensor data displays", 26, "Fleet Management", "Fleet Advanced & Remote", "P3", "in_progress"),
  t("9.3.3", "Device sync works", 26, "Fleet Management", "Fleet Advanced & Remote", "P3", "in_progress"),
  t("9.3.4", "AI insights for fleet", 26, "Fleet Management", "Fleet Advanced & Remote", "P3", "in_progress"),
  t("9.3.5", "Geofence alerts work", 26, "Fleet Management", "Fleet Advanced & Remote", "P3", "passed"),
  t("9.3.6", "Maintenance scheduling and tracking", 26, "Fleet Management", "Fleet Advanced & Remote", "P2", "in_progress"),
  t("9.3.7", "Fleet access tokens for API integration", 26, "Fleet Management", "Fleet Advanced & Remote", "P3"),
  t("9.3.8", "Fleet stats share via ShareCard", 26, "Fleet Management", "Fleet Advanced & Remote", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 27. COMMUNITY FORUM
  // ═══════════════════════════════════════════════════════
  t("10.1.1", "Forum categories display", 27, "Community Forum", "Forum Structure", "P1", "passed"),
  t("10.1.2", "Forum channels display", 27, "Community Forum", "Forum Structure", "P1", "passed"),
  t("10.1.3", "Create a thread", 27, "Community Forum", "Forum Structure", "P1", "passed"),
  t("10.1.4", "Reply to a thread", 27, "Community Forum", "Forum Structure", "P1", "passed"),
  t("10.1.5", "Like a post", 27, "Community Forum", "Forum Structure", "P2", "passed"),
  t("10.1.6", "Thread view shows all posts in order", 27, "Community Forum", "Forum Structure", "P1", "passed"),

  t("10.2.1", "Forum membership tracking", 27, "Community Forum", "Community Features", "P2", "passed"),
  t("10.2.2", "Share thread via ShareCard", 27, "Community Forum", "Community Features", "P2", "passed"),
  t("10.2.3", "Share post via ShareCard", 27, "Community Forum", "Community Features", "P2", "passed"),
  t("10.2.4", "Forum search works", 27, "Community Forum", "Community Features", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 28. TUNE MANAGEMENT
  // ═══════════════════════════════════════════════════════
  t("11.1.1", "Save tune to library", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.2", "Open saved tune from library", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.3", "Save tune to local device", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.4", "Tune library matches vehicle part numbers and OS", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.5", "Tune distribution auto-sends to customer hardware", 28, "Tune Management", "Tune Storage & Distribution", "P2", "in_progress"),
  t("11.1.6", "OS/part number mismatch prevention", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.7", "Only PPEI-approved calibrations can be flashed", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),
  t("11.1.8", "Tune file sharing between tuners", 28, "Tune Management", "Tune Storage & Distribution", "P2", "in_progress"),
  t("11.1.9", "Deleted tunes permanently removed and inaccessible", 28, "Tune Management", "Tune Storage & Distribution", "P1", "passed"),

  t("11.2.1", "Upload multiple datalogs for side-by-side comparison", 28, "Tune Management", "Datalog Comparison", "P1", "in_progress"),
  t("11.2.2", "Analyzer pairs datalogs under similar conditions", 28, "Tune Management", "Datalog Comparison", "P2"),
  t("11.2.3", "Comparison report shows differences after tune change", 28, "Tune Management", "Datalog Comparison", "P1", "in_progress"),
  t("11.2.4", "Uses existing upload box for comparison files", 28, "Tune Management", "Datalog Comparison", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 29. CAN-AM VIN & DESS
  // ═══════════════════════════════════════════════════════
  t("12.1", "Can-Am VIN changer loads", 29, "Can-Am VIN & DESS", "VIN & DESS Tools", "P2", "passed"),
  t("12.2", "VIN field editable in binary", 29, "Can-Am VIN & DESS", "VIN & DESS Tools", "P2", "passed"),
  t("12.3", "DESS key management", 29, "Can-Am VIN & DESS", "VIN & DESS Tools", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 30. AUTH & ACCESS CONTROL
  // ═══════════════════════════════════════════════════════
  t("13.1.1", "OAuth sign in works", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),
  t("13.1.2", "Session created after sign in", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),
  t("13.1.3", "Sign out works", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),
  t("13.1.4", "Avatar displays correctly", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),
  t("13.1.5", "Guest sees SIGN IN button", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),
  t("13.1.6", "Protected routes redirect unauthenticated users", 30, "Auth & Access Control", "User Authentication", "P1", "passed"),

  t("13.2.1", "Advanced section requires auth (no legacy passcode)", 30, "Auth & Access Control", "Access Control", "P1", "passed"),
  t("13.2.2", "Admin approval required for advanced access", 30, "Auth & Access Control", "Access Control", "P1", "in_progress"),
  t("13.2.3", "Admin role can access admin features", 30, "Auth & Access Control", "Access Control", "P1", "passed"),
  t("13.2.4", "Regular user restricted from admin features", 30, "Auth & Access Control", "Access Control", "P1", "passed"),
  t("13.2.5", "Account deletion only by user or Kory Willis", 30, "Auth & Access Control", "Access Control", "P2", "in_progress"),
  t("13.2.6", "Access rights detection works per user role", 30, "Auth & Access Control", "Access Control", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 31. ADMIN PANEL (DEV TOOLS)
  // ═══════════════════════════════════════════════════════
  t("14.1.1", "DEV TOOLS tab visible only to admin users", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P1", "passed"),
  t("14.1.2", "User management panel — view/edit users", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P1", "passed"),
  t("14.1.3", "Admin messaging system works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.4", "Push notifications from admin panel", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.5", "Notification preferences panel works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.6", "QA checklist panel works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.7", "Support admin panel works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.8", "Debug dashboard works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.9", "Debug permissions and audit log", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P3", "passed"),
  t("14.1.10", "Feedback panel works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P2", "passed"),
  t("14.1.11", "PID audit panel works", 31, "Admin Panel (DEV TOOLS)", "Admin Features", "P3", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 32. UI/UX & BRANDING
  // ═══════════════════════════════════════════════════════
  t("15.1.1", "All text readable against dark background", 32, "UI/UX & Branding", "Visual Quality", "P1", "in_progress"),
  t("15.1.2", "PPEI branding consistent (logo, red accent, dark theme)", 32, "UI/UX & Branding", "Visual Quality", "P1", "passed"),
  t("15.1.3", "Version number displays correctly (v0.03)", 32, "UI/UX & Branding", "Visual Quality", "P1", "passed"),
  t("15.1.4", "Responsive layout — works on tablet and mobile", 32, "UI/UX & Branding", "Visual Quality", "P2", "in_progress"),
  t("15.1.5", "Navigation between all tabs works without errors", 32, "UI/UX & Branding", "Visual Quality", "P1", "passed"),
  t("15.1.6", "404 page displays correctly", 32, "UI/UX & Branding", "Visual Quality", "P2", "passed"),
  t("15.1.7", "Error boundary catches errors gracefully", 32, "UI/UX & Branding", "Visual Quality", "P2", "passed"),
  t("15.1.8", "Loading states display correctly", 32, "UI/UX & Branding", "Visual Quality", "P2", "passed"),
  t("15.1.9", "Empty states display correctly", 32, "UI/UX & Branding", "Visual Quality", "P2", "passed"),

  t("15.2.1", "What's New panel shows on login", 32, "UI/UX & Branding", "What's New & Onboarding", "P2", "passed"),
  t("15.2.2", "What's New panel is dismissible", 32, "UI/UX & Branding", "What's New & Onboarding", "P2", "passed"),
  t("15.2.3", "What's New manager tracks versions", 32, "UI/UX & Branding", "What's New & Onboarding", "P2", "passed"),

  t("15.3.1", "Real-time session sharing works", 32, "UI/UX & Branding", "Collaboration & Remote Support", "P3", "in_progress"),
  t("15.3.2", "Session recording works", 32, "UI/UX & Branding", "Collaboration & Remote Support", "P3", "in_progress"),
  t("15.3.3", "Support join page loads for remote assistance", 32, "UI/UX & Branding", "Collaboration & Remote Support", "P2", "passed"),
  t("15.3.4", "Debug report button generates shareable report", 32, "UI/UX & Branding", "Collaboration & Remote Support", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 33. KNOWLEDGE BASE & REFERENCE
  // ═══════════════════════════════════════════════════════
  t("16.1", "ECU reference panel loads with correct data per ECU type", 33, "Knowledge Base & Reference", "ECU Reference", "P1", "passed"),
  t("16.2", "Knowledge base returns relevant articles", 33, "Knowledge Base & Reference", "ECU Reference", "P2", "passed"),

  t("16.3", "Vehicle knowledge base covers all supported platforms", 33, "Knowledge Base & Reference", "Search & Knowledge", "P2", "in_progress"),
  t("16.4", "Service procedures display for common tasks", 33, "Knowledge Base & Reference", "Search & Knowledge", "P3", "in_progress"),
  t("16.5", "Search engine finds content across all modules", 33, "Knowledge Base & Reference", "Search & Knowledge", "P2", "in_progress"),

  // ═══════════════════════════════════════════════════════
  // 34. NOTIFICATIONS & MESSAGING
  // ═══════════════════════════════════════════════════════
  t("17.1", "Notification bell shows unread count", 34, "Notifications & Messaging", "Notifications", "P2", "passed"),
  t("17.2", "Notification dropdown lists recent notifications", 34, "Notifications & Messaging", "Notifications", "P2", "passed"),
  t("17.3", "Notification preferences configurable", 34, "Notifications & Messaging", "Notifications", "P3", "passed"),
  t("17.4", "Admin conversation system works", 34, "Notifications & Messaging", "Notifications", "P2", "passed"),
  t("17.5", "Owner notification (notifyOwner) fires on key events", 34, "Notifications & Messaging", "Notifications", "P2", "passed"),

  // ═══════════════════════════════════════════════════════
  // 35. DATA PERSISTENCE & PROJECTS
  // ═══════════════════════════════════════════════════════
  t("18.1", "Datalog cache saves uploaded data for quick reload", 35, "Data Persistence & Projects", "Persistence", "P2", "passed"),
  t("18.2", "Editor session persistence saves work across page reloads", 35, "Data Persistence & Projects", "Persistence", "P1", "in_progress"),
  t("18.3", "Project system saves and loads user projects", 35, "Data Persistence & Projects", "Persistence", "P2", "passed"),
  t("18.4", "Offset profiles saved per binary/A2L combination", 35, "Data Persistence & Projects", "Persistence", "P2", "passed"),
  t("18.5", "All uploaded files remain confidential (never shared publicly)", 35, "Data Persistence & Projects", "Persistence", "P1", "passed"),
];
