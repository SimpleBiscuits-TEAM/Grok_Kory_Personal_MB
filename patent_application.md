# UNITED STATES PATENT APPLICATION

## CLOSED-LOOP AGENTIC ARTIFICIAL INTELLIGENCE SYSTEM AND APPARATUS FOR AUTONOMOUS VEHICLE ELECTRONIC CONTROL UNIT COMMUNICATION, DIAGNOSTICS, AND REPROGRAMMING

---

**Applicant:** PPEI (Power Performance Enterprises, Inc.)

**Inventor(s):** Kory Willis

**Filing Date:** April 3, 2026

**Attorney Docket No.:** PPEI-2026-001

---

## CROSS-REFERENCE TO RELATED APPLICATIONS

This application claims priority to and the benefit of the filing date of the present disclosure, and no prior applications are referenced at this time.

---

## FIELD OF THE INVENTION

The present invention relates generally to automotive electronic control unit (ECU) communication systems, and more particularly to a closed-loop agentic artificial intelligence platform and companion hardware apparatus that autonomously manages vehicle diagnostics, calibration analysis, ECU reprogramming, and real-time telemetry through adaptive machine learning, multi-protocol CAN bus communication, and encrypted device-bound flash execution.

---

## BACKGROUND OF THE INVENTION

### The State of Automotive ECU Reprogramming

Modern vehicles contain dozens of electronic control units (ECUs) that govern engine operation, transmission behavior, emissions systems, body electronics, and safety functions. These ECUs execute calibration software — collections of lookup tables, constants, and control algorithms — that determine every aspect of vehicle behavior, from fuel injection timing to turbocharger boost pressure to transmission shift points.

The process of reading, analyzing, and reprogramming ECU calibration data has historically required specialized hardware tools costing between $500 and $5,000, proprietary desktop software locked to specific operating systems, and deep expertise in automotive communication protocols such as GMLAN (General Motors Local Area Network), UDS (Unified Diagnostic Services, ISO 14229), KWP2000 (Keyword Protocol 2000, ISO 14230), J1939 (SAE heavy-duty vehicle standard), and K-Line (ISO 9141). Each ECU family — spanning manufacturers such as General Motors, Ford, Cummins, BRP/Can-Am, Polaris, and Kawasaki — uses different CAN arbitration addresses, different security access algorithms, different data transfer sizes, and different flash memory layouts. A technician must manually select the correct protocol, configure the correct addresses, perform the correct security handshake, and manage the correct block transfer sequence for each ECU variant. A single error in this process can render the ECU inoperable, requiring expensive recovery procedures or physical replacement.

### Limitations of Existing Systems

Existing ECU reprogramming tools such as HP Tuners VCM Suite, EFI Live FlashScan, and GDP EZ Lynk operate as static, deterministic systems. They execute pre-programmed flash sequences without adaptation, provide no intelligent analysis of communication failures, and offer no learning capability across sessions. When a flash procedure fails — due to intermittent CAN bus connectivity, incorrect security key computation, ECU timeout, or electrical noise — these tools simply report an error code and halt. The operator must then manually diagnose the failure, adjust parameters, and retry. There is no mechanism for the tool to analyze the failure pattern, adjust its communication strategy, and autonomously recover.

Furthermore, existing tools are tightly coupled to desktop operating systems (typically Windows) and require physical USB connections to proprietary hardware interfaces. They cannot operate wirelessly, cannot stream diagnostic data to multiple simultaneous displays, cannot provide real-time AI-powered analysis of vehicle telemetry, and cannot automatically match and deliver calibration files to hardware devices based on vehicle identification.

No existing system combines: (a) an agentic AI engine that learns from every diagnostic session and adapts its communication strategies; (b) a hardware apparatus that autonomously detects vehicle type, establishes multi-protocol communication, and executes encrypted flash procedures; (c) a cloud platform that manages calibration libraries, device authentication, and over-the-air firmware updates; and (d) a closed-loop feedback architecture where each user interaction expands the system's knowledge base for all subsequent users.

### The Need for an Agentic Approach

The term "agentic" in the context of this invention refers to a system that operates with autonomous agency — it perceives its environment (the vehicle's CAN bus), reasons about the current state (ECU responses, error codes, communication patterns), plans a course of action (flash sequence, retry strategy, recovery procedure), executes that plan (sends CAN frames, manages timing, handles multi-frame transfers), and learns from the outcome (updates its knowledge base, refines its diagnostic models, improves its communication strategies). This is fundamentally different from existing tools that execute static scripts without perception, reasoning, or learning.

---

## SUMMARY OF THE INVENTION

The present invention provides a closed-loop agentic artificial intelligence system and companion hardware apparatus for autonomous vehicle ECU communication, diagnostics, and reprogramming. The system comprises three principal components that operate in concert:

**First**, a cloud-hosted software platform ("V-OP") that includes: (a) an agentic AI diagnostic engine ("Knox") powered by large language models with domain-specific automotive knowledge injection; (b) a real-time CAN bus analysis module ("IntelliSpy") that captures, decodes, and interprets vehicle network traffic; (c) a flash orchestration engine that generates, validates, and executes ECU reprogramming sequences across multiple protocols and ECU families; (d) a calibration editor with AI-assisted map analysis and translation; (e) a datalog analysis engine that processes vehicle telemetry from multiple proprietary formats; and (f) a device management system with token-based authentication and automated calibration file delivery.

**Second**, a hardware apparatus ("VOP 3.0") comprising: (a) an ESP32-S3 system-on-chip with dual-core processor, integrated WiFi and Bluetooth Low Energy, and hardware cryptographic acceleration; (b) a CAN bus transceiver for ISO 11898-1 communication at configurable bus speeds; (c) an external 32MB SPI NOR flash memory for encrypted storage of flash scripts and calibration data; (d) an automotive-grade power regulation circuit for 12V vehicle electrical systems; (e) eFuse-based device identity and encryption key storage; and (f) a custom domain-specific flash scripting language executed in firmware.

**Third**, a companion hardware security bypass module ("VOP Unlock Box") comprising: (a) an inline OBD-II pass-through enclosure; (b) a microcontroller executing autonomous unlock sequences; (c) a CAN transceiver for protocol-layer communication; (d) MOSFET-based voltage manipulation circuitry for hardware-level ECU security bypass; and (e) transparent pass-through operation for non-locked ECU platforms.

The closed-loop nature of the system is achieved through a continuous feedback architecture: every diagnostic session, every flash procedure, every CAN bus capture, and every user interaction generates structured data that is ingested by the Knox AI engine, expanding its knowledge base and refining its diagnostic models. When a new ECU variant is encountered, when a new failure pattern is observed, or when a new communication strategy proves effective, this knowledge propagates to all system instances through the cloud platform. The system thus becomes more capable with each use, exhibiting emergent intelligence that no single user or developer could program explicitly.

---

## BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a system architecture diagram illustrating the four-tier relationships between the cloud platform (100), wireless communication layer (200), VOP 3.0 hardware device (300), and vehicle ECU network (400), including the adaptive learning loop (500).

![FIG. 1 — System Architecture](/home/ubuntu/webdev-static-assets/patent_fig1_system_architecture.png)

**FIG. 2** is a flowchart depicting the closed-loop agentic learning cycle, from user-initiated flash operation through Knox AI analysis, command execution, adaptive retry with progressive backoff, and the learning feedback loop that refines strategies for future operations.

![FIG. 2 — Closed-Loop Agentic Learning System](/home/ubuntu/webdev-static-assets/patent_fig2_closed_loop_learning.png)

**FIG. 3** is a detailed block diagram of the VOP 3.0 hardware apparatus showing the ESP32-S3 dual-core MCU (310), MCP2515/TJA1050 CAN transceiver chain (321/322), AES-256 encrypted flash partition (351), ILI9341 TFT display (341), 4-channel relay module (331), USB-C power management (361), and vehicle 12V input monitoring (365).

![FIG. 3 — VOP 3.0 Hardware Device Architecture](/home/ubuntu/webdev-static-assets/patent_fig3_hardware_device.png)

**FIG. 4** is a sequence diagram illustrating the token-based device authentication and secure calibration file delivery process, showing the interactions between user browser (800), V-OP cloud server (810), VOP 3.0 device (820), and target ECU (830), including secure enclave operations and CAN bus operations.

![FIG. 4 — Token-Based Device Authentication and Secure Delivery](/home/ubuntu/webdev-static-assets/patent_fig4_token_auth.png)

**FIG. 5** is a state machine diagram depicting the complete flash operation lifecycle with adaptive recovery, showing all phases from IDLE through COMPLETE, the TesterPresent keepalive overlay, KEY CYCLE sub-states, block transfer detail, and the adaptive retry mechanism with progressive backoff.

![FIG. 5 — Flash Operation State Machine with Adaptive Recovery](/home/ubuntu/webdev-static-assets/patent_fig5_flash_state_machine.png)

---

## DETAILED DESCRIPTION OF THE INVENTION

The following detailed description sets forth the preferred embodiments of the invention with reference to the accompanying drawings. It will be understood by those skilled in the art that variations and modifications may be made without departing from the spirit and scope of the invention as defined by the appended claims.

### I. System Architecture Overview

The V-OP system operates as a three-tier architecture comprising a cloud-hosted application tier, a hardware communication tier, and a vehicle network tier. The cloud-hosted application tier executes in a web browser on any device (smartphone, tablet, laptop, or desktop) and provides the user interface, AI processing, data storage, and device management functions. The hardware communication tier comprises the VOP 3.0 apparatus, which connects to the vehicle's On-Board Diagnostics (OBD-II) port and establishes bidirectional communication with the vehicle's CAN bus network. The vehicle network tier comprises the ECUs connected to the vehicle's high-speed CAN bus (500 kbps), single-wire CAN bus (33.3 kbps for GMLAN), and any additional communication buses present in the vehicle.

Communication between the cloud application tier and the hardware communication tier occurs over WiFi (IEEE 802.11 b/g/n) or Bluetooth Low Energy (BLE 5.0). The VOP 3.0 apparatus operates as a WiFi access point (SoftAP mode) with simultaneous station connectivity, broadcasting an SSID of the form "VOP3-{device_id}" with WPA2-PSK encryption. The apparatus also advertises itself via mDNS service discovery (service type: _vop._tcp) for automatic detection by client applications. A WebSocket server on port 80 provides full-duplex, real-time data streaming between the apparatus and any number of connected clients (up to 8-10 simultaneous connections).

When the VOP 3.0 apparatus is connected to a WiFi network with internet access, it communicates with the V-OP cloud platform for device authentication, calibration file retrieval, firmware updates, and telemetry upload. When operating without internet connectivity, the apparatus functions autonomously using locally cached calibration files and flash scripts stored in the encrypted external flash memory.

### II. The Knox Agentic AI Engine

#### A. Architecture and Knowledge Injection

The Knox AI engine is the central intelligence of the V-OP system. It is implemented as a server-side orchestration layer that combines a large language model (LLM) with a structured, domain-specific knowledge base. The knowledge base is partitioned into two tiers: a sanitized public tier that is safe for client-side distribution, and a confidential server-only tier that contains proprietary security access algorithms, seed/key constants, and reverse-engineered protocol details.

The Knox knowledge base encompasses the following domains:

1. **OEM Control Strategy Knowledge**: Detailed understanding of diesel and gasoline engine control strategies, including torque path architecture (driver demand → torque request → smoke limiter → injection quantity → injector pulsewidth), boost control PID parameters, engine protection systems, NOx emission models, DPF regeneration state machines, and transmission control logic.

2. **ECU Family Database**: Complete CAN bus configuration for over 50 ECU platforms across 6 manufacturers, including CAN arbitration addresses (TX/RX), security access levels, transfer sizes, bus speeds, and protocol variants (GMLAN, UDS, KWP2000, J1939).

3. **Security Access Algorithms**: Implementations of seed-to-key computation algorithms for each supported ECU family, including AES-128 ECB for GM 5-byte systems, LFSR-based algorithms for Ford ECUs, 32-bit rotate-and-XOR for Cummins, lookup-table algorithms for BRP/Can-Am, and polynomial-based algorithms for Polaris.

4. **Flash Procedure Knowledge**: Complete flash sequence state machines for each ECU family, including session establishment, security handshake, block transfer parameters, routine control sequences, erase commands, verification procedures, and recovery protocols.

5. **Diagnostic Reasoning**: Threshold-based and pattern-based diagnostic logic for identifying common vehicle faults, including fuel system anomalies, turbocharger performance degradation, exhaust aftertreatment issues, transmission behavior patterns, and electrical system faults.

6. **Calibration Map Semantics**: Understanding of calibration map relationships (driver's wish maps, torque-to-injection-quantity maps, smoke limiter maps, start-of-injection maps, rail pressure maps, boost control maps, EGR maps, and DPF regeneration maps) and their effects on vehicle behavior.

#### B. Agentic Reasoning Loop

The Knox engine operates in a continuous perception-reasoning-action loop. When presented with diagnostic data — whether from a live CAN bus capture, an uploaded datalog file, or a user's natural language query — Knox performs the following sequence:

**Perception**: Raw data is parsed, normalized, and structured. CAN frames are decoded using protocol-specific rules (GMLAN service identifiers, UDS service/sub-function codes, J1939 PGN/SPN mappings). Datalog files from multiple proprietary formats (HP Tuners, EFI Live, Banks Power, EZ Lynk, PPEI Datalogger) are unified into a common internal representation.

**Reasoning**: The structured data is combined with the relevant knowledge base context and presented to the LLM as a system prompt injection. The LLM applies its general reasoning capabilities, augmented by the injected domain knowledge, to identify patterns, diagnose faults, recommend actions, and generate explanations. For diagnostic queries, Knox generates a structured PID catalog with recommended capture conditions and test procedures. For flash operations, Knox evaluates pre-flight readiness, identifies potential risks, and recommends mitigation strategies.

**Action**: Based on the reasoning output, Knox generates actionable recommendations: specific PIDs to monitor, specific test conditions to replicate, specific calibration maps to adjust, or specific flash procedures to execute. In the case of flash operations, Knox's recommendations are translated into executable flash plans by the orchestration engine.

**Learning**: The outcome of each action — whether a diagnostic recommendation proved accurate, whether a flash procedure succeeded or failed, whether a communication strategy was effective — is captured and fed back into the knowledge base. Over time, this creates a continuously expanding corpus of automotive intelligence that improves the system's accuracy and capability for all users.

#### C. Multi-Modal Input Processing

Knox accepts input in multiple modalities:

1. **Natural Language**: Users can ask questions in plain English ("What's causing my boost to drop at 3000 RPM?", "Is my fuel pressure normal?", "Why is my DPF regenerating every 100 miles?"). Knox interprets the question in the context of the user's vehicle, uploaded datalogs, and historical diagnostic sessions.

2. **CAN Bus Frames**: Live or recorded CAN frames are decoded, categorized by module (ECM, TCM, BCM, ABS), and analyzed for protocol-level anomalies (unexpected NRC codes, timing violations, missing responses).

3. **Binary Files**: ECU firmware images and calibration files are parsed to extract software part numbers, hardware identifiers, calibration map structures, and security metadata.

4. **A2L Definition Files**: ASAM MCD-2MC (A2L) files are parsed to map memory addresses to human-readable parameter names, units, conversion formulas, and axis definitions, enabling intelligent calibration analysis.

5. **Datalog Files**: Time-series vehicle telemetry from multiple proprietary formats is parsed, normalized, and analyzed for diagnostic patterns.

6. **Voice Input**: Speech-to-text transcription enables hands-free interaction during vehicle testing, with Knox providing voice feedback through the vehicle's audio system when connected via CarPlay or Bluetooth.

### III. The Flash Orchestration Engine

#### A. Flash Plan Generation

The flash orchestration engine generates executable flash plans from container files. A container file is a binary package that encapsulates one or more ECU firmware blocks along with metadata describing the target ECU, CAN bus configuration, security parameters, and block layout. The container format uses the following structure:

| Offset | Size | Content |
|--------|------|---------|
| 0x0000 | 4096 bytes | Reserved padding |
| 0x1000 | 4 bytes | CRC32 checksum (big-endian) of all data from 0x1004 to EOF |
| 0x1004 | 8188 bytes | JSON header (null-terminated ASCII) |
| 0x3000 | Variable | Block data (sequential, optionally LZSS compressed) |

The JSON header contains fields including: CAN arbitration addresses (TX/RX), controller type, transfer size per block, total file size, block count, block structure array (with per-block memory addresses, lengths, routine control data, erase commands, and compression flags), ECU type identifier, hardware part number, and software calibration part numbers.

The orchestration engine parses the container, validates its integrity via CRC32 verification, identifies the target ECU family from the metadata, retrieves the appropriate flash sequence template from its ECU database, and generates a step-by-step flash plan. The flash plan is a sequence of typed commands:

| Command Type | Description |
|-------------|-------------|
| UDS_REQUEST | Send a UDS service request and validate the response |
| SECURITY_ACCESS | Perform the complete seed/key exchange for the target ECU's security algorithm |
| REQUEST_DOWNLOAD | Initiate a block transfer with memory address and length |
| TRANSFER_DATA | Send calibration data in transfer-size chunks with sequence numbering |
| TRANSFER_EXIT | Complete a block transfer |
| ECU_RESET | Command the ECU to perform a hard or soft reset |
| CLEAR_DTC | Clear all stored diagnostic trouble codes |
| USER_ACTION | Prompt the operator for a physical action (key cycle, ignition check) |
| DELAY | Insert a timed pause for ECU processing |

#### B. Adaptive Flash Execution

The flash execution engine implements several adaptive behaviors that distinguish it from static flash tools:

**TesterPresent Keepalive**: During flash operations, the engine maintains the ECU's diagnostic session by periodically transmitting TesterPresent (service 0x3E with suppressPositiveResponse flag 0x80) frames at 2-second intervals. The keepalive is implemented as a background timer that pauses during active UDS request/response exchanges to prevent response frame interference, and resumes immediately after each exchange completes. The keepalive stops during key-off events (when the ECU is powered down) and restarts after key-on with boot wait completion.

**Progressive Retry Backoff**: When a UDS request times out or receives a negative response, the engine retries with progressively increasing delays (1.0s, 1.5s, 2.0s, 2.5s) rather than fixed-interval retries. This accommodates ECUs with variable response times, particularly on bench setups where power supply stability and CAN bus signal integrity may be suboptimal.

**Post-Key-Cycle Session Re-establishment**: After a key cycle event (ignition off, wait, ignition on), the engine automatically re-establishes the programming session and re-performs the security access handshake. This involves: (a) waiting for ECU boot completion; (b) re-entering the programming diagnostic session (service 0x10, sub-function 0x02 for GMLAN or 0x03 for UDS extended); (c) re-requesting the security seed; (d) computing and sending the security key; and (e) restarting the TesterPresent keepalive.

**Response Filter Intelligence**: The engine employs strict response matching to prevent stale CAN frames from being misinterpreted as valid responses. For each UDS request, the response filter accepts only: (a) a positive response matching the exact service ID (request service + 0x40); or (b) a negative response code (0x7F) with the correct service identifier. All non-matching frames are discarded with diagnostic logging. A configurable drain period (150ms) before each request clears residual frames from the CAN receive buffer.

**Unlocked ECU Detection**: For ECUs that have been previously unlocked by hardware security bypass modules, the engine detects the unlocked state by analyzing the security seed response. If the ECU returns a zero seed (all bytes 0x00), the engine recognizes that security access is already granted and skips the key computation. If the ECU returns a non-zero seed but no security key material (pri_key) is available in the container, the engine attempts authentication with a dummy key, which succeeds on ECUs where the security validation has been disabled by an unlock procedure.

#### C. Multi-Protocol Support

The flash orchestration engine supports the following automotive communication protocols:

**GMLAN (General Motors Local Area Network)**: Uses 11-bit CAN arbitration IDs with GM-specific service identifiers. The GMLAN initialization sequence includes DisableNormalMessageTransmission (0x20), TesterPresent (0x3E), ControlDTCSetting (0x1A 0xB0), DiagnosticSessionControl Programming (0x10 0x02), DisableResponseOnEvent (0x28), ReportProgrammingState (0xA2), and ProgrammingMode Enable (0xA5 0x01, 0xA5 0x03). GMLAN uses ReadDataByLocalIdentifier (0x1A) rather than the UDS ReadDataByIdentifier (0x22).

**UDS (Unified Diagnostic Services, ISO 14229)**: Uses standard 11-bit or 29-bit CAN arbitration IDs with ISO-standard service identifiers. Supports DiagnosticSessionControl (0x10), ECUReset (0x11), ClearDiagnosticInformation (0x14), ReadDTCInformation (0x19), ReadDataByIdentifier (0x22), ReadMemoryByAddress (0x23), SecurityAccess (0x27), WriteDataByIdentifier (0x2E), InputOutputControlByIdentifier (0x2F), RoutineControl (0x31), RequestDownload (0x34), TransferData (0x36), and RequestTransferExit (0x37).

**J1939 (SAE Heavy-Duty)**: Uses 29-bit extended CAN arbitration IDs with Parameter Group Number (PGN) and Suspect Parameter Number (SPN) addressing. Primarily used for Cummins CM2350B and CM2450B ECU platforms at 250 kbps bus speed.

**K-Line (ISO 9141)**: Serial communication protocol for older vehicle platforms, supported through the VOP 3.0 apparatus's UART interface.

### IV. The VOP 3.0 Hardware Apparatus

#### A. System-on-Chip and Processing Architecture

The VOP 3.0 apparatus is built around the Espressif ESP32-S3-WROOM-1 system-on-chip module, which integrates a dual-core Xtensa LX7 processor operating at up to 240 MHz, 512 KB SRAM, 16 MB internal flash memory, WiFi 802.11 b/g/n, and Bluetooth 5.0 Low Energy. The dual-core architecture enables simultaneous real-time CAN bus processing on Core 0 and display rendering/network communication on Core 1, with shared data buffers ensuring synchronization between the data engine and display engine.

The apparatus includes an external Winbond 25Q256FVE6 256-Mbit (32 MB) SPI NOR flash memory connected via the ESP32-S3's SPI master interface with DMA (Direct Memory Access) for high-throughput data transfer. This external flash provides storage for encrypted flash scripts, calibration data, firmware update staging, datalog recordings, and wear-leveling metadata, organized into the following partition layout:

| Offset | Size | Partition |
|--------|------|-----------|
| 0x0000000 | 1 MB | Script Index Table |
| 0x0100000 | 15 MB | Encrypted Flash Scripts |
| 0x1000000 | 8 MB | Encrypted Calibration Data |
| 0x1800000 | 4 MB | Firmware Update Staging |
| 0x1C00000 | 3 MB | Datalog Storage |
| 0x1F00000 | 1 MB | Reserved / Wear-leveling Metadata |

The ESP32-S3's internal flash is partitioned for firmware operation:

| Partition | Offset | Size | Purpose |
|-----------|--------|------|---------|
| nvs | 0x9000 | 16 KB | Non-volatile storage (WiFi credentials, device config) |
| otadata | 0xD000 | 8 KB | OTA boot selection data |
| phy_init | 0xF000 | 4 KB | PHY calibration data |
| factory | 0x10000 | 6 MB | Factory firmware partition |
| ota_0 | 0x610000 | 6 MB | OTA update partition A |
| ota_1 | 0xC10000 | 6 MB | OTA update partition B |
| storage | 0x1210000 | ~3 MB | SPIFFS/LittleFS for cached data |

#### B. CAN Bus Interface

The CAN bus interface comprises the ESP32-S3's integrated TWAI (Two-Wire Automotive Interface) controller and an external CAN transceiver (MCP2551 or SN65HVD230). The TWAI controller implements ISO 11898-1 and supports both CAN 2.0A (11-bit arbitration ID) and CAN 2.0B (29-bit extended arbitration ID) frame formats. Hardware acceptance filters are configured per-vehicle to reduce interrupt load and improve processing efficiency. The receive FIFO holds 64 frames and the transmit queue holds 32 frames, with ISR-driven processing using FreeRTOS task notifications for zero-latency frame handling.

The CAN bus connects to the vehicle through an RJ45 connector (HCTL HC-RJ45-SIAS), with CAN-H and CAN-L signals routed through designated RJ45 pins. This non-standard connector choice provides a robust, locking connection suitable for automotive environments while maintaining compatibility with standard Ethernet cabling for bench testing.

#### C. UDS Protocol Stack

The VOP 3.0 firmware implements a complete UDS (Unified Diagnostic Services) protocol stack conforming to ISO 14229, with ISO 15765-2 (CAN Transport Protocol) for segmented message transfer. The stack supports multi-frame messages up to 4,095 bytes per UDS message, with configurable P2 timeout (50 ms default) and P2* extended timeout (5,000 ms). Concurrent session management enables simultaneous diagnostic communication with multiple ECUs on the same CAN bus.

The UDS stack supports the following services: DiagnosticSessionControl (0x10), ECUReset (0x11), ClearDiagnosticInformation (0x14), ReadDTCInformation (0x19), ReadDataByIdentifier (0x22), ReadMemoryByAddress (0x23), SecurityAccess (0x27), WriteDataByIdentifier (0x2E), InputOutputControlByIdentifier (0x2F), RoutineControl (0x31), RequestDownload (0x34), TransferData (0x36), and RequestTransferExit (0x37).

#### D. Wireless Communication Architecture

The VOP 3.0 apparatus supports simultaneous WiFi access point and station operation (ESP-IDF APSTA mode). In access point mode, the apparatus broadcasts a WPA2-PSK protected network for direct device connections. In station mode, the apparatus connects to an existing WiFi network for internet access and cloud platform communication. Both modes operate concurrently, enabling local device control while maintaining cloud connectivity.

The apparatus also implements a BLE GATT (Generic Attribute Profile) server for mobile application pairing and configuration. BLE characteristics expose device information, WiFi configuration, CAN bus status, and firmware version. BLE provides a fallback communication path for environments where WiFi is unavailable, enabling field-side calibration file transfer and flash execution.

An mDNS service advertisement (_vop._tcp) enables automatic device discovery on the local network. A WebSocket server on port 80 provides full-duplex, real-time data streaming to connected clients, supporting up to 8-10 simultaneous connections for multi-display scenarios.

#### E. Power Management

The apparatus accepts 12V automotive power through the OBD-II connector and regulates it to 3.3V for the ESP32-S3 and associated circuitry using a TO-252 packaged voltage regulator (U15). ESD protection diodes (D2, D3, D4 in SOD-123 packages) protect against reverse polarity and transient voltage spikes common in automotive electrical systems. An overcurrent protection fuse (F3) prevents damage from short circuits. A USB-C connector provides an alternative power source and programming interface for development and firmware updates.

#### F. Security Architecture

The VOP 3.0 apparatus implements a multi-layered security architecture:

**eFuse-Based Device Identity**: Each ESP32-S3 chip contains one-time-programmable eFuse blocks that store a unique device identifier derived from the chip's MAC address and wafer fabrication data. This identifier is immutable and serves as the hardware root of trust for device authentication and encryption key derivation.

**Flash Encryption**: All flash scripts and calibration data stored on the external Winbond flash memory are encrypted at rest using AES-256-GCM (Galois/Counter Mode) authenticated encryption. The encryption uses a three-layer key hierarchy:

1. A 256-bit master key burned into eFuse BLOCK_KEY4 during manufacturing, with read-protection and write-protection set (irreversible).
2. A device-unique identifier derived as SHA-256(eFuse BLOCK0 raw data).
3. A per-device encryption key derived via HKDF-SHA256(IKM=master_key, salt=device_id, info="VOP3-FlashCrypt-v1").

This key hierarchy ensures that encrypted data extracted from one device's flash memory is cryptographically useless on any other device. The GCM authentication tag (16 bytes) detects any tampering with the ciphertext or header. Additional Authenticated Data (AAD) binds the blob header fields (magic number, version, flags, script ID, sizes) to the ciphertext, preventing header-swapping attacks.

Each encrypted blob uses a 48-byte header followed by the ciphertext:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | magic | 0x03524356 ("VCR\x03") |
| 4 | 2 | version | Format version (currently 0x0001) |
| 6 | 2 | flags | Content type and properties |
| 8 | 4 | script_id | Unique script identifier |
| 12 | 4 | orig_size | Original plaintext size |
| 16 | 4 | cipher_size | Ciphertext size |
| 20 | 12 | iv | Random AES-GCM nonce (per-blob) |
| 32 | 16 | tag | GCM authentication tag |
| 48 | Variable | ciphertext | Encrypted payload |

**Secure Boot**: Secure Boot v2 is enabled in production, preventing unauthorized firmware from executing on the device. Only firmware signed with the manufacturer's private key can boot.

**JTAG Disable**: The JTAG debug interface is disabled via eFuse in production units, preventing memory extraction through debug ports.

**Tamper Detection**: GCM authentication failures are logged to the NVS (Non-Volatile Storage) partition with tamper count, flash offset, error type, and uptime timestamp. Tamper data survives reboots and can be retrieved for security auditing.

### V. The VOP Unlock Box — Hardware Security Bypass Module

#### A. Purpose and Architecture

The VOP Unlock Box is a companion hardware module designed for ECU platforms with hardened security that cannot be defeated through software-only seed/key computation. The primary target is the GM E41 ECU (Bosch MG1CS111) used in 2017-2023 Chevrolet Silverado and GMC Sierra 2500HD/3500HD trucks with the L5P Duramax diesel engine, which employs GM Global B architecture with CMAC-based authentication requiring hardware-level intervention for programming access.

The Unlock Box uses an OBD-II male-to-female pass-through enclosure and connects inline between the vehicle's OBD-II port and the VOP 3.0 apparatus. When the unlock function is not needed, all 16 OBD-II pins pass through transparently with no signal modification.

#### B. Hardware Components

The Unlock Box PCB (labeled "UNLOCK BOX DEBETA / PPEI") contains:

| Component | Specification | Purpose |
|-----------|--------------|---------|
| IC1 | SOIC microcontroller (PIC/STM8/ATtiny family) | Executes the unlock sequence autonomously |
| IC2 | SOIC CAN transceiver | CAN bus communication during security access |
| T1, T2 | TO-252 MOSFETs | Voltage switching for hardware-level ECU unlock |
| 30R0 | 30 ohm power resistor | Current limiting for the unlock circuit |
| CON1 | Mini-USB connector | Communication link to VOP 3.0 or PC |
| LEDs | Yellow, Red, Blue | Power, activity/error, unlock status |

#### C. Unlock Mechanism

The two MOSFETs (T1, T2) and 30-ohm power resistor implement controlled voltage manipulation on the ECU power or CAN bus lines during the security access sequence. The ECU requires specific voltage timing patterns during the seed/key exchange to grant programming access on locked units. The microcontroller (IC1) orchestrates the precise timing of MOSFET switching while the CAN transceiver (IC2) handles the protocol layer. This hardware-level bypass cannot be replicated in software alone, as it requires physical manipulation of electrical signals that the ECU monitors during the authentication process.

#### D. Integration with VOP 3.0

The VOP 3.0 flash script language supports the Unlock Box through dedicated commands: IS_UNLOCK checks whether the current flash procedure requires the Unlock Box, and FLASH_PATCH applies unlock-specific patches during the flash sequence. The flash procedure script detects whether the Unlock Box is present and adjusts the security access sequence accordingly. If a locked ECU is detected and no Unlock Box is present, the Knox AI engine alerts the user and provides guidance.

### VI. Token-Based Device Authentication and Automated Calibration Delivery

#### A. Device Registration and Authentication

Each VOP 3.0 apparatus is uniquely identified by its eFuse-derived hardware identifier. When a device first connects to the V-OP cloud platform, it undergoes a registration process that binds the hardware identifier to a user account and generates a device-specific authentication token. This token is stored in the device's encrypted NVS partition and presented with every subsequent cloud API request.

The authentication flow operates as follows:

1. The VOP 3.0 apparatus reads its hardware identifier from eFuse BLOCK0.
2. The apparatus connects to the V-OP cloud platform via HTTPS and presents its hardware identifier.
3. The cloud platform verifies the hardware identifier against its device registry and issues a JSON Web Token (JWT) signed with the platform's private key.
4. The apparatus stores the JWT in its encrypted NVS partition.
5. All subsequent API requests include the JWT in the Authorization header.
6. The cloud platform validates the JWT signature and extracts the device identity for request authorization.

#### B. Automated Calibration File Delivery

The V-OP platform implements an automated tune delivery system that matches hardware device requests with the correct calibration file from the PPEI library. When a VOP 3.0 apparatus connects to a vehicle, it performs the following sequence:

1. **Vehicle Identification**: The apparatus sends diagnostic requests to identify the vehicle's VIN (Vehicle Identification Number), ECU part numbers, current software versions, and hardware revision.
2. **Request Submission**: The apparatus submits a calibration request to the cloud platform, including the vehicle identification data, the device's hardware identifier, and the user's account credentials.
3. **Library Matching**: The cloud platform queries the tune library using a multi-criteria matching algorithm that considers vehicle make/model/year, ECU family, ECU part number, current OS version, and hardware revision.
4. **Delivery**: If a matching calibration file is found, the platform generates a presigned S3 URL and delivers it to the apparatus. The apparatus downloads the file directly to its Winbond flash memory, encrypts it with the device-bound key, and prepares it for flash execution.
5. **Audit Logging**: Every delivery event is logged with the device identifier, vehicle VIN, calibration file identifier, timestamp, and delivery status, creating a complete audit trail.

This automated delivery system eliminates the manual file selection process that is error-prone in existing tools, where operators must manually identify the correct calibration file from hundreds of variants that differ only in OS version or hardware revision.

### VII. The VOP Flash Scripting Language

The VOP 3.0 firmware executes flash procedures defined in a custom domain-specific language (DSL) that provides a high-level abstraction over the raw CAN bus communication. Scripts use a jump-table/address-based execution model where addresses are 8-digit hexadecimal values that define execution order and jump targets.

#### A. Address Space Organization

| Address Range | Purpose |
|---------------|---------|
| 00000100-00000FFF | Variables and configuration |
| 00000400-00000FFF | Condition checks (recovery, unlock) |
| 00001000-0000FFFF | Regular flash sequence |
| 10000000-1FFFFFFF | Flash block loop |
| 20000000-2FFFFFFF | Recovery sequence |
| 30000000-3FFFFFFF | Recovery block loop |
| 40000000-4FFFFFFF | Unlock sequence |
| 50000000-5FFFFFFF | Unlock block loop |
| 80000000-FFFFFFFE | Data area (raw hex, full memory dumps) |
| FFFFFFFF | END (script termination) |

#### B. Command Set

The scripting language provides commands for ECU type configuration, CAN address setup, security level selection, protocol selection, CAN frame transmission with response validation, cyclic message management, security seed/key exchange, flash block transfer orchestration, routine control execution, conditional branching (recovery mode, unlock mode), delay insertion, and unconditional jumps. Each command specifies timeout values, failure jump addresses, and retry counts, enabling the script to handle communication failures gracefully without operator intervention.

### VIII. Closed-Loop Learning Architecture — Theory of Operation

#### A. The Feedback Loop

The V-OP system implements a closed-loop learning architecture that continuously improves its capabilities through structured feedback from every system interaction. This architecture is fundamentally different from traditional automotive tools that operate as open-loop systems — they execute pre-programmed sequences and report results, but never modify their behavior based on outcomes.

The closed-loop operates through four phases:

**Phase 1 — Data Ingestion**: Every interaction with the system generates structured data. CAN bus captures produce frame-level logs with timestamps, arbitration IDs, data payloads, and protocol-decoded interpretations. Flash procedures produce step-by-step execution logs with command types, ECU responses, timing measurements, retry counts, and success/failure outcomes. Diagnostic sessions produce symptom descriptions, PID measurements, threshold evaluations, and diagnostic conclusions. Calibration editing sessions produce map modification histories, parameter relationships, and tuning outcomes.

**Phase 2 — Knowledge Synthesis**: The ingested data is processed by the Knox AI engine to extract generalizable knowledge. For example: if a particular ECU variant consistently requires 3 seconds of settle time after power-on before responding to diagnostic requests, this timing parameter is extracted and added to the ECU database. If a particular seed/key algorithm produces incorrect keys for a specific hardware revision, the algorithm parameters are updated. If a particular diagnostic pattern (e.g., elevated exhaust gas temperatures combined with reduced boost pressure) consistently correlates with a specific fault (e.g., turbocharger vane actuator failure), this correlation is added to the diagnostic reasoning model.

**Phase 3 — Adaptive Behavior Modification**: The synthesized knowledge modifies the system's behavior for future interactions. Flash plans are generated with ECU-specific timing parameters learned from previous sessions. Diagnostic analyses incorporate fault correlations learned from the aggregate of all user sessions. Communication strategies (retry counts, timeout values, backoff intervals) are optimized based on measured success rates across the installed base.

**Phase 4 — Propagation**: Knowledge synthesized from any single user's interaction is propagated to all system instances through the cloud platform. When one user encounters a new ECU variant, the system's handling of that variant improves for all users. When one user's diagnostic session reveals a new fault pattern, all users benefit from improved diagnostic accuracy for that pattern. This creates a network effect where the system's value increases with each additional user, as each user contributes to the collective knowledge base.

#### B. Emergent Intelligence

The closed-loop architecture produces emergent intelligence — system capabilities that were not explicitly programmed but arise from the accumulation and synthesis of operational data. Examples include:

1. **Adaptive Communication Timing**: The system learns optimal timing parameters for each ECU variant, CAN bus configuration, and operating condition. A bench-mounted ECU with a bench power supply may require different timing than the same ECU installed in a vehicle with a battery. The system learns these differences from operational data and adjusts automatically.

2. **Predictive Fault Diagnosis**: As the system accumulates diagnostic data from thousands of vehicles, it identifies statistical correlations between parameter patterns and fault outcomes that no individual technician could observe. These correlations enable predictive diagnosis — identifying emerging faults before they cause symptoms.

3. **Cross-Platform Knowledge Transfer**: Knowledge gained from one ECU platform can inform the handling of related platforms. For example, timing parameters learned for the GM E88 ECU (which shares the GMLAN protocol with the E90, E92, and E98) can be applied as initial estimates for those related platforms, accelerating the learning process.

4. **Failure Recovery Strategies**: The system learns which recovery strategies are effective for different failure modes. If a flash procedure fails at a specific step, the system can recommend the recovery strategy that has the highest success rate based on historical data from similar failures.

### IX. Multi-Display Wireless Streaming Architecture

The VOP 3.0 apparatus functions as a wireless data hub, broadcasting live CAN bus data over WiFi to any number of connected display devices. This architecture replaces traditional wired gauge pods, aftermarket gauge clusters, and proprietary dyno display systems with a single wireless solution.

The apparatus supports multiple simultaneous display modes:

| Display Target | Method | Resolution | FPS |
|---------------|--------|-----------|-----|
| Smartphone | WiFi WebSocket + native app | Phone native | 30-60 |
| Tablet | WiFi WebSocket + browser | Any | 30-60 |
| Car head unit | Phone mirror via CarPlay/AirPlay | Car screen native | 60 |
| Shop TV/monitor | WiFi WebSocket + browser | Any | 15-30 |
| Built-in TFT (optional) | SPI DMA + LVGL | 320x240-480x320 | 60 |
| HDMI monitor (optional) | I2C bridge + CH7035B | Up to 1080p | 30-60 |

Each connected client independently selects its own display view (gauge cluster, datalog chart, diagnostic readout, flash progress), and toggling one client's view does not affect other clients. The dual-core ESP32-S3 architecture enables simultaneous CAN data processing on Core 0 and multi-output rendering on Core 1, with both cores reading from a shared DataBuffer that ensures all outputs remain synchronized.

### X. GMLAN DIC (Driver Information Center) Integration

The VOP 3.0 apparatus can inject custom text and data onto the vehicle's factory instrument cluster display through the GMLAN single-wire CAN bus (33.3 kbps, OBD-II Pin 1). Using 29-bit extended CAN arbitration IDs (0x0180-0x0187), the apparatus controls display attributes, line formatting, icon selection, and text content on the Driver Information Center. This enables real-time gauge display (boost pressure, exhaust gas temperature, oil pressure, transmission temperature) on the factory cluster without any aftermarket gauge installation, as well as flash progress indication ("FLASH 3/12 25%") and Knox AI messages ("KNOX: TUNE COMPLETE") directly on the vehicle's built-in display.

---

## CLAIMS

### Independent Claims — Software Method

**Claim 1.** A computer-implemented method for autonomous vehicle electronic control unit (ECU) communication and reprogramming, comprising:

(a) receiving, at a cloud-hosted software platform, a binary container file comprising ECU firmware data, a JSON metadata header specifying CAN bus arbitration addresses, security access parameters, and block transfer configuration, and a CRC32 integrity checksum;

(b) parsing the container file to identify the target ECU family, extracting the CAN bus configuration, and generating an executable flash plan comprising a sequence of typed commands including session establishment, security access, block transfer, verification, and recovery commands;

(c) establishing a wireless communication link between the cloud-hosted platform and a hardware apparatus connected to the vehicle's OBD-II port, wherein the hardware apparatus provides bidirectional CAN bus access to the vehicle's ECU network;

(d) executing the flash plan by transmitting UDS (Unified Diagnostic Services) and/or GMLAN protocol commands through the hardware apparatus to the target ECU, wherein the execution includes:
   (i) maintaining a background TesterPresent keepalive that pauses during active UDS request/response exchanges and resumes after each exchange completes;
   (ii) applying progressive retry backoff with increasing inter-retry delays upon communication failure;
   (iii) automatically re-establishing the diagnostic session and re-performing security access after key cycle events;
   (iv) employing strict response frame matching that accepts only positive responses matching the exact requested service or negative response codes referencing the requested service;

(e) recording structured execution logs comprising command types, ECU responses, timing measurements, retry counts, and success/failure outcomes; and

(f) feeding the execution logs into an agentic AI engine that synthesizes generalizable knowledge from the logs and propagates the synthesized knowledge to improve future flash plan generation and execution for all system instances.

**Claim 2.** A computer-implemented method for closed-loop agentic vehicle diagnostics, comprising:

(a) receiving, at an agentic AI engine, multi-modal input comprising one or more of: natural language queries, live CAN bus frame captures, binary ECU firmware files, A2L calibration definition files, time-series datalog files from a plurality of proprietary formats, and voice input;

(b) parsing and normalizing the multi-modal input into a structured internal representation, wherein CAN bus frames are decoded using protocol-specific rules for GMLAN, UDS, J1939, and K-Line protocols, and wherein datalog files from HP Tuners, EFI Live, Banks Power, EZ Lynk, and PPEI Datalogger formats are unified into a common representation;

(c) injecting domain-specific automotive knowledge into a large language model, the knowledge comprising OEM control strategy documentation, ECU family databases with CAN bus configurations for a plurality of ECU platforms, security access algorithm implementations, flash procedure state machines, diagnostic reasoning thresholds, and calibration map semantics;

(d) performing an agentic reasoning loop comprising perception of the structured input, reasoning about the current vehicle state using the injected knowledge, generation of actionable recommendations, and execution of the recommendations;

(e) capturing the outcome of each recommendation — including diagnostic accuracy, flash procedure success, and communication strategy effectiveness — as structured feedback data; and

(f) synthesizing the feedback data into updated knowledge that modifies the system's behavior for future interactions and propagating the updated knowledge to all system instances through a cloud platform, thereby creating a closed-loop learning architecture wherein each user interaction expands the system's capabilities for all users.

### Independent Claims — Hardware Apparatus

**Claim 3.** A hardware apparatus for autonomous vehicle ECU communication, comprising:

(a) a system-on-chip comprising a dual-core processor, integrated WiFi and Bluetooth Low Energy transceivers, and hardware cryptographic acceleration;

(b) a CAN bus transceiver connected to the system-on-chip, configured to communicate with vehicle ECUs via an OBD-II connector using ISO 11898-1 at configurable bus speeds, supporting both 11-bit and 29-bit CAN arbitration ID formats;

(c) an external SPI NOR flash memory storing encrypted flash scripts and calibration data, wherein the encryption uses AES-256-GCM authenticated encryption with a per-device key derived from a master key stored in one-time-programmable eFuse memory and a device-unique identifier, such that encrypted data extracted from one apparatus is cryptographically unusable on any other apparatus;

(d) a firmware executing on the system-on-chip, the firmware comprising:
   (i) a multi-protocol vehicle detection module that transmits diagnostic requests across GMLAN, UDS, and OBD-II protocols to identify the connected vehicle's VIN, ECU part numbers, and software versions;
   (ii) a UDS protocol stack conforming to ISO 14229 with ISO 15765-2 transport layer, supporting multi-frame messages up to 4,095 bytes;
   (iii) a flash script execution engine that interprets a domain-specific scripting language with jump-table addressing, conditional branching, and parameterized CAN frame transmission;
   (iv) a WebSocket server providing full-duplex real-time data streaming to a plurality of simultaneously connected client devices;

(e) an automotive-grade power regulation circuit accepting 12V vehicle power and regulating to 3.3V with ESD protection and overcurrent fusing; and

(f) a secure boot mechanism preventing execution of unauthorized firmware, and a disabled JTAG debug interface preventing memory extraction through debug ports.

**Claim 4.** A hardware security bypass module for vehicle ECU platforms with hardened security, comprising:

(a) an OBD-II male-to-female pass-through enclosure providing transparent signal routing for all 16 OBD-II pins when the bypass function is inactive;

(b) a microcontroller executing an autonomous unlock sequence;

(c) a CAN transceiver for protocol-layer communication with the target ECU during the security access procedure;

(d) a MOSFET-based voltage manipulation circuit comprising at least two power MOSFETs and a current-limiting resistor, configured to apply controlled voltage timing patterns to ECU power or CAN bus lines during the seed/key exchange, wherein the voltage timing patterns are required by the ECU to grant programming access on hardware-locked units; and

(e) a communication interface connecting the bypass module to the hardware apparatus of claim 3, enabling coordinated operation wherein the bypass module handles security bypass and the hardware apparatus handles flash programming.

### Independent Claim — Combined System

**Claim 5.** A system for autonomous vehicle ECU diagnostics and reprogramming, comprising:

(a) a cloud-hosted software platform comprising an agentic AI engine with domain-specific automotive knowledge injection, a flash orchestration engine, a calibration editor, a datalog analysis engine, and a device management system with token-based authentication;

(b) a hardware apparatus as recited in claim 3, wirelessly connected to the cloud-hosted platform;

(c) optionally, a hardware security bypass module as recited in claim 4, connected inline between the vehicle's OBD-II port and the hardware apparatus;

(d) a token-based device authentication system wherein each hardware apparatus is uniquely identified by an eFuse-derived hardware identifier, registered with the cloud platform, and issued a signed authentication token stored in the apparatus's encrypted non-volatile storage;

(e) an automated calibration file delivery system that matches hardware device requests with calibration files from a library based on vehicle identification data including VIN, ECU part numbers, current software versions, and hardware revision; and

(f) a closed-loop learning architecture wherein diagnostic sessions, flash procedures, CAN bus captures, and user interactions generate structured data that is ingested by the agentic AI engine, synthesized into generalizable knowledge, used to modify system behavior, and propagated to all system instances through the cloud platform.

### Dependent Claims

**Claim 6.** The method of claim 1, wherein the security access step comprises computing a seed-to-key response using one of: AES-128 ECB encryption for GM 5-byte seed/key systems, LFSR-based computation for Ford ECU systems, 32-bit rotate-and-XOR for Cummins ECU systems, lookup-table matrix computation for BRP/Can-Am systems, or polynomial-based computation for Polaris systems, selected automatically based on the identified ECU family.

**Claim 7.** The method of claim 1, further comprising detecting an unlocked ECU state by analyzing the security seed response, wherein a zero seed indicates security access is already granted, and wherein a non-zero seed with no available key material triggers authentication with a dummy key that succeeds on ECUs where security validation has been disabled by a hardware unlock procedure.

**Claim 8.** The method of claim 2, wherein the agentic AI engine provides voice feedback through the vehicle's audio system when connected via CarPlay or Bluetooth, interpreting live CAN bus data in real-time and providing spoken analysis of vehicle parameters including boost pressure, air-fuel ratio, cylinder balance rates, and coolant temperature trends.

**Claim 9.** The apparatus of claim 3, wherein the external SPI NOR flash memory stores encrypted data in a blob format comprising a 48-byte header with magic number, format version, content type flags, script identifier, original and cipher sizes, a 12-byte random AES-GCM nonce, and a 16-byte GCM authentication tag, followed by the ciphertext, and wherein the header fields are bound to the ciphertext as Additional Authenticated Data preventing header-swapping attacks.

**Claim 10.** The apparatus of claim 3, further comprising a dual-stream firmware architecture wherein a first processor core handles CAN bus reception, transmission, data processing, and BLE communication, and a second processor core handles gauge rendering and multi-output streaming, with both cores reading from a shared data buffer for synchronized operation.

**Claim 11.** The apparatus of claim 3, wherein the firmware implements GMLAN DIC (Driver Information Center) injection by transmitting 29-bit extended CAN frames on a single-wire CAN bus at 33.3 kbps to display custom text, gauge data, flash progress, and AI-generated messages on the vehicle's factory instrument cluster.

**Claim 12.** The system of claim 5, wherein the automated calibration file delivery system generates a presigned URL for the matched calibration file, delivers the URL to the hardware apparatus, and the apparatus downloads the file directly to its external flash memory, encrypts it with the device-bound key, and prepares it for flash execution, with every delivery event logged with device identifier, vehicle VIN, calibration file identifier, timestamp, and delivery status.

**Claim 13.** The system of claim 5, wherein the closed-loop learning architecture produces emergent intelligence including adaptive communication timing learned from operational data across different ECU variants and operating conditions, predictive fault diagnosis from statistical correlations across thousands of diagnostic sessions, cross-platform knowledge transfer between related ECU families sharing common protocols, and failure recovery strategy optimization based on historical success rates.

**Claim 14.** The module of claim 4, wherein the microcontroller orchestrates precise timing of MOSFET switching to apply voltage manipulation patterns that the target ECU monitors during the authentication process, and wherein the bypass module communicates with the hardware apparatus via a USB interface to coordinate the unlock sequence with the flash programming sequence.

**Claim 15.** The method of claim 1, wherein the flash plan generation further comprises a pre-flight validation checklist that verifies container file integrity via CRC32, identifies the target ECU from the metadata, evaluates security profile compatibility, checks for duplicate flash attempts, and assesses hardware readiness before permitting flash execution.

---

## ABSTRACT

A closed-loop agentic artificial intelligence system and companion hardware apparatus for autonomous vehicle electronic control unit (ECU) communication, diagnostics, and reprogramming. The system comprises a cloud-hosted software platform with an agentic AI engine ("Knox") that combines large language model reasoning with domain-specific automotive knowledge injection to perform adaptive diagnostics, flash plan generation, and calibration analysis across multiple ECU families and communication protocols (GMLAN, UDS, J1939, K-Line). A hardware apparatus ("VOP 3.0") built on an ESP32-S3 system-on-chip provides wireless CAN bus access, encrypted flash script storage using AES-256-GCM with per-device keys derived from eFuse-stored master keys, and multi-display wireless streaming. A companion hardware security bypass module ("VOP Unlock Box") provides MOSFET-based voltage manipulation for ECU platforms with hardened security. The system implements a closed-loop learning architecture wherein every diagnostic session, flash procedure, and user interaction generates structured data that is synthesized into generalizable knowledge and propagated to all system instances, creating emergent intelligence that improves with each use. Token-based device authentication and automated calibration file delivery ensure that the hardware apparatus operates exclusively with the authorized software platform.

---

*This patent application has been prepared for review by legal counsel. The specification, claims, and abstract are intended to provide comprehensive disclosure of the invention and should be reviewed and refined by a registered patent attorney before filing with the United States Patent and Trademark Office.*

---

## REFERENCES

[1] ISO 14229-1:2020, "Unified Diagnostic Services (UDS) — Part 1: Application Layer," International Organization for Standardization.

[2] ISO 15765-2:2016, "Road vehicles — Diagnostic communication over Controller Area Network (DoCAN) — Part 2: Transport protocol and network layer services," International Organization for Standardization.

[3] ISO 11898-1:2015, "Road vehicles — Controller area network (CAN) — Part 1: Data link layer and physical signalling," International Organization for Standardization.

[4] SAE J1939-71:2024, "Vehicle Application Layer," SAE International.

[5] NIST SP 800-38D, "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC," National Institute of Standards and Technology, November 2007.

[6] RFC 5869, "HMAC-based Extract-and-Expand Key Derivation Function (HKDF)," Internet Engineering Task Force, May 2010.

[7] Espressif Systems, "ESP32-S3 Technical Reference Manual," Version 1.2, 2024.

[8] U.S. Patent No. 9,483,880 B2, "Automotive ECU Mobile Phone Interface," issued November 1, 2016.

[9] U.S. Patent Application Publication No. 2023/0419743 A1, "Method and System of Vehicle Diagnostics Based on Known Vehicle Conditions," published December 28, 2023.
