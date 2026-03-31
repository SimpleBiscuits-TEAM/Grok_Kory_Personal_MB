# V-OP Knowledge Base

> **Purpose**: This is the permanent, unlimited knowledge base for the V-OP (Vehicle Optimizer Platform) by PPEI project. All project rules, preferences, vehicle knowledge, diagnostic logic, and business rules are stored here. This file is read at the start of every task to ensure full context is always available.
>
> **Last Updated**: 2026-03-31
>
> **How to use**: Read this file at the start of every task. Add new knowledge items to the appropriate category. Never delete — only append or update.

---

## Table of Contents

1. [Product Identity & Branding](#1-product-identity--branding)
2. [Business Rules & Access Control](#2-business-rules--access-control)
3. [AI / LLM Configuration](#3-ai--llm-configuration)
4. [Diagnostic Logic & Thresholds](#4-diagnostic-logic--thresholds)
5. [Vehicle-Specific Knowledge](#5-vehicle-specific-knowledge)
6. [Datalogger & PID Management](#6-datalogger--pid-management)
7. [Data Log Formats & Parsing](#7-data-log-formats--parsing)
8. [IntelliSpy / CAN Bus](#8-intellispy--can-bus)
9. [Honda Talon Tuner](#9-honda-talon-tuner)
10. [Editor & Tune Files](#10-editor--tune-files)
11. [UI / UX Rules](#11-ui--ux-rules)
12. [Health Reports](#12-health-reports)
13. [Security & Privacy](#13-security--privacy)
14. [Future Roadmap & Feature Ideas](#14-future-roadmap--feature-ideas)
15. [Collaboration & Communication](#15-collaboration--communication)

---

## 1. Product Identity & Branding

### Product Name
- The product is called **V-OP** (Vehicle Optimizer Platform) by **PPEI**
- Full title: "V-OP by PPEI | Vehicle Optimizer"

### Flashing Restrictions & PPEI Exclusivity
- The tool does NOT flash any third-party tunes
- It is a bespoke product built for and by PPEI for the use of PPEI tunes and OEM flashes
- Users may modify some of their own data with this tool
- Only aftermarket calibrations approved and built by PPEI will be flashed by this device
- Datalogger and other features are welcome to the public, but flashing is exclusive to PPEI

### Salesman Assistant Agent
- The salesman assistant agent is named **Jesse**
- Jesse should have talk-to-text functionality
- Jesse should understand customer needs and facilitate one-click transactions with suggestions

---

## 2. Business Rules & Access Control

### Account Deletion Authority
- Only the user themselves or **Kory Willis** have the authority to remove a user's account
- Kory Willis assigns authority for account removal

### Tune File & Layout Deletion
- When a user deletes tune files or layouts from their stored database, they must be **permanently removed** and made inaccessible by anyone under any conditions

### Tune File Sharing
- Allow tuners to share their tune files with other tuners

### Admin Push Notifications
- Allow administrators to send push notifications to all users

### What's New Section
- Display a "What's New" section when a user logs in to inform about updates
- Provide an option for users to disable these messages for future logins

---

## 3. AI / LLM Configuration

### LLM Name
- The LLM is named **Erika**
- Refer to it as "Erika" in all user-facing contexts

### Erika's Learning Mechanism
- Erika learns by studying uploaded binary and a2L files
- Learning is triggered when users upload these files

### Advanced Mode LLM Integration
- Integrate the LLM to enable natural language queries for complex diagnostic questions
- Add a feature to upload and parse a2L calibration files within advanced mode
- Expand the knowledge base with vehicle-specific PID mappings and mode 6 data
- All features available in normal mode must also be available in advanced mode
- Advanced mode serves as the beta development area
- Implement GM-specific extended PIDs (mode 22) for key diesel parameters
- Create user-customizable PID preset feature for datalogging

---

## 4. Diagnostic Logic & Thresholds

### Diagnostic Sensitivity
- Increase diagnostic thresholds by **30%** to reduce sensitivity and avoid overly frequent fault indications

### P0087 Fault Monitoring
- Do NOT monitor for P0087 fault during deceleration
- Do NOT monitor for P0087 if throttle is below 30%

### Boost Pressure Calculation
- Calculate true charge pressure by subtracting barometric pressure or MAP at idle from max boost

### Vehicle Operating Mode for Testing
- Always ensure the vehicle is in **normal** operating mode for testing
- This may be referenced as combustion mode 0 or mode 1 in PID lists
- Operating in other modes (e.g., regeneration) can reduce horsepower by 80+ HP and lead to inaccurate evaluations

### Datalog Analysis Logic
- Recognize that 85psi below threshold is not possible at idle
- Coolant temperature will fluctuate from very low to operating temp during warmup — low temp during warmup is NOT a problem
- Rail pressure deviation: analyze desired vs actual pressure and monitor PCV fluctuations
- Identify potential converter slip by reasoning about commanded TCC pressure and zero slip conditions
- Incorporate "common sense" operation understanding for vehicles

### Measurement Thresholds from WinOLS CSV
- Establish measurement thresholds based on WinOLS CSV data for the corresponding ECU/vehicle type
- Can look at binary file and map from CSV to see thresholds as an option
- Account for potential differences in offsets between uploaded binary and a2L files
- Be able to align binary and a2L for analysis

### LB7 Engine Specific Considerations
- LB7 engines do NOT have a vane position sensor or EGT sensors — do not provide recommendations for these
- LB7 engines with OEM MAP sensors have a limited reading range
- Address "laggy turbo" conditions by identifying when boost builds too slowly for an extended period

---

## 5. Vehicle-Specific Knowledge

### Duramax Transmission Types by Year
- **2001-2019**: Allison transmission
- **2020+**: GM/Allison co-branded 10L1000 transmission

### High-Pressure Fuel Pump by Year
- **2017-2026**: HP4 high-pressure fuel pumps

### Injector Type for L5P
- L5P engines use **solenoid injectors**, NOT piezo injectors

### Vehicle Type Generalization
- All functionalities, tests, and developments should be applicable to **all types of vehicles**, not just diesel

### PID Expansion for Powersports
- Expand PID database to include specific PIDs for Can-Am, BRP, Polaris, and Kawasaki vehicles

### Cummins ECU Flashing & Unlocking
- For 2022-2024 Cummins ECUs with strong locks, install an older 2019-2021 format first to enable flashing
- Goal: crack these ECUs in the future

---

## 6. Datalogger & PID Management

### PID Selection Behavior
- When selecting multiple PIDs, ensure all previously selected PIDs **remain selected**
- Do NOT remove a PID when another is clicked

### Datalogger Modes & PID Organization
- Implement a tiered mode system (level 1, 2, 3) for datalogger advancements
- Users choose their desired level of complexity
- A search function is necessary for organizing and navigating PIDs
- Include network and transmission messages
- PID organization should be clever and intuitive

### Logger PID Support & Vehicle Identification
- Expand logger to support generic PIDs by scraping the internet for PID definitions (e.g., DBC files)
- Implement VIN-based vehicle type determination upon connection

### J1939 & K-line Protocol Support
- The diagnostic tool should support J1939 and K-line protocols for logging and diagnostics

### VIN Handling in Datalogger
- Retrieve VIN number to display publicly and export to CSV
- Improves analyzer logic and reasoning for data display and diagnostic feedback
- Use VIN to ensure accurate diagnostic reporting, avoiding false positives (e.g., EGT errors on vehicles that don't have them)

---

## 7. Data Log Formats & Parsing

### Supported Formats
- **HP Tuners**: "Offset" column + "Engine RPM" / "Mass Airflow" in header, optional units row
- **EFILive**: "Frame"/"Time"/"Flags" with "ECM.RPM"/"ECM.MAF" or "PCM.RPM"/"PCM.MAF" (LB7/LLY) or Cummins "ECM.RPM_F"/"ECM.MAF_CM_F"
- **Banks Power / iDash**: 4-row header (full names, hex PIDs, short names, units), "TIME" first column, data starts row 4
- **EZ Lynk**: Single header row with "Engine RPM (RPM)" or "Boost Pressure (PSI)" + "Injection Pressure"
- **PPEI Datalogger**: "Timestamp (ms)" or "Elapsed (s)" in first row, "SHORTNAME (unit)" format
- **WP8 Binary**: Honda Talon binary format, detected by magic bytes

### Data Log Format Understanding
- The system processes logs from HP Tuners, EFILive, Banks Power, EZ Lynk, and PPEI Datalogger
- Different formats may contain similar information with different naming conventions
- Parser must handle all formats transparently

### Banks iDash 4-Row Header (2024+ L5P)
- Row 0: Full PID names (e.g., "Engine RPM", "Fuel Rail Pressure")
- Row 1: Hex PID codes (e.g., "0x0003", "0x0145")
- Row 2: Short names (e.g., "RPM", "FRP")
- Row 3: Units (e.g., "S", "PSIA", "°F", "LB/M")
- Row 4+: Data rows
- Detection: First column "TIME", second row contains hex codes starting with "0x"
- Some values are invalid sentinels: -1740.6°F, -531.7°F = sensor not connected; 65535 for NOX = not available

---

## 8. IntelliSpy / CAN Bus

### PCAN Bridge Connection
- IntelliSpy and Datalogger should share the same bridge connection
- Both tools must work **simultaneously** side by side once connected
- VOP Bridge Installer: branded Windows installer for customers (no command prompt needed)
- System tray app with auto-start on Windows login

### Peak System Drivers
- PCAN-USB hardware supported
- Also supports Kvaser, SocketCAN (Linux), LAWICEL, ELM327 (limited)

---

## 9. Honda Talon Tuner

### Honda Talon Log File & Fuel Map Handling
- Automatically detect Honda Talon from WP8 binary (0801EB/0801EA + DCT/Alpha-N channels)
- Route to Honda Talon Tuner page with four fuel maps, pro log viewer, and compare tools
- AFR→Lambda conversion in chart traces, channel list, and crosshair tooltips
- Alpha-N mode indicator shows active table set based on cursor position
- Log-to-Map overlay highlights active fuel table cell, colors by Lambda deviation
- 10-step datalog review workflow encoded in Knox knowledge base (shared/knoxKnowledge.ts)

### OCR Image-to-Table
- Cell display precision: use `toFixed(3)` for fuel map values (not toFixed(1))
- RPM axis auto-scaling: detect when LLM returns RPM values divided by 1000 and auto-correct
- MAP axis auto-scaling: similar detection for MAP values
- Do not use confusing "rpmx1000" hints in LLM prompts

---

## 10. Editor & Tune Files

### Editor Tab Organization
- The editor tab should contain both **Editor Lite** and **Editor Pro** functionalities
- Both accessible under the same editor tab

---

## 11. UI / UX Rules

### Dyno Results Graph Display
- Dyno graph should be selectable to pop out to full screen for analysis
- Axis values must fully plot when expanded to show entire line graph of selected PID
- Use multiple axis points if necessary
- Graph should allow zooming in/out and selectable axis values (RPM and time)
- Ensure all data is visible and does not run outside graph boundaries
- Text must be visible — currently hard to read RPM and time

### Right-Click Copy/Paste
- Right-click copy/paste must work across the entire website
- No global context menu prevention or user-select restrictions
- Existing user-select:none is scoped only to drag/resize operations (legitimate)

---

## 12. Health Reports

### Health Report Tone & Style
- Generate comprehensive vehicle health reports that are **friendly and humorous**
- Tone adjusted based on severity of analysis
- Can include darker jokes about the truck, but not excessively
- Include disclaimer: report is from a BETA AI model, contact PPEI for serious concerns
- Include joke about AI being in training and rapidly improving
- Author should be **"Kory (Maybe?)"**
- Include more graphs from datalogs with explanations of what data means
- When evaluating EGT channels, the channel with the **highest EGTs** should always be the main one evaluated
- If an EGT channel is not populated, do NOT show it as a fault unless actually observed

---

## 13. Security & Privacy

### Confidentiality of Uploaded Files
- **Never** share any uploaded files with the public
- All uploaded files are confidential between the user and the AI

### Publicly Uploaded File Storage Duration
- Store publicly uploaded files for approximately **8 hours** to facilitate development and analysis

---

## 14. Future Roadmap & Feature Ideas

### Real-Time Collaboration & Session Recording
- Allow one tuner to grant access to another tuner or customer to observe work in real-time
- Support logging into their analyzer for direct communication (audio and video)
- Support next-level diagnostics and educational courses
- Allow recording sessions and saving them locally

---

## 15. Collaboration & Communication

### (Reserved for future collaboration rules)

---

## Changelog

| Date | Change | Category |
|------|--------|----------|
| 2026-03-31 | Initial export of all Manus knowledge items to repo | All |
