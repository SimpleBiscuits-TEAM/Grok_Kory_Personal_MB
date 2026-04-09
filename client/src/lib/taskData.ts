export type Priority = "P1" | "P2" | "P3" | "P4";
export type Status = "not_started" | "in_progress" | "passed" | "failed" | "blocked";
export type Week = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  name: string;
  module: number;
  moduleName: string;
  section: string;
  priority: Priority;
  week: Week;
  status: Status;
}

export interface Module {
  id: number;
  name: string;
  sections: string[];
}

export const modules: Module[] = [
  { id: 1, name: "Core Analyzer Engine", sections: ["File Upload & Parsing", "Data Processing & PID Detection", "Charts & Visualization", "Diagnostics & Fault Detection", "Health Report & PDF Export"] },
  { id: 2, name: "Universal Vehicle Support", sections: ["GM Duramax", "Ford Powerstroke", "Cummins", "BMW / European", "Powersports"] },
  { id: 3, name: "Live Datalogging", sections: ["OBD-II Connection", "J1939 Protocol", "K-Line Protocol", "UDS Services", "Protocol Diagnostics"] },
  { id: 4, name: "Calibration Editor", sections: ["Binary File Loading", "A2L File Loading & Mapping", "Map Display & Editing", "MG1 Binary Alignment", "Tune Compare", "Segment Swapping", "Checksums", "MG1 Unlock Patches", "Binary Export & Download"] },
  { id: 5, name: "Reverse Engineering Pipeline", sections: ["Auto-Definition Generation", "Knox AI Map Search"] },
  { id: 6, name: "Knox AI Assistant", sections: ["Chat Interface", "Voice Commands"] },
  { id: 7, name: "Module Scanner & Vehicle Coding", sections: ["Module Scanner", "Vehicle Coding", "DTC Reading & Clearing"] },
  { id: 8, name: "Drag Racing Platform", sections: ["Profile & Runs", "Leaderboard & Regional Champions", "Challenges & Callouts", "Leagues & Tournaments", "Share Integration"] },
  { id: 9, name: "Fleet Management", sections: ["Organization & Vehicles", "Fleet Monitoring", "Fleet Advanced Features"] },
  { id: 10, name: "Community Forum", sections: ["Forum Structure", "Community Features"] },
  { id: 11, name: "Tune Management", sections: ["Tune Storage & Distribution", "Datalog Comparison"] },
  { id: 12, name: "Can-Am VIN Changer & DESS", sections: ["VIN & DESS Tools"] },
  { id: 13, name: "Authentication & Access Control", sections: ["User Authentication", "Access Control"] },
  { id: 14, name: "Admin Panel (DEV TOOLS)", sections: ["Admin Features"] },
  { id: 15, name: "UI/UX & Branding", sections: ["Visual Quality", "What's New & Onboarding", "Collaboration Features"] },
  { id: 16, name: "ECU Reference & Knowledge Base", sections: ["Reference & Knowledge"] },
  { id: 17, name: "Notifications & Messaging", sections: ["Notifications"] },
  { id: 18, name: "Data Persistence & Projects", sections: ["Persistence"] },
];

function pw(p: Priority): Week {
  if (p === "P1") return 1;
  if (p === "P2") return 2;
  if (p === "P3") return 3;
  return 4;
}

function t(id: string, name: string, module: number, moduleName: string, section: string, priority: Priority): Task {
  return { id, name, module, moduleName, section, priority, week: pw(priority), status: "not_started" };
}

export const defaultTasks: Task[] = [
  // Module 1: Core Analyzer Engine
  // 1.1 File Upload & Parsing
  t("1.1.1", "Upload standard EFILive CSV datalog", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),
  t("1.1.2", "Upload HP Tuners CSV datalog", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),
  t("1.1.3", "Upload WP8 (WinOLS) datalog — WP8 parser", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),
  t("1.1.4", "Upload WinOLS CSV export — column mapping", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),
  t("1.1.5", "Upload DBC-format CAN log — DBC parser", 1, "Core Analyzer Engine", "File Upload & Parsing", "P2"),
  t("1.1.6", "Drag-and-drop upload works", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),
  t("1.1.7", "Upload file > 50 MB — progress indicator", 1, "Core Analyzer Engine", "File Upload & Parsing", "P2"),
  t("1.1.8", "Upload invalid file — graceful error", 1, "Core Analyzer Engine", "File Upload & Parsing", "P2"),
  t("1.1.9", "Upload multiple files sequentially", 1, "Core Analyzer Engine", "File Upload & Parsing", "P2"),
  t("1.1.10", "Subtitle text 'Upload your datalog' readable", 1, "Core Analyzer Engine", "File Upload & Parsing", "P1"),

  // 1.2 Data Processing & PID Detection
  t("1.2.1", "PIDs auto-detected from EFILive column headers", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.2", "PIDs auto-detected from HP Tuners headers", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.3", "PID substitution (MAP for missing boost PID)", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.4", "Boost pressure calculated correctly (MAP minus barometric/idle)", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.5", "Data downsampling for large datasets > 100K rows", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P2"),
  t("1.2.6", "Binned data creation for scatter plots", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P2"),
  t("1.2.7", "Vehicle info extracted from VIN in filename", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.8", "VIN decoded via NHTSA — details populated", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),
  t("1.2.9", "Combustion mode detected (normal vs regen)", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P2"),
  t("1.2.10", "PID selection on graph — multiple PIDs", 1, "Core Analyzer Engine", "Data Processing & PID Detection", "P1"),

  // 1.3 Charts & Visualization
  t("1.3.1", "Dyno HP/TQ chart renders correctly", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.2", "Dyno chart expands to full view", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.3", "Dyno chart clipping works correctly", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.4", "Dyno chart zoom works correctly", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.5", "Dyno chart selectable X-axis", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.6", "Boost efficiency chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.7", "Rail pressure fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.8", "Boost fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.9", "EGT fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.10", "MAF fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.11", "TCC fault chart with gear as third data series", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.12", "VGT fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.13", "Regulator fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.14", "Coolant fault chart renders", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.15", "Chart text readable against dark background", 1, "Core Analyzer Engine", "Charts & Visualization", "P1"),
  t("1.3.16", "Dyno graph disclaimer about tuning setup accuracy", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),
  t("1.3.17", "ZoomableChart component for interactive exploration", 1, "Core Analyzer Engine", "Charts & Visualization", "P2"),

  // 1.4 Diagnostics & Fault Detection
  t("1.4.1", "Diagnostic report generates after upload", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.2", "P0087 fault NOT flagged during decel or throttle < 30%", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.3", "Diagnostic thresholds increased 30% to reduce false positives", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.4", "Coolant temp rising from cold to operating NOT flagged", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.5", "Rail pressure deviation from desired vs actual + PCV", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.6", "Converter slip detection via TCC pressure and zero-slip analysis", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.7", "Converter lockup allows -15/+15 RPM slip range without fault", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.8", "FPR/PCV channel treated as mA (not PWM duty %)", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P2"),
  t("1.4.9", "Unpopulated EGT channels NOT shown as faults", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P1"),
  t("1.4.10", "Fault correlation engine links related faults", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P2"),
  t("1.4.11", "Fault prediction engine provides predictive warnings", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P3"),
  t("1.4.12", "Unified diagnostics aggregates all fault sources", 1, "Core Analyzer Engine", "Diagnostics & Fault Detection", "P2"),

  // 1.5 Health Report & PDF Export
  t("1.5.1", "Health report generates with friendly/humorous tone", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P1"),
  t("1.5.2", "Report tone adjusts based on severity", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P2"),
  t("1.5.3", "Report includes BETA AI disclaimer", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P1"),
  t("1.5.4", "Report author shows 'Kory (Maybe?)'", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P2"),
  t("1.5.5", "Report includes graphs from datalogs with explanations", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P1"),
  t("1.5.6", "PDF export generates downloadable file", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P1"),
  t("1.5.7", "Advanced health PDF export works", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P2"),
  t("1.5.8", "Reasoning engine report generates with AI analysis", 1, "Core Analyzer Engine", "Health Report & PDF Export", "P2"),

  // Module 2: Universal Vehicle Support
  t("2.1.1", "LBZ datalog parses correctly", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.2", "LMM datalog parses correctly", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.3", "LML datalog parses correctly", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.4", "L5P datalog parses correctly", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.5", "L5P ECU reference data loads (extended PIDs, mode 22)", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.6", "Allison transmission detected for 2001-2019 models", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.7", "10L1000 transmission detected for 2020+ models", 2, "Universal Vehicle Support", "GM Duramax", "P1"),
  t("2.1.8", "GM-specific extended PIDs (fuel rail, DEF, DPF soot)", 2, "Universal Vehicle Support", "GM Duramax", "P2"),

  t("2.2.1", "6.7L Powerstroke datalog parses correctly", 2, "Universal Vehicle Support", "Ford Powerstroke", "P2"),
  t("2.2.2", "6.0L/7.3L legacy format support", 2, "Universal Vehicle Support", "Ford Powerstroke", "P3"),

  t("2.3.1", "6.7L Cummins datalog parses correctly", 2, "Universal Vehicle Support", "Cummins", "P2"),
  t("2.3.2", "Cummins parameter database loads with correct PIDs", 2, "Universal Vehicle Support", "Cummins", "P2"),

  t("2.4.1", "BMW diesel datalog parses correctly", 2, "Universal Vehicle Support", "BMW / European", "P3"),

  t("2.5.1", "Can-Am datalog parses with powersports PID database", 2, "Universal Vehicle Support", "Powersports", "P1"),
  t("2.5.2", "Polaris datalog parses correctly", 2, "Universal Vehicle Support", "Powersports", "P2"),
  t("2.5.3", "Kawasaki datalog parses correctly", 2, "Universal Vehicle Support", "Powersports", "P3"),
  t("2.5.4", "Honda Talon detected automatically from log file", 2, "Universal Vehicle Support", "Powersports", "P2"),
  t("2.5.5", "Honda Talon fuel map editor loads (4 separate maps)", 2, "Universal Vehicle Support", "Powersports", "P2"),
  t("2.5.6", "Powersports PIDs database includes BRP/Can-Am specific PIDs", 2, "Universal Vehicle Support", "Powersports", "P1"),

  // Module 3: Live Datalogging
  t("3.1.1", "OBDLink EX device connects via WebSerial/WebUSB", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.2", "Protocol auto-detection identifies vehicle protocol", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.3", "Live data stream displays in real-time gauges", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.4", "Data recording starts/stops cleanly", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.5", "Recorded data exports as CSV to local device", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.6", "Recorded data can be opened directly in analyzer", 3, "Live Datalogging", "OBD-II Connection", "P1"),
  t("3.1.7", "Live chart renders real-time data without lag", 3, "Live Datalogging", "OBD-II Connection", "P2"),
  t("3.1.8", "Modern gauge component displays live values", 3, "Live Datalogging", "OBD-II Connection", "P2"),
  t("3.1.9", "Protocol presets load correct PID sets per vehicle", 3, "Live Datalogging", "OBD-II Connection", "P2"),
  t("3.1.10", "Custom PID preset creation", 3, "Live Datalogging", "OBD-II Connection", "P2"),

  t("3.2.1", "J1939 protocol initializes on CAN bus", 3, "Live Datalogging", "J1939 Protocol", "P1"),
  t("3.2.2", "J1939 PGN decoding works for standard messages", 3, "Live Datalogging", "J1939 Protocol", "P1"),
  t("3.2.3", "J1939 logging panel records data", 3, "Live Datalogging", "J1939 Protocol", "P1"),
  t("3.2.4", "J1939 DTC reading works", 3, "Live Datalogging", "J1939 Protocol", "P2"),
  t("3.2.5", "J1939 CSV export with decoded PGN names", 3, "Live Datalogging", "J1939 Protocol", "P2"),
  t("3.2.6", "J1939 flashing capability (if applicable)", 3, "Live Datalogging", "J1939 Protocol", "P3"),

  t("3.3.1", "K-Line protocol initializes (ISO 9141-2 / ISO 14230)", 3, "Live Datalogging", "K-Line Protocol", "P2"),
  t("3.3.2", "K-Line logging panel records data", 3, "Live Datalogging", "K-Line Protocol", "P2"),
  t("3.3.3", "K-Line data exports correctly", 3, "Live Datalogging", "K-Line Protocol", "P3"),

  t("3.4.1", "UDS transport layer connects to ECU", 3, "Live Datalogging", "UDS Services", "P1"),
  t("3.4.2", "UDS service 0x22 (Read Data By Identifier) works", 3, "Live Datalogging", "UDS Services", "P1"),
  t("3.4.3", "UDS service 0x2E (Write Data By Identifier) works", 3, "Live Datalogging", "UDS Services", "P2"),
  t("3.4.4", "UDS service 0x19 (Read DTC Information) works", 3, "Live Datalogging", "UDS Services", "P1"),
  t("3.4.5", "UDS service 0x14 (Clear DTCs) works", 3, "Live Datalogging", "UDS Services", "P2"),
  t("3.4.6", "UDS service 0x31 (Routine Control) works", 3, "Live Datalogging", "UDS Services", "P3"),
  t("3.4.7", "UDS reference panel shows service descriptions", 3, "Live Datalogging", "UDS Services", "P2"),
  t("3.4.8", "UDS security access (0x27) handshake works", 3, "Live Datalogging", "UDS Services", "P2"),

  t("3.5.1", "Protocol auto-detection UI shows detected protocol", 3, "Live Datalogging", "Protocol Diagnostics", "P1"),
  t("3.5.2", "Protocol selector allows manual override", 3, "Live Datalogging", "Protocol Diagnostics", "P2"),
  t("3.5.3", "Protocol data normalizer converts between formats", 3, "Live Datalogging", "Protocol Diagnostics", "P2"),
  t("3.5.4", "Protocol diagnostics panel shows connection health", 3, "Live Datalogging", "Protocol Diagnostics", "P2"),

  // Module 4: Calibration Editor
  t("4.1.1", "Load GM E38 .bin file", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.2", "Load GM E67 / Bosch EDC17 .bin file", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.3", "Load Bosch MG1 (Can-Am) .bin file", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.4", "Load Polaris MG1 .bin file", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.5", "Load Bosch ME17 .bin file", 4, "Calibration Editor", "Binary File Loading", "P2"),
  t("4.1.6", "Binary file size and header info displayed correctly", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.7", "VIN extracted from binary file", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.8", "Operating system and part numbers extracted", 4, "Calibration Editor", "Binary File Loading", "P1"),
  t("4.1.9", "Hex offset data displayed from binary", 4, "Calibration Editor", "Binary File Loading", "P2"),

  t("4.2.1", "Upload A2L file — parser extracts all characteristics", 4, "Calibration Editor", "A2L File Loading & Mapping", "P1"),
  t("4.2.2", "A2L maps listed in categorized tree", 4, "Calibration Editor", "A2L File Loading & Mapping", "P1"),
  t("4.2.3", "A2L address-to-file-offset alignment computed correctly", 4, "Calibration Editor", "A2L File Loading & Mapping", "P1"),
  t("4.2.4", "Alignment percentage shown (95%+ for good match)", 4, "Calibration Editor", "A2L File Loading & Mapping", "P1"),
  t("4.2.5", "A2L registry stores definitions for reuse", 4, "Calibration Editor", "A2L File Loading & Mapping", "P2"),
  t("4.2.6", "Binary auto-matches to known A2L", 4, "Calibration Editor", "A2L File Loading & Mapping", "P2"),
  t("4.2.7", "A2L stored in database", 4, "Calibration Editor", "A2L File Loading & Mapping", "P2"),

  t("4.3.1", "1D VALUE display works", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.2", "1D CURVE display works", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.3", "2D MAP display works", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.4", "Reference tool works for map comparison", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.5", "Cell editing works in map editor", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.6", "Map search finds maps by name", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.7", "Category tree navigation works", 4, "Calibration Editor", "Map Display & Editing", "P1"),
  t("4.3.8", "Map smoothing algorithms work", 4, "Calibration Editor", "Map Display & Editing", "P2"),
  t("4.3.9", "Hex view tab shows raw hex data", 4, "Calibration Editor", "Map Display & Editing", "P2"),

  t("4.4.1", "MG1 Can-Am binary AirPah values match reference (set 1)", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.2", "MG1 Can-Am binary AirPah values match reference (set 2)", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.3", "DEADBEEF header parsed — flash addresses extracted", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.4", "Alignment engine finds correct base from DEADBEEF candidates", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.5", "Knox autoHealAlignment fixes misaligned maps", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.6", "Alignment shows 'Healed' status after auto-correction", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.7", "Multiple MG1 binaries tested — all align correctly", 4, "Calibration Editor", "MG1 Binary Alignment", "P1"),
  t("4.4.8", "Polaris MG1 binary aligns correctly", 4, "Calibration Editor", "MG1 Binary Alignment", "P2"),
  t("4.4.9", "Offset calibration panel allows manual adjustment", 4, "Calibration Editor", "MG1 Binary Alignment", "P2"),

  t("4.5.1", "Load two binaries for comparison", 4, "Calibration Editor", "Tune Compare", "P1"),
  t("4.5.2", "Diff view shows byte-level differences", 4, "Calibration Editor", "Tune Compare", "P1"),
  t("4.5.3", "File size mismatch warning displayed", 4, "Calibration Editor", "Tune Compare", "P1"),
  t("4.5.4", "Compare engine attempts to make offsets compatible", 4, "Calibration Editor", "Tune Compare", "P2"),
  t("4.5.5", "Side-by-side map comparison view", 4, "Calibration Editor", "Tune Compare", "P1"),

  t("4.6.1", "Upload two binaries for segment comparison", 4, "Calibration Editor", "Segment Swapping", "P1"),
  t("4.6.2", "Part number validation for segment swap", 4, "Calibration Editor", "Segment Swapping", "P1"),
  t("4.6.3", "Identical offsets/OS required for swap", 4, "Calibration Editor", "Segment Swapping", "P1"),
  t("4.6.4", "Warning displayed for incompatible segments", 4, "Calibration Editor", "Segment Swapping", "P1"),
  t("4.6.5", "Download swapped binary file", 4, "Calibration Editor", "Segment Swapping", "P1"),
  t("4.6.6", "Format conversion attempted if formats differ", 4, "Calibration Editor", "Segment Swapping", "P3"),

  t("4.7.1", "Auto-checksum toggle works", 4, "Calibration Editor", "Checksums", "P1"),
  t("4.7.2", "ECU checksum algorithm auto-detected", 4, "Calibration Editor", "Checksums", "P1"),
  t("4.7.3", "Checksum recalculated after map edit", 4, "Calibration Editor", "Checksums", "P1"),
  t("4.7.4", "Checksum validation passes for valid binary", 4, "Calibration Editor", "Checksums", "P1"),
  t("4.7.5", "Checksum validation fails for corrupted binary", 4, "Calibration Editor", "Checksums", "P2"),

  t("4.8.1", "Dynojet unlock patch applies correctly", 4, "Calibration Editor", "MG1 Unlock Patches", "P2"),
  t("4.8.2", "HPTuners unlock patch applies correctly", 4, "Calibration Editor", "MG1 Unlock Patches", "P2"),
  t("4.8.3", "Patched file exports successfully", 4, "Calibration Editor", "MG1 Unlock Patches", "P2"),

  t("4.9.1", "Download modified binary file", 4, "Calibration Editor", "Binary Export & Download", "P1"),
  t("4.9.2", "Export to Dynojet format", 4, "Calibration Editor", "Binary Export & Download", "P2"),
  t("4.9.3", "Export to HPTuners format", 4, "Calibration Editor", "Binary Export & Download", "P2"),
  t("4.9.4", "Binary writer produces valid output", 4, "Calibration Editor", "Binary Export & Download", "P1"),

  // Module 5: Reverse Engineering Pipeline
  t("5.1.1", "Binary definition engine scans unknown binary for maps", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P1"),
  t("5.1.2", "Pattern database matches known ECU signatures", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P1"),
  t("5.1.3", "Map discovery finds 1D, 2D, and 3D structures", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P1"),
  t("5.1.4", "Generated A2L saved to database for reuse", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P2"),
  t("5.1.5", "Reverse engineering panel shows discovery progress", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P2"),
  t("5.1.6", "ME17 template comparison for definition building", 5, "Reverse Engineering Pipeline", "Auto-Definition Generation", "P3"),

  t("5.2.1", "Knox map search finds maps by description", 5, "Reverse Engineering Pipeline", "Knox AI Map Search", "P1"),
  t("5.2.2", "Knox map search finds maps by parameter name", 5, "Reverse Engineering Pipeline", "Knox AI Map Search", "P1"),
  t("5.2.3", "Knox learning engine improves results over time", 5, "Reverse Engineering Pipeline", "Knox AI Map Search", "P3"),
  t("5.2.4", "Knox reasoning feedback loop works", 5, "Reverse Engineering Pipeline", "Knox AI Map Search", "P3"),

  // Module 6: Knox AI Assistant
  t("6.1.1", "Knox chat opens and responds to messages", 6, "Knox AI Assistant", "Chat Interface", "P1"),
  t("6.1.2", "Knox answers diagnostic questions using LLM", 6, "Knox AI Assistant", "Chat Interface", "P1"),
  t("6.1.3", "Knox references uploaded datalog in responses", 6, "Knox AI Assistant", "Chat Interface", "P1"),
  t("6.1.4", "Knox provides map recommendations for tuning", 6, "Knox AI Assistant", "Chat Interface", "P2"),
  t("6.1.5", "Knox Shield prevents harmful/unsafe tuning advice", 6, "Knox AI Assistant", "Chat Interface", "P1"),
  t("6.1.6", "Markdown rendering in Knox responses (Streamdown)", 6, "Knox AI Assistant", "Chat Interface", "P2"),

  t("6.2.1", "Voice command button activates microphone", 6, "Knox AI Assistant", "Voice Commands", "P2"),
  t("6.2.2", "Speech-to-text transcription works", 6, "Knox AI Assistant", "Voice Commands", "P2"),
  t("6.2.3", "Voice command triggers correct action", 6, "Knox AI Assistant", "Voice Commands", "P3"),

  // Module 7: Module Scanner & Vehicle Coding
  t("7.1.1", "Module scanner discovers ECU modules", 7, "Module Scanner & Vehicle Coding", "Module Scanner", "P2"),
  t("7.1.2", "Module scanner displays addresses", 7, "Module Scanner & Vehicle Coding", "Module Scanner", "P2"),
  t("7.1.3", "Module scanner returns part numbers", 7, "Module Scanner & Vehicle Coding", "Module Scanner", "P2"),

  t("7.2.1", "Vehicle coding panel loads", 7, "Module Scanner & Vehicle Coding", "Vehicle Coding", "P3"),
  t("7.2.2", "Write coding to ECU works", 7, "Module Scanner & Vehicle Coding", "Vehicle Coding", "P3"),
  t("7.2.3", "Verify coding after write", 7, "Module Scanner & Vehicle Coding", "Vehicle Coding", "P3"),

  t("7.3.1", "DTC reader displays stored codes", 7, "Module Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1"),
  t("7.3.2", "DTC search by code works", 7, "Module Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1"),
  t("7.3.3", "GM HD DTC database loads", 7, "Module Scanner & Vehicle Coding", "DTC Reading & Clearing", "P1"),
  t("7.3.4", "DTC clear command sent and confirmed", 7, "Module Scanner & Vehicle Coding", "DTC Reading & Clearing", "P2"),
  t("7.3.5", "IntelliSpy real-time DTC monitoring", 7, "Module Scanner & Vehicle Coding", "DTC Reading & Clearing", "P2"),

  // Module 8: Drag Racing Platform
  t("8.1.1", "Create drag racing profile", 8, "Drag Racing Platform", "Profile & Runs", "P1"),
  t("8.1.2", "Submit a run with timeslip data", 8, "Drag Racing Platform", "Profile & Runs", "P1"),
  t("8.1.3", "Timeslip component renders correctly", 8, "Drag Racing Platform", "Profile & Runs", "P1"),
  t("8.1.4", "Drag analyzer processes run data", 8, "Drag Racing Platform", "Profile & Runs", "P1"),
  t("8.1.5", "Best ET/MPH tracked correctly", 8, "Drag Racing Platform", "Profile & Runs", "P1"),
  t("8.1.6", "Summary banner displays correctly", 8, "Drag Racing Platform", "Profile & Runs", "P1"),

  t("8.2.1", "Leaderboard displays ranked by ET", 8, "Drag Racing Platform", "Leaderboard & Regional Champions", "P1"),
  t("8.2.2", "Leaderboard filters work (class, location, time)", 8, "Drag Racing Platform", "Leaderboard & Regional Champions", "P2"),
  t("8.2.3", "Regional badges display on profiles", 8, "Drag Racing Platform", "Leaderboard & Regional Champions", "P2"),
  t("8.2.4", "'Fastest in' badge displays correctly", 8, "Drag Racing Platform", "Leaderboard & Regional Champions", "P2"),

  t("8.3.1", "Create a challenge", 8, "Drag Racing Platform", "Challenges & Callouts", "P2"),
  t("8.3.2", "Challenge notification sent", 8, "Drag Racing Platform", "Challenges & Callouts", "P2"),
  t("8.3.3", "Accept/decline challenge works", 8, "Drag Racing Platform", "Challenges & Callouts", "P2"),
  t("8.3.4", "Callout system works", 8, "Drag Racing Platform", "Challenges & Callouts", "P2"),
  t("8.3.5", "Challenge links shareable via URL", 8, "Drag Racing Platform", "Challenges & Callouts", "P3"),

  t("8.4.1", "Create a league", 8, "Drag Racing Platform", "Leagues & Tournaments", "P2"),
  t("8.4.2", "Join a league", 8, "Drag Racing Platform", "Leagues & Tournaments", "P2"),
  t("8.4.3", "League standings display correctly", 8, "Drag Racing Platform", "Leagues & Tournaments", "P2"),
  t("8.4.4", "Playoff bracket renders", 8, "Drag Racing Platform", "Leagues & Tournaments", "P2"),
  t("8.4.5", "Tournament bracket renders", 8, "Drag Racing Platform", "Leagues & Tournaments", "P2"),
  t("8.4.6", "Wallet and transaction system works", 8, "Drag Racing Platform", "Leagues & Tournaments", "P3"),

  t("8.5.1", "Share timeslip via ShareCard", 8, "Drag Racing Platform", "Share Integration", "P2"),
  t("8.5.2", "Share generates image/link", 8, "Drag Racing Platform", "Share Integration", "P2"),

  // Module 9: Fleet Management
  t("9.1.1", "Create fleet organization", 9, "Fleet Management", "Organization & Vehicles", "P1"),
  t("9.1.2", "Add vehicle to fleet", 9, "Fleet Management", "Organization & Vehicles", "P1"),
  t("9.1.3", "Vehicle details display correctly", 9, "Fleet Management", "Organization & Vehicles", "P1"),
  t("9.1.4", "Fleet members can be invited and managed", 9, "Fleet Management", "Organization & Vehicles", "P2"),
  t("9.1.5", "Summary banner explains module purpose", 9, "Fleet Management", "Organization & Vehicles", "P1"),

  t("9.2.1", "Fleet dashboard shows vehicle overview", 9, "Fleet Management", "Fleet Monitoring", "P1"),
  t("9.2.2", "Trip logging works", 9, "Fleet Management", "Fleet Monitoring", "P2"),
  t("9.2.3", "Fuel log works", 9, "Fleet Management", "Fleet Monitoring", "P2"),
  t("9.2.4", "Fleet events tracked", 9, "Fleet Management", "Fleet Monitoring", "P2"),
  t("9.2.5", "Fleet alerts fire correctly", 9, "Fleet Management", "Fleet Monitoring", "P2"),
  t("9.2.6", "Alert rules configurable per vehicle", 9, "Fleet Management", "Fleet Monitoring", "P3"),

  t("9.3.1", "Remote diagnostic session connects to vehicle", 9, "Fleet Management", "Fleet Advanced Features", "P2"),
  t("9.3.2", "Fleet sensor data displays", 9, "Fleet Management", "Fleet Advanced Features", "P3"),
  t("9.3.3", "Device sync works", 9, "Fleet Management", "Fleet Advanced Features", "P3"),
  t("9.3.4", "AI insights for fleet", 9, "Fleet Management", "Fleet Advanced Features", "P3"),
  t("9.3.5", "Geofence alerts work", 9, "Fleet Management", "Fleet Advanced Features", "P3"),
  t("9.3.6", "Maintenance scheduling and tracking", 9, "Fleet Management", "Fleet Advanced Features", "P2"),
  t("9.3.7", "Fleet access tokens for API integration", 9, "Fleet Management", "Fleet Advanced Features", "P3"),
  t("9.3.8", "Fleet stats share via ShareCard", 9, "Fleet Management", "Fleet Advanced Features", "P2"),

  // Module 10: Community Forum
  t("10.1.1", "Forum categories display", 10, "Community Forum", "Forum Structure", "P1"),
  t("10.1.2", "Forum channels display", 10, "Community Forum", "Forum Structure", "P1"),
  t("10.1.3", "Create a thread", 10, "Community Forum", "Forum Structure", "P1"),
  t("10.1.4", "Reply to a thread", 10, "Community Forum", "Forum Structure", "P1"),
  t("10.1.5", "Like a post", 10, "Community Forum", "Forum Structure", "P2"),
  t("10.1.6", "Thread view shows all posts in order", 10, "Community Forum", "Forum Structure", "P1"),

  t("10.2.1", "Forum membership tracking", 10, "Community Forum", "Community Features", "P2"),
  t("10.2.2", "Share thread via ShareCard", 10, "Community Forum", "Community Features", "P2"),
  t("10.2.3", "Share post via ShareCard", 10, "Community Forum", "Community Features", "P2"),
  t("10.2.4", "Forum search works", 10, "Community Forum", "Community Features", "P2"),

  // Module 11: Tune Management
  t("11.1.1", "Save tune to library", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.2", "Open saved tune from library", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.3", "Save tune to local device", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.4", "Tune library matches vehicle part numbers and OS", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.5", "Tune distribution auto-sends to customer hardware", 11, "Tune Management", "Tune Storage & Distribution", "P2"),
  t("11.1.6", "OS/part number mismatch prevention", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.7", "Only PPEI-approved calibrations can be flashed", 11, "Tune Management", "Tune Storage & Distribution", "P1"),
  t("11.1.8", "Tune file sharing between tuners", 11, "Tune Management", "Tune Storage & Distribution", "P2"),
  t("11.1.9", "Deleted tunes permanently removed and inaccessible", 11, "Tune Management", "Tune Storage & Distribution", "P1"),

  t("11.2.1", "Upload multiple datalogs for side-by-side comparison", 11, "Tune Management", "Datalog Comparison", "P1"),
  t("11.2.2", "Analyzer pairs datalogs under similar conditions", 11, "Tune Management", "Datalog Comparison", "P2"),
  t("11.2.3", "Comparison report shows differences after tune change", 11, "Tune Management", "Datalog Comparison", "P1"),
  t("11.2.4", "Uses existing upload box for comparison files", 11, "Tune Management", "Datalog Comparison", "P2"),

  // Module 12: Can-Am VIN Changer & DESS
  t("12.1", "Can-Am VIN changer loads", 12, "Can-Am VIN Changer & DESS", "VIN & DESS Tools", "P2"),
  t("12.2", "VIN field editable in binary", 12, "Can-Am VIN Changer & DESS", "VIN & DESS Tools", "P2"),
  t("12.3", "DESS key management", 12, "Can-Am VIN Changer & DESS", "VIN & DESS Tools", "P3"),

  // Module 13: Authentication & Access Control
  t("13.1.1", "OAuth sign in works", 13, "Authentication & Access Control", "User Authentication", "P1"),
  t("13.1.2", "Session created after sign in", 13, "Authentication & Access Control", "User Authentication", "P1"),
  t("13.1.3", "Sign out works", 13, "Authentication & Access Control", "User Authentication", "P1"),
  t("13.1.4", "Avatar displays correctly", 13, "Authentication & Access Control", "User Authentication", "P1"),
  t("13.1.5", "Guest sees SIGN IN button", 13, "Authentication & Access Control", "User Authentication", "P1"),
  t("13.1.6", "Protected routes redirect unauthenticated users", 13, "Authentication & Access Control", "User Authentication", "P1"),

  t("13.2.1", "Advanced section requires auth (no legacy passcode)", 13, "Authentication & Access Control", "Access Control", "P1"),
  t("13.2.2", "Admin approval required for advanced access", 13, "Authentication & Access Control", "Access Control", "P1"),
  t("13.2.3", "Admin role can access admin features", 13, "Authentication & Access Control", "Access Control", "P1"),
  t("13.2.4", "Regular user restricted from admin features", 13, "Authentication & Access Control", "Access Control", "P1"),
  t("13.2.5", "Account deletion only by user or Kory Willis", 13, "Authentication & Access Control", "Access Control", "P2"),
  t("13.2.6", "Access rights detection works per user role", 13, "Authentication & Access Control", "Access Control", "P2"),

  // Module 14: Admin Panel (DEV TOOLS)
  t("14.1.1", "DEV TOOLS tab visible only to admin users", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P1"),
  t("14.1.2", "User management panel — view/edit users", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P1"),
  t("14.1.3", "Admin messaging system works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.4", "Push notifications from admin panel", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.5", "Notification preferences panel works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.6", "QA checklist panel works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.7", "Support admin panel works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.8", "Debug dashboard works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.9", "Debug permissions and audit log", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P3"),
  t("14.1.10", "Feedback panel works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P2"),
  t("14.1.11", "PID audit panel works", 14, "Admin Panel (DEV TOOLS)", "Admin Features", "P3"),

  // Module 15: UI/UX & Branding
  t("15.1.1", "All text readable against dark background", 15, "UI/UX & Branding", "Visual Quality", "P1"),
  t("15.1.2", "PPEI branding consistent (logo, red accent, dark theme)", 15, "UI/UX & Branding", "Visual Quality", "P1"),
  t("15.1.3", "Version number displays correctly (v0.03)", 15, "UI/UX & Branding", "Visual Quality", "P1"),
  t("15.1.4", "Responsive layout — works on tablet and mobile", 15, "UI/UX & Branding", "Visual Quality", "P2"),
  t("15.1.5", "Navigation between all tabs works without errors", 15, "UI/UX & Branding", "Visual Quality", "P1"),
  t("15.1.6", "404 page displays correctly", 15, "UI/UX & Branding", "Visual Quality", "P2"),
  t("15.1.7", "Error boundary catches errors gracefully", 15, "UI/UX & Branding", "Visual Quality", "P2"),
  t("15.1.8", "Loading states display correctly", 15, "UI/UX & Branding", "Visual Quality", "P2"),
  t("15.1.9", "Empty states display correctly", 15, "UI/UX & Branding", "Visual Quality", "P2"),

  t("15.2.1", "What's New panel shows on login", 15, "UI/UX & Branding", "What's New & Onboarding", "P2"),
  t("15.2.2", "What's New panel is dismissible", 15, "UI/UX & Branding", "What's New & Onboarding", "P2"),
  t("15.2.3", "What's New manager tracks versions", 15, "UI/UX & Branding", "What's New & Onboarding", "P2"),

  t("15.3.1", "Real-time session sharing works", 15, "UI/UX & Branding", "Collaboration Features", "P3"),
  t("15.3.2", "Session recording works", 15, "UI/UX & Branding", "Collaboration Features", "P3"),
  t("15.3.3", "Support join page loads for remote assistance", 15, "UI/UX & Branding", "Collaboration Features", "P2"),
  t("15.3.4", "Debug report button generates shareable report", 15, "UI/UX & Branding", "Collaboration Features", "P2"),

  // Module 16: ECU Reference & Knowledge Base
  t("16.1", "ECU reference panel loads with correct data per ECU type", 16, "ECU Reference & Knowledge Base", "Reference & Knowledge", "P1"),
  t("16.2", "Knowledge base returns relevant articles", 16, "ECU Reference & Knowledge Base", "Reference & Knowledge", "P2"),
  t("16.3", "Vehicle knowledge base covers all supported platforms", 16, "ECU Reference & Knowledge Base", "Reference & Knowledge", "P2"),
  t("16.4", "Service procedures display for common tasks", 16, "ECU Reference & Knowledge Base", "Reference & Knowledge", "P3"),
  t("16.5", "Search engine finds content across all modules", 16, "ECU Reference & Knowledge Base", "Reference & Knowledge", "P2"),

  // Module 17: Notifications & Messaging
  t("17.1", "Notification bell shows unread count", 17, "Notifications & Messaging", "Notifications", "P2"),
  t("17.2", "Notification dropdown lists recent notifications", 17, "Notifications & Messaging", "Notifications", "P2"),
  t("17.3", "Notification preferences configurable", 17, "Notifications & Messaging", "Notifications", "P3"),
  t("17.4", "Admin conversation system works", 17, "Notifications & Messaging", "Notifications", "P2"),
  t("17.5", "Owner notification (notifyOwner) fires on key events", 17, "Notifications & Messaging", "Notifications", "P2"),

  // Module 18: Data Persistence & Projects
  t("18.1", "Datalog cache saves uploaded data for quick reload", 18, "Data Persistence & Projects", "Persistence", "P2"),
  t("18.2", "Editor session persistence saves work across page reloads", 18, "Data Persistence & Projects", "Persistence", "P1"),
  t("18.3", "Project system saves and loads user projects", 18, "Data Persistence & Projects", "Persistence", "P2"),
  t("18.4", "Offset profiles saved per binary/A2L combination", 18, "Data Persistence & Projects", "Persistence", "P2"),
  t("18.5", "All uploaded files remain confidential (never shared publicly)", 18, "Data Persistence & Projects", "Persistence", "P1"),
];
