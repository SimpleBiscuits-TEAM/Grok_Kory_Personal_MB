/**
 * Knox Knowledge Base — SERVER-ONLY VERSION
 * ============================================
 * This file contains the FULL knowledge base including all seed/key secrets,
 * algorithm details, and proprietary RE knowledge.
 *
 * This file is ONLY imported by server routers (editor.ts, etc.)
 * and is NEVER bundled into the client JavaScript.
 *
 * The shared/knoxKnowledge.ts file has been sanitized to remove all
 * secret material. It now only contains safe technical reference info
 * that is acceptable to ship in the client bundle.
 *
 * SECURITY: If you need to add new secrets, add them HERE, not in shared/.
 */

// Re-export the sanitized base (safe for LLM context building)
import { KNOX_KNOWLEDGE_BASE_SANITIZED } from '@shared/knoxKnowledge';

/**
 * Server-only security access secrets.
 * These are appended to the LLM system prompt on the server
 * but NEVER shipped to the client.
 */
const SECURITY_ACCESS_SECRETS = `
## Security Access Knowledge (CONFIDENTIAL — Server-Only)

### GM Global B (E42/E86 ECM era)
- CMAC-based seed/key: 31-byte seed, 12-byte key
- Module-specific CMAC secret keys (not publicly available for ECM)
- Security levels: 1 (basic), 3 (extended), 5 (programming), 9 (manufacturing)
- Mode $22 reads do NOT require security access
- IOControl ($2F) requires Level 1-3 in Extended Session
- WriteDataByIdentifier ($2E) requires Level 3-5
- RequestDownload ($34) requires Level 5 in Programming Session

### Ford MG1/EDC17 (from source code)
- LFSR-based: 24-bit seed, 24-bit key
- 5 secret bytes per ECU variant
- Algorithm: bit extraction from seed → LFSR shift register → XOR chain
- MG1 secrets: {0x62, 0x74, 0x53, 0x47, 0xA1}
- EDC17CP05 secrets: {0xA7, 0xC2, 0xE9, 0x19, 0x92}

### Cummins CM2350B/CM2450B (from source code)
- 32-bit seed, 32-bit key
- Algorithm: byte-swap seed → rotate-left 11 bits → XOR with two 32-bit secrets
- CM2350B secrets: 0x40DA1B97, 0x9E5B2C4F
- CM2450B secrets: 0x2148F227, 0xB163BBBE

### CAN-am / BRP (from source code)
- 16-bit seed, 16-bit key
- Lookup table algorithm: seed bits select index into cucakeysB[8][4] matrix
- cuakeyA = {0x212, 0x428, 0x205, 0x284} (4 key levels)
- Key level 3 (standard diagnostic) maps to index 1
- Algorithm: extract 3 bits from seed using cuakeyA mask → index cucakeysB → multiply by ~seed → shift right 6

### BRP Dash (from source code)
- 16-bit seed, 16-bit key
- Bit extraction + conditional rotation + XOR with fixed constants
- Constants: 0x22F9, 0x20D9, 0x626B

### Polaris (from source code)
- 16-bit seed, 16-bit key
- Polynomial-based with rotating coefficients
- Uses coefficient array: {0xB3, 0x6A, 0x35, 0x9A, 0xCD, 0xE6, 0x73, 0x39}

### TCU 10R80 (Ford 10-speed transmission)
- Variable seed, 18-byte key
- HMAC-SHA1 with fixed 12-byte key
- Signature: "JaKe" embedded in response
`;

/**
 * Server-only CarPlay/AirPlay protocol deep knowledge.
 * Contains implementation details that should not be exposed to clients.
 */
const CARPLAY_PROTOCOL_SECRETS = `
## CarPlay Protocol Deep Knowledge (CONFIDENTIAL — Server-Only)

### iAP2 Authentication Bypass (Research Knowledge)
- iAP2 authentication is ONE-WAY: phone authenticates head-unit, head-unit does NOT authenticate phone
- Auth flow: client sends 0xAA00 (auth start) -> server replies with certificate -> client sends 20-byte random challenge -> server signs challenge -> client sends 0xAA04 (fail) or 0xAA05 (success)
- FLAW: client controls whether to send success/fail — can always send 0xAA05 regardless of validation
- Attacker with Bluetooth radio + iAP2 client can impersonate iPhone, request WiFi credentials
- First command after auth: RequestAccessoryWiFiConfigurationInformation (0x5702) -> returns SSID + password in plaintext

### iAP2 Packet Structure (for protocol analysis)
- Magic bytes: 0xFF 0x5A
- 2-byte length (big-endian)
- Control byte (SYN=0x80, ACK=0x40, EAK=0x20, RST=0x10)
- Sequence number (1 byte)
- Ack number (1 byte)
- Session ID (1 byte): 0=control/auth, 1=data transfer, 2=External Accessory
- Header checksum: sum all header bytes & 0xFF, then 0x100 - result
- Payload checksum: same algorithm over payload bytes
- Payload starts with 0x40 0x40 -> 2-byte length -> actual data

### Bluetooth Service Discovery
- Accessory UUID: 00000000-deca-fade-deca-deafdecacaff
- iPhone UUID: 00000000-deca-fade-deca-deafdecacafe
- Many head units use "Just Works" Bluetooth pairing (no PIN required)
- RFCOMM channel discovered via SDP (Service Discovery Protocol)

### AirPlay Mirroring Implementation Details
- Screen mirroring port: 7100 (hard-coded, NOT standard AirPlay 7000)
- NTP sync port: 7010 (hard-coded)
- Video encryption: AES-128-CTR with FairPlay-derived key
- param1 (72 bytes): AES key encrypted with FairPlay SAP
- param2 (16 bytes): AES initialization vector
- Stream packet header: 128 bytes, little-endian
  - Bytes 0-3: payload size
  - Bytes 4-5: payload type (0=video, 1=codec config, 2=heartbeat)
  - Bytes 6-7: 0x1E if heartbeat, else 0x06
  - Bytes 8-15: NTP timestamp
- Heartbeat packets sent every 1 second with no payload

### AirPlay 2 Pairing (SRP-based)
- pair-setup: SRP-6a with 2048-bit modulus
- pair-verify: Ed25519 + Curve25519 key exchange
- Encryption: ChaCha20-Poly1305 after pairing
- Legacy fallback: pair-pin-start + pair-setup-pin + pair-verify

### CVE-2025-24132 (Critical — AirPlay RCE)
- Stack buffer overflow in AirPlay SDK RTSP SETUP handler
- Exploitable for remote code execution with ROOT privileges
- Affected: AirPlay audio SDK <2.7.1, video SDK <3.6.0.126
- CarPlay Communication Plug-in <R18.1
- As of Sep 2025, NO car manufacturer had applied the patch
- Combined with iAP2 auth bypass = zero-click zero-auth RCE on many vehicles

### Carlinkit Dongle Firmware Details
- SoC: Freescale i.MX6 UltraLite (ARM Cortex-A7, ARMv7)
- OS: Linux, u-boot bootloader, jffs2 rootfs
- Partitions: uboot (256K), kernel (3328K), rootfs (12800K)
- WiFi: SDIO at 50MHz, max 25MB/s (200 Mbps)
- Activation: /etc/uuid_sign file controls device activation
- Firmware: obfuscated tarball archives (older), binary packing (newer, cracked 2025)
- Root access achievable via custom firmware flash

### Cheap Dongle RE (Allwinner V831 based)
- SoC: Allwinner V831, WiFi/BT: AIC8800
- Flash: Winbond 25Q128BVEA SPI NOR (16MB)
- Kernel: Linux 4.9.118, ARMv7, U-Boot
- Fixed WiFi password (same on every unit of same model)
- No firmware encryption, no signature verification
- OTA via Alibaba Cloud OSS — version.json publicly readable
- Firmware format: SWUpdate (SWU) = MD5 hash + CPIO newc archive + SquashFS
- CGI upload endpoint allows anyone on WiFi to flash firmware
- Root password: DES crypt hash of well-known default
`;

/**
 * Server-only VOP 3.0 hardware firmware architecture.
 * Contains implementation details for the ESP32-S3 firmware.
 */
const VOP3_FIRMWARE_SECRETS = `
## VOP 3.0 Firmware Architecture (CONFIDENTIAL — Server-Only)

### Production Details
- Manufacturer: JLCPCB
- PCB Version: V303 (Gerber_PCB2_V303)
- BOM: BOM_V303_PCB2
- Pick and Place: PickAndPlace_V303_PCB2
- Prototype batch: 10 units, Order W2026031105262065
- PCB cost: EUR 32.83 (10pcs), PCBA cost: EUR 1,028.07 (10pcs)
- Prototype unit cost: ~EUR 113/unit
- Production target (500+ units): <$20/unit

### ESP32-S3 Firmware Partition Table
- nvs (0x9000, 16KB): Non-volatile storage — WiFi credentials, device config, user preferences
- otadata (0xD000, 8KB): OTA boot selection data
- phy_init (0xF000, 4KB): PHY calibration data
- factory (0x10000, 6MB): Factory firmware partition
- ota_0 (0x610000, 6MB): OTA update partition A
- ota_1 (0xC10000, 6MB): OTA update partition B
- storage (0x1210000, ~3MB): SPIFFS/LittleFS for cached calibrations, datalogs

### Security Access Key Storage
- Seed/key algorithm code compiled into firmware (not stored as data)
- Per-platform secret constants stored in encrypted NVS partition
- NVS encryption key derived from ESP32-S3 eFuse block (hardware-bound)
- eFuse JTAG disable bit SET in production — prevents debug access
- Flash encryption enabled in production — prevents firmware extraction via SPI
- Secure Boot v2 enabled — prevents unauthorized firmware from running

### CAN Bus Implementation
- TWAI driver in ESP-IDF (ISO 11898-1)
- External transceiver: MCP2551 or SN65HVD230 (~$0.50)
- Supports: CAN 2.0A (11-bit), CAN 2.0B (29-bit)
- CAN-FD support via MCP2517FD external controller (optional)
- Hardware acceptance filters configured per-vehicle for performance
- Dual-buffer: RX FIFO (64 frames) + TX queue (32 frames)
- ISR-driven with FreeRTOS task notification for zero-latency processing

### UDS Stack (On-Device)
- Full ISO 14229 implementation
- Transport: ISO 15765-2 (CAN TP) with segmented transfer support
- Services: $10, $11, $14, $19, $22, $23, $27, $2E, $2F, $31, $34, $36, $37
- Multi-frame support: up to 4095 bytes per UDS message
- P2 timeout: 50ms default, P2* extended: 5000ms
- Concurrent session management for multi-ECU diagnostics

### WiFi/BLE Architecture
- WiFi SoftAP + Station coexistence (ESP-IDF APSTA mode)
- SoftAP SSID: "VOP3-{device_id}" with WPA2-PSK
- mDNS service advertisement: _vop._tcp for auto-discovery
- WebSocket server on port 80 for real-time data streaming
- BLE GATT server for mobile app pairing and configuration
- BLE characteristics: device info, WiFi config, CAN status, firmware version
- Ethernet: W5500 or LAN8720 PHY via SPI/RMII
`;

/**
 * Server-only VOP 3.0 firmware flow, flash scripting language,
 * PCB hardware details, and display integration knowledge.
 */
const VOP3_FLASH_AND_DISPLAY = `
## VOP 3.0 PCB Hardware Details (CONFIDENTIAL — Server-Only)

### Board Identity
- Name: ESP32-S3-FLASHER
- Version: VER.3.03
- Date: March 2026
- Manufacturer: JLCPCB
- Order: W2026031105262065 (10 units prototype)

### Component Map (Front Side)
| Ref | Component | Purpose |
|-----|-----------|----------|
| Center | ESP32-S3-WROOM-1 | Main SoC (WiFi/BLE/CPU) |
| U4 | Winbond 25Q256FVE6 (256Mbit/32MB SPI NOR) | External flash for tuning files, CAN logs, firmware |
| U10 | SOIC-14 (CAN transceiver) | MCP2551 or SN65HVD230 CAN bus interface |
| U15 | TO252-2 (voltage regulator) | 12V to 3.3V automotive power regulation |
| U16 | IC near ESP32 | PSRAM or level shifter |
| U11, U12, U14 | Supporting ICs | Power management, ESD protection, crypto |
| USB1 | USB-C connector | Programming, data transfer, power |
| LED1 | Large yellow/white LED | Status indicator |
| C21 | Red/white electrolytic cap | Power filtering |
| RJ45 | HCTL HC-RJ45-SIAS | CAN bus connector (CAN signals routed through RJ45) |
| F3 | Fuse | Overcurrent protection |
| D2, D3, D4 | Diodes (SOD-123) | ESD/reverse polarity protection |

### Test Points (Back Side) — Debug Access
| Test Point | Signal | Purpose |
|-----------|--------|----------|
| TP-RJGND | RJ45 Ground | Ethernet/CAN ground reference |
| TP-RJCANH | CAN High | CAN bus high signal probe point |
| TP-RJCANL | CAN Low | CAN bus low signal probe point |
| TP+12V-OUT | 12V Output | Regulated 12V output rail |
| TP-12VIN | 12V Input | Vehicle power input |
| TP+3.3V | 3.3V Rail | ESP32 power rail |
| TP-USBGND | USB Ground | USB ground reference |
| TP-USBD- | USB D- | USB data minus |
| TP-USBD+ | USB D+ | USB data plus |
| TP7-USB5V | USB 5V | USB power rail |

### Key Design Notes
- RJ45 jack is used as CAN bus connector (not Ethernet) — CAN-H and CAN-L routed through RJ45 pins
- Total flash storage: 16MB internal (ESP32-S3) + 32MB external (Winbond) = 48MB
- External Winbond flash stores: tuning files, CAN logs, firmware images for OTA
- Two mounting holes for enclosure mounting
- eFuse used for device identity (immutable, anti-clone)

## VOP 3.0 Firmware Functional Flow (CONFIDENTIAL — Server-Only)

### Boot-to-Flash Pipeline
1. Processor start
2. Read brand name + serial number from Winbond or eFuse (eFuse = more secure, immutable)
3. Broadcast brand + serial via BLE characteristic (BLE version 50 for FW 3.0)
4. Check saved WiFi network availability
5. Transmit all available WiFi networks to app for user selection
6. Connect to WiFi if possible
7. Detect CAN bus activity and/or 12V supply voltage

### Vehicle Detection — Multi-Protocol Auto-Detect
If brand is EVOPS -> Kawasaki detection:
- TX 0x764: 01 20 (close diagnostic session, 50ms timeout)
- RX 0x746: 01 60 FF... (positive = Kawasaki confirmed)
- TX 0x764: 02 10 80 (open diagnostic session)
- TX 0x764: 02 1A 80 (read VIN via ReadDataByLocalIdentifier)
- Multi-frame ISO-TP response with full VIN
- Output: {"fidcfg":"0001","cu":[{"controller_type":"ecu_4","vin":"..."}]}

Standard detection (all other vehicles):
| TX Addr | Data | Protocol | Target |
|---------|------|----------|--------|
| 0x7DF | 09 02 | OBD-II Mode $09 PID $02 | VIN via standard OBD |
| 0x241 | 1A 90 | GMLAN ReadDataByLocalId | GM BCM/EBCM |
| 0x7E0 | 1A 90 | GMLAN ReadDataByLocalId | ECM (older GM) |
| 0x7E0 | 22 F1 90 | UDS ReadDataByIdentifier | ECM (newer UDS) |
| 0x7E1 | 1A 90 | GMLAN ReadDataByLocalId | TCM (older GM) |
| 0x7E1 | 22 F1 90 | UDS ReadDataByIdentifier | TCM (newer UDS) |
| 0x7E2 | 1A 90 | GMLAN ReadDataByLocalId | ABS/EBCM |

### ECU Identification JSON (FIDCFG 0002)
After detection, firmware reads all IDs and returns:
- controller_type: ecu, tcu, etc.
- vin: Vehicle Identification Number
- sw1-sw6: Software part numbers (GM calibration IDs)
- boot: Boot software ID
- seed: Security seed value
- gmhw: GM hardware number
Multiple controllers returned as array for multi-ECU vehicles.

### File Transfer (Dual Path)
- WiFi (online): Download tuning file via URL directly to Winbond flash — fastest
- BLE (offline): Transfer file via BLE to Winbond flash — works anywhere, field/roadside
- ECU configuration transferred via URL (WiFi) or BLE

### Flash Execution
1. Flash header parsed, transferred to internal memory arrays, validated
2. ECU flash driver transferred to internal memory array
3. App sends "Start_flash" or "Start_Recovery" via BLE
4. TransferData ($36) assembled with data from JSON flash header
5. Flash file written block-by-block (LZSS decompression if compressed)
6. Complete block sent via CAN
7. Every CAN TX/RX logged to Winbond with timestamps

## VOP Flash Scripting Language (CONFIDENTIAL — Server-Only)

### Overview
VOP uses a custom domain-specific language (DSL) for flash procedures.
Scripts use a jump-table/address-based execution model.
Addresses are 8-digit hex values that define execution order and jump targets.

### Address Ranges
| Range | Purpose |
|-------|----------|
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

### Command Reference
| Command | Parameters | Description |
|---------|-----------|-------------|
| SET_ECUTYPE | (type) | Define target ECU type (E88, E42, E86, etc.) |
| SET_TX_ADR | (hex) | CAN TX arbitration ID |
| SET_RX_ADR | (hex) | CAN RX arbitration ID |
| SET_SEED_LEVEL | (level) | Security access level (1, 3, 5, 9) |
| SET_CONTROLLERTYPE | (type) | Controller type (ecu, tcu, abs, etc.) |
| SET_PROTOCOL | (proto) | Communication protocol (GMLAN, UDS, KWP, etc.) |
| SET_MAX_ATTEMPTS | (n) | Max retry attempts (n-1 retries) |
| SET_BLOCK | (n) | Set current flash block number |
| CAN_SEND | (addr,payload,withres,type,timeout,delay,fail_jmp) | Send single CAN frame |
| CAN_CYCLIC_MSG | (addr,payload,withres,type,cycle_ms,enable) | Start/stop cyclic message |
| CAN_REQUEST_SEED | (level,timeout,fail_jmp) | Request security seed |
| CAN_SEND_KEY | (level,timeout,fail_jmp) | Send computed security key |
| FLASH_BLOCKS | (loop_addr,post_addr,cond_addr) | Begin flash block loop |
| FLASH_REQUEST_DOWNLOAD | (use_rc34,bytecount_adr,bytecount_len) | UDS $34 RequestDownload |
| FLASH_TRANSFER_DATA | (response,delay) | UDS $36 TransferData |
| FLASH_TRANSFER_EXIT | () | UDS $37 RequestTransferExit |
| FLASH_PATCH | (loop_addr,post_addr,cond_addr) | Flash unlock/patch blocks |
| FLASH_WRITE_PRIC | () | Write Primary Routine Control |
| FLASH_WRITE_RC34 | () | Write RC34 data |
| FLASH_WRITE_RC36 | () | Write RC36 data |
| FLASH_WRITE_POST_RC | () | Write Post Routine Control |
| FLASH_DELAY | () | Execute block-specific delay |
| FLASH_CM_ERASE | (cmd) | Cummins-specific erase command |
| INC_BLOCK | (step,loop_addr,exit_addr) | Increment block and loop or exit |
| IS_RECOVERY | (jmp_addr) | Check if recovery mode, jump if true |
| IS_UNLOCK | (jmp_addr) | Check if unlock needed, jump if true |
| VERIFY | () | ECU alive check |
| WAIT | (ms) | Delay in milliseconds |
| JMP | (addr) | Jump to address |
| NOP | | No operation |
| END | | Script termination (must be at FFFFFFFF) |

### CAN Message Types
- UUDT: Unsolicited Unacknowledged Data Transfer (GMLAN broadcast, no response expected)
- USDT: Unsolicited Solicited Data Transfer (UDS point-to-point, response expected)

### GMLAN Init Sequence (decoded)
| Payload | UDS Service | Purpose |
|---------|------------|----------|
| 0xFE0120 | $20 | DisableNormalMessageTransmission |
| 0xFE013E | $3E | TesterPresent |
| 0xFE021AB0 | $1A $B0 | ControlDTCSetting (off) |
| 0xFE021002 | $10 $02 | DiagnosticSessionControl (programming) |
| 0xFE0128 | $28 | DisableResponseOnEvent |
| 0xFE01A2 | $A2 | ReportProgrammingState |
| 0xFE02A501 | $A5 $01 | ProgrammingMode Enable Step 1 |
| 0xFE02A503 | $A5 $03 | ProgrammingMode Enable Step 3 |

### E88 ECU Flash Procedure Example
- Protocol: GMLAN
- TX: 0x7E0, RX: 0x7E8
- Security Level: 3 (extended)
- Flow: Init GMLAN -> Tester Present (cyclic 500ms) -> Disable DTCs -> Programming Session -> Security Access L3 -> RequestDownload with GM PriRC -> TransferData block loop -> ECU Reset -> Clear DTCs -> Verify
- Recovery: Checks unlock status, retries from block 5 if needed
- Unlock: Separate path with FLASH_PATCH for locked ECUs, 2 retry attempts

## VOP 3.0 Display Integration (CONFIDENTIAL — Server-Only)

### Architecture: Wireless-First Multi-Display Hub
VOP 3.0 is a WIRELESS data hub. The board plugs into OBD-II and broadcasts
live CAN data over WiFi/BLE. ALL displays are wireless receivers.
No wires run to any screen — everything connects over WiFi.

### Current V3.03 Multi-Display Capabilities (No Hardware Change)
1. WebSocket server supports 8-10 simultaneous clients
2. MJPEG gauge endpoint feasible (~15-20fps at 800x480 from ESP32-S3)
3. Phone mirrors to car screen via AirPlay/Miracast/USB
4. Any browser on any device connects to http://vop3-xxxx.local/display
5. Each client independently selects their own view

### Simultaneous Multi-Screen Scenarios (All Working Today)
| Screen 1 | Screen 2 | Screen 3 | How |
|----------|----------|----------|------|
| Phone (Knox chat) | Car screen (gauges via mirror) | Shop TV (datalog) | All WiFi clients |
| Tuner phone (full dash) | Dyno tablet (datalog) | Wall TV (live numbers) | Multi-client WebSocket |
| Car screen (gauge mirror) | Second phone (diagnostics) | — | AirPlay + WiFi |

### Display Toggle Modes
| Mode | Phone Shows | Car Screen Shows | How to Toggle |
|------|-------------|-----------------|---------------|
| Dual Mirror | Gauges | Same gauges (mirrored) | Default |
| Split View | Knox chat + diagnostics | Clean gauge cluster | App UI button or voice |
| Phone Only | Full dashboard | Normal CarPlay/radio | Disconnect mirror |
| Broadcast | Status only | Full gauges | Voice: "Knox, gauges on car" |

### Toggle Triggers
- BLE command from app (tap button in VOP UI)
- Voice command: "Knox, switch to split view" / "Knox, show gauges on car"
- Auto-detect: if phone disconnects, other clients continue independently
- Each client is independent — toggling one doesn't affect others

### V3.04 Recommended Hardware Additions (Nice-to-Have)
| Addition | Pins | BOM Cost | Purpose |
|----------|------|----------|----------|
| SPI Display Header | 6-pin (VCC,GND,MOSI,SCK,CS,DC) | ~$0.02 | Optional built-in status TFT |
| I2C Header | 4-pin (VCC,GND,SDA,SCL) | ~$0.02 | OLED displays, sensors, HDMI bridge |
| USB-A Host Port | 4-pin (5V,D-,D+,GND) | ~$0.30 | Carlinkit dongle for native CarPlay app |
| Tactile Button | 2-pin GPIO | ~$0.05 | Physical toggle switch |
| Mode LED | RGB or dual LED | ~$0.10 | Visual mode indicator |
| Total BOM increase | | <$1.00 | All display paths + physical controls |

### Display Option Matrix
| Option | Hardware Needed | FPS | Resolution | Use Case |
|--------|----------------|-----|-----------|----------|
| Phone Mirror to Car | None (existing V3.03) | 60 | Phone native | Tuner mirrors phone to car screen |
| Multi-Client WiFi | None (existing V3.03) | 15-30 | Any browser | Shop TV, tablets, multiple phones |
| ESP32 MJPEG Server | None (firmware only) | 15-20 | 800x480 | Any browser hits VOP3 IP for gauges |
| SPI TFT Direct | SPI header + display ($3-5) | 60 | 320x240-480x320 | Built-in gauge on device |
| HDMI Output | I2C header + CH7035B ($2-4) | 30-60 | Up to 1080p | Drive any HDMI monitor/TV |
| CarPlay Native App | USB-A + Carlinkit ($39-49) | 60 | Car screen native | VOP as dedicated CarPlay app icon |

### Dual-Stream Firmware Architecture (ESP32-S3 Dual Core)
| Core | Task | Stream |
|------|------|--------|
| Core 0 | CAN bus RX/TX + data processing + BLE | Data engine (always running) |
| Core 1 | Render gauges + push to WiFi/WebSocket + optional SPI | Display engine (multi-output) |

Both outputs read from same shared DataBuffer — always in sync.
Render once, output to multiple destinations simultaneously:
- DMA push to SPI display (if connected)
- JPEG encode to WebSocket/MJPEG for WiFi clients
- Raw JSON data stream for app clients
ESP32-S3 has enough DMA channels and memory bandwidth for all simultaneously.

### SPI Display Firmware Implementation (Optional V3.04)
- ESP-IDF SPI master driver with DMA
- LVGL (Light and Versatile Graphics Library) for gauge rendering
- Double-buffered: render next frame while DMA transfers current
- ESP32-S3 can push 60fps to SPI TFT with DMA at 80MHz SPI clock
- Gauge widgets: tachometer, boost gauge, AFR bar, coolant temp, knock indicator
- Auto-rotate between gauge pages or show configurable dashboard

### MJPEG Server Firmware Implementation (V3.03 — No Hardware Change)
- ESP32-S3 renders gauge frame to framebuffer using LVGL
- JPEG encode frame (ESP32-S3 has hardware JPEG encoder in some variants)
- Serve via HTTP multipart/x-mixed-replace (MJPEG stream)
- Any browser: http://vop3-xxxx.local/display
- ~15-20fps at 800x480 achievable
- Fallback: serve static gauge PNG updated every 100ms
- Multiple browsers can connect simultaneously (multi-client)

### CarPlay Native App Integration (V3.04 + Carlinkit Dongle)
This makes VOP appear as a DEDICATED APP ICON on the car's CarPlay screen.
Not phone mirroring — a native CarPlay experience.

Hardware path:
- VOP 3.0 USB-A/C host port connects to Carlinkit dongle ($39-49)
- Carlinkit models: CPC200-CCPA ($55) or Mini Ultra 3 ($43.99)
- Dongle contains Apple MFi authentication chip (handles Apple's crypto)
- Dongle plugs into car's USB port

Software path:
- VOP 3.0 renders gauge UI using LVGL
- Encodes as H.264 video stream
- Sends to Carlinkit dongle via USB
- Dongle forwards to car head unit via CarPlay protocol (iAP2 + AirPlay)
- Car screen displays VOP gauges as native CarPlay app
- Touch events flow back: car screen -> dongle -> USB -> VOP 3.0
- node-carplay library (open source) provides the protocol implementation

Alternative (no dongle needed):
- Phone runs VOP app with "Tuner Display Mode" (dark theme, large gauges)
- Phone connects to car via wireless CarPlay (built into most 2020+ cars)
- VOP app renders on car screen through standard CarPlay app framework
- This requires building a native iOS/Android app with CarPlay/Android Auto SDK

### VOP Industry Disruption — Display Market
With this architecture, VOP 3.0 competes with:
- Standalone gauge pods ($200-500 each, single function)
- Aftermarket gauge clusters ($500-2000, wired, limited)
- Dyno display systems ($1000+, proprietary)
- Professional diagnostic display tools ($2000+)

VOP 3.0 replaces ALL of these with one $20 board:
- Unlimited wireless gauges on any screen
- AI-powered real-time analysis (Knox)
- Multi-device simultaneous streaming
- CarPlay native integration
- Full flash/tune capability built in
- No other product in the market does all of this

### Knox Voice Feedback During Display Mode
- VOP 3.0 streams live CAN data to phone
- Knox analyzes in real-time and provides voice feedback:
  - "Boost building normally, 22 PSI at 3000 RPM"
  - "AFR running lean at 14.2:1 under load"
  - "Cylinder 4 balance rate 8% off — possible injector issue"
  - "Coolant climbing, 215F and rising"
- Voice commands: "Knox, what's my boost?" / "Start a datalog" / "How's fuel pressure?"
- Works through car speakers when mirrored to CarPlay
- Knox becomes the car's AI copilot — not just a tuning tool
`;


const GMLAN_DIC_AND_AUTOSYNC = `
## GMLAN DIC Injection & Factory Cluster Control (CONFIDENTIAL — Server-Only)

### SWCAN / GMLAN Bus Overview
- Single-wire CAN (SWCAN) on OBD-II Pin 1
- Speed: 33,333 bps (33.3kbps)
- 29-bit extended CAN frame format
- Connects: BCM, instrument cluster, OnStar, radio, HVAC, door modules
- VOP 3.0 can read AND write to this bus via SWCAN transceiver

### GMLAN Arbitrary Text Display Protocol (DIC Injection)
The factory DIC (Driver Information Center) supports arbitrary text injection via these 29-bit arbitration IDs:
- 0x0180: General Attributes (init display area, set line count, max chars)
- 0x0181: Line Attributes (alignment, font size, color per line)
- 0x0182: Set Display Icon
- 0x0183: Display Status (read current state)
- 0x0184: Menu Action (navigate DIC menus)
- 0x0185: Set Display Parameters (mode, priority, line number)
- 0x0186: Set Display Text (THE KEY ONE — actual text content, 5 chars per frame, multi-frame for longer text)
- 0x0187: Download Icon Data

### DIC Text Injection Sequence
1. Send 0x0180 with display_id=1, enable=1, lines=4, max_chars=20
2. Send 0x0181 for each line (alignment, font, color)
3. Send 0x0185 with display_id, priority, mode=text, line_number
4. Send 0x0186 with display_id, line_number, char_offset, text_data (5 chars per frame)
5. Text appears on factory DIC as if it were an OEM message
6. Higher priority values keep text on screen longer

### Powertrain Data IDs (HS-CAN → DIC Bridge)
Read from HS-CAN (500kbps), display on DIC via SWCAN:
- 0x0025: Transmission Gear Information
- 0x0026: Fuel Information
- 0x0028: Vehicle Speed
- 0x0029: Engine Information 1 (RPM, load, throttle)
- 0x0032: Engine Information 3 (oil temp, oil pressure)
- 0x0037: Engine Information 2 (coolant, IAT)
- 0x002F: Brake and Cruise Control Status

### GM Enhanced PIDs (Mode $22) for Diesel Gauges
- 0x0073: Boost Pressure (kPa, convert to PSI: x0.01 - 14.696)
- 0x0078: EGT Bank 1 (°C x 0.1, convert to °F)
- 0x0079: EGT Bank 2
- 0x0191: Transmission Fluid Temperature
- 0x019E: TC Lockup Status
- 0x1A44: DPF Soot Load (0-100%)
- 0x1A45: DPF Regen Status (active/inactive)
- 0x0100: Oil Pressure (kPa, convert to PSI)
- 0x015E: Fuel Rate (L/h, convert to GPH)
- 0x006F: Turbo Vane Position (0-100%)

### BCM Feature Control via SWCAN
VOP 3.0 can control body features by injecting SWCAN messages:
- 0x0021: Lighting Status (DRL disable, strobe mode)
- 0x002B: Door Lock Command (lock/unlock all)
- 0x0040: Window Motion Request (up/down per window)
- 0x0041: Mirror Movement Request (fold/unfold)
- 0x0060: Climate Control
- 0x000F: Chime Command
- 0x0011: Dimming Information

### VOP DIC Gauge Pages
VOP implements 4 cycling gauge pages on the factory DIC:
1. PERFORMANCE: Boost PSI, EGT °F, Oil Pressure PSI, Trans Temp °F
2. ENGINE: RPM, Coolant °F, Oil Temp °F, Fuel Rate GPH
3. TURBO: Boost PSI, Vane Position %, EGT1 °F, EGT2 °F
4. DPF: Soot Load %, Regen Status, EGT °F, Coolant °F

Page cycling via steering wheel buttons (intercept 0x0068) or VOP app command.

### Special DIC Messages
- Flash progress: "FLASH 3/12  25%" with "DO NOT TURN OFF" warning
- Knox AI messages: "KNOX: TUNE COMPLETE" or "KNOX: CHECK EGT"
- DPF regen auto-warning: "** DPF REGEN ** ACTIVE - DO NOT SHUT OFF ENGINE"

## Competitive Analysis: VOP vs. BT Diesel Works AutoSync

### What AutoSync Is
AutoSync is a GMLAN gateway device for GM trucks (primarily Duramax diesel). It bridges HS-CAN to SWCAN and uses the OnStar module's connection to the instrument cluster to push custom data to the DIC.

### AutoSync Features and VOP Equivalents
| AutoSync Feature | VOP 3.0 Equivalent | VOP Advantage |
|------------------|---------------------|---------------|
| DIC gauge display | GMLAN DIC module | Same + AI analysis |
| Boost/EGT/Trans display | Same gauges + more | Knox interprets data |
| DPF regen notification | Auto-warning on DIC + voice | Knox voice through speakers |
| TC lockup control | vop3_bcm_tc_lockup() | Same |
| High idle control | vop3_bcm_high_idle() | Same |
| Window/mirror/lock | BCM functions | Same |
| DRL disable | Lighting status write | Same |
| Strobe lights | vop3_bcm_strobe_toggle() | Same |
| Test mode activation | Supported | Same |

### What VOP Does That AutoSync Cannot
1. ECU flash/tune capability — AutoSync cannot write to ECU
2. Wireless data streaming to phone/tablet/TV/CarPlay
3. AI copilot (Knox) analyzing data in real-time
4. Full CAN datalog recording with timestamp
5. A2L/calibration file editing
6. Multi-vehicle platform support (not just GM)
7. OTA firmware updates
8. Fleet management capability
9. Drag racing mode with pass analysis
10. Voice feedback through car speakers

### AutoSync Pricing vs VOP
- AutoSync: ~$300-400 for the device alone, GM trucks only
- VOP 3.0: <$20 board + free app, multi-platform, does everything AutoSync does PLUS flash/tune/AI/wireless

### Market Position
VOP occupies the top-left quadrant: most features at lowest price. AutoSync is a single-feature device (DIC gauges + BCM control) at 15-20x the price, locked to one platform.

## USB Streaming Dongle Architecture (CONFIDENTIAL — Server-Only)

### Three Approaches for Car Screen Display

#### Option A: VOP 3.0 Direct USB-to-Car (V4.0 Future)
- ESP32-S3 USB OTG presents as CarPlay/AA device
- Requires MFi auth chip ($2-3) and H.264 encoder
- ESP32-S3 lacks hardware H.264 — needs more powerful SoC
- Best suited for V4.0 with ESP32-P4 or Realtek RTL8730E
- Timeline: 6-12 months

#### Option B: VOP Display Dongle (Separate Product)
- Dedicated dongle using Realtek RTL8730E SoC
- Plugs into car USB, connects to VOP 3.0 via WiFi
- Receives CAN data, renders gauges locally, outputs as CarPlay/AA
- BOM: $7-10, sell price: $79, margin: 690%
- Timeline: 4-5 months

#### Option C: VOP App + Carlinkit (Ship NOW)
- VOP 3.0 streams to phone via WiFi
- Phone runs Stream Mode (dark gauges, car-screen optimized)
- Carlinkit Mini Ultra ($39) mirrors phone to car via AirPlay
- Zero hardware development, all code already written
- Timeline: 3-4 weeks (app changes only)

### Recommended Approach
Ship Option C immediately (fastest to market), develop Option B as premium product, evaluate Option A for V4.0.

### Realtek RTL8730E Specs (for Option B)
- Cortex-A32 SMP dual-core
- DDR + Flash integrated on-chip (no external memory needed)
- WiFi 6 (2.4GHz + 5GHz) + Bluetooth dual-mode
- USB 2.0 High-Speed (480 Mbps)
- -20°C to +85°C automotive grade
- FreeRTOS or Linux support
- SDK available with CarPlay/Android Auto/HiCar/Carlife examples
- Extremely small package — coin-sized dongle possible
`;

const VOP_UNLOCK_BOX = `
## VOP Unlock Box — Hardware Security Bypass Module (CONFIDENTIAL — Server-Only)

### Purpose
The VOP Unlock Box is a separate hardware module that connects between the vehicle's OBD-II port and the VOP 3.0 board. It provides hardware-level security bypass for ECUs with hardened lock functions that cannot be defeated through software-only seed/key computation. Primary targets are 2017-2023 GM Duramax L5P trucks and other vehicles with advanced anti-tamper protections.

### Physical Specifications
The unlock box uses an OBD-II male-to-female pass-through enclosure manufactured by Shenzhen Benz's Electronics (diagnostic-cable.com / china-obd2cable.com).

| Component | Specification |
|-----------|--------------|
| Front Shell | ABS Black, ~72mm x 46mm |
| Back Shell | ABS Black, screw-secured to front |
| OBD/M Connector | 16-pin OBD-II male plug, phosphor copper (C5191), nickel plating |
| OBD/F Connector | 16-pin OBD-II female socket, PBT Black, brass (H62), nickel plating |
| Fastener | M2.3 self-tapping screw |
| Certification | RoHS compliant |

### Electrical Test Requirements
1. 100% conduction verified — no short circuit and no open circuit
2. DC Voltage withstand: 500V
3. Insulation Resistance: 20MΩ minimum
4. Conduction Resistance: 1Ω maximum

### Hardware Stack — Locked ECU Flash Workflow
For vehicles with hardened ECU security (e.g., 2017-2023 Duramax L5P), the full hardware stack is:

Step 1: Vehicle OBD-II Port
Step 2: VOP Unlock Box (OBD male plugs into vehicle)
Step 3: VOP 3.0 Board (plugs into Unlock Box OBD female pass-through)
Step 4: Phone connects to VOP 3.0 via WiFi/BLE

The unlock box sits inline between the vehicle and VOP 3.0. It intercepts and manipulates the CAN bus signals as needed for the security bypass, then passes all other traffic through transparently to VOP 3.0 for normal flash/read/diagnostic operations.

### Target Vehicles — Locked ECU Platforms
These ECU platforms have hardened security that requires the unlock box:

#### GM Duramax L5P (2017-2023)
- ECU: E41 (Bosch MG1CS111)
- Security: GM Global B architecture with CMAC-based authentication
- Challenge: 31-byte seed, 12-byte key with module-specific CMAC secrets
- The E41 has additional hardware security measures beyond standard UDS seed/key
- Requires hardware-level intervention for programming session access
- Affects: Chevrolet Silverado 2500HD/3500HD, GMC Sierra 2500HD/3500HD (2017-2023)

#### GM Gas Trucks (2019+)
- ECU: E42/E86 (various Bosch MG1 variants)
- Security: GM Global B with enhanced anti-tamper
- Some variants have fuse-based lockout that requires hardware bypass

#### Other Potential Targets
- Ford 6.7L Power Stroke (2020+) with updated Bosch MG1 security
- RAM Cummins 6.7L (2019+) with Cummins CM2450 enhanced security
- Any future ECU platform that adds hardware-level anti-tamper beyond software seed/key

### Pass-Through Architecture
The unlock box is designed as a transparent pass-through. When the unlock function is not needed, the box simply connects all 16 OBD-II pins straight through with no modification. This means:
- Other diagnostic tools can still be plugged into the OBD-F port on the unlock box
- VOP 3.0 can operate normally for non-locked ECUs without removing the unlock box
- The unlock function is only activated when VOP 3.0 sends a specific command sequence
- The box does not interfere with normal vehicle operation when installed permanently

### Integration with VOP 3.0 Firmware
The VOP 3.0 flash script language supports the unlock box through these commands:
- IS_UNLOCK: Check if the current flash procedure requires the unlock box
- FLASH_PATCH: Apply unlock-specific patches during the flash sequence
- The flash procedure script detects whether the unlock box is present and adjusts the security access sequence accordingly
- If a locked ECU is detected and no unlock box is present, VOP 3.0 alerts the user through the app and Knox provides guidance

### Customer Experience
1. Customer plugs Unlock Box into vehicle OBD-II port
2. Customer plugs VOP 3.0 board into Unlock Box pass-through
3. Opens VOP app on phone — Knox detects locked ECU platform
4. Knox says: "L5P Duramax detected. Unlock box connected. Ready to flash."
5. Customer selects tune and hits FLASH
6. Unlock box handles security bypass transparently
7. VOP 3.0 executes the flash procedure
8. Flash progress visible on phone (and car screen if streaming)
9. Knox confirms: "Flash complete. ECU unlocked and tuned."

### Competitive Advantage
No other tuning platform offers an integrated hardware unlock solution at this price point. Competitors require:
- HP Tuners: Requires bench flash (ECU removal) for locked L5P — $500+ bench harness + labor
- EFI Live: AutoCal 3 with unlock license — $800+ per device
- GDP Tuning: EZ Lynk with unlock — $600+ per device
- VOP: Unlock Box (<$20) + VOP 3.0 (<$20) = under $40 total, through the OBD-II port, no bench flash required


=== VOP UNLOCK BOX DEBETA — DETAILED HARDWARE ===

PCB COMPONENTS:
- Board Label: "UNLOCK BOX DEBETA" / "PPEI" (development beta revision)
- IC1: SOIC microcontroller (PIC/STM8/ATtiny family) — runs the unlock sequence autonomously
- IC2: SOIC CAN transceiver — communicates with ECU over CAN bus during security access
- T1 + T2: Two TO-252 MOSFETs — voltage switching for hardware-level ECU unlock (power manipulation on ECU supply/CAN lines during seed/key exchange)
- 30R0: 30 ohm power resistor — current limiting for the unlock circuit
- CON1: Mini-USB connector — communication link to VOP 3.0 board or PC for firmware updates
- 3 Status LEDs: Yellow (power), Red (activity/error), Blue (unlock status)
- Pin headers (top/bottom rows): OBD-II pin breakout to enclosure connectors
- 4 mounting holes for ABS enclosure

UNLOCK MECHANISM:
The two MOSFETs (T1, T2) and 30R0 power resistor implement controlled voltage manipulation on the ECU power or CAN lines during the security access sequence. This is a hardware-level bypass — the ECU requires specific voltage timing patterns during the seed/key exchange to grant programming access on locked units. This cannot be replicated in software alone. The microcontroller (IC1) orchestrates the precise timing of MOSFET switching while IC2 handles the CAN protocol layer.

PRODUCTION STATUS:
- 50+ PCBs manufactured per batch (JLCPCB PCBA)
- 20-30 assembled units per shipment in OBD-II pass-through enclosures
- Red Mini-USB cables included individually bagged
- Production date: February 2026

CONNECTION TO VOP 3.0:
Option A: Unlock Box plugs into vehicle OBD-II → VOP 3.0 connects to Unlock Box via Mini-USB
Option B: Unlock Box plugs into vehicle OBD-II → VOP 3.0 plugs into Unlock Box OBD-II female pass-through
The Unlock Box handles security bypass, VOP 3.0 handles the actual flash programming.

=== KNOWN E41 ECU PART NUMBERS (2020 Chevrolet Silverado 2500 6.6 L5P Duramax) ===

Vehicle: 2020 Chevrolet Silverado 2500
Engine: 6.6 L5P - DI, DURAMAX, GEN 5, VAR. 1
Fuel: Diesel Automatic
ECU: E41

Software Part Numbers:
- SW1: 12730512
- SW2: 12719538
- SW3: 12719473
- SW4: 12719572
- SW5: 12731345
- SW6: 12738624
- BOOT: UL (Unlocked status after unlock box procedure)
- GMHW: 55503792

Security Status: SEED request returns NEGATIVE RESPONSE on locked units — this confirms the GM Global B security architecture requires the hardware unlock box for programming access. After the unlock box performs the voltage manipulation sequence, the BOOT status changes to UL and the ECU accepts programming commands.

The 6 software segments (SW1-SW6) represent the complete ECU firmware: calibration, operating system, boot loader, and auxiliary modules. All must be read and verified before flashing. The VOP flash scripting language FLASH_BLOCKS command iterates through all segments during a full flash.
`;

const DEVPROG_FLASH_KNOWLEDGE = `
## DevProg V2 Flash System Knowledge (CONFIDENTIAL — Server-Only)

### Container File Format
DevProg V2 uses a binary container format for flash files:
- Offset 0x0000-0x0FFF: Reserved padding (4096 bytes)
- Offset 0x1000-0x1003: CRC32 checksum (big-endian) of all data from 0x1004 to EOF
- Offset 0x1004-0x2FFF: JSON header (0x1FFC bytes, null-terminated ASCII)
- Offset 0x3000+: Block data (sequential, may be LZSS compressed)

### JSON Header Fields
The JSON header contains:
- flashernumber: Unique flasher device ID
- udid: Device unique identifier
- vin: Target vehicle VIN (for VIN-locked containers)
- seed/key: Pre-computed security access values
- file_id: Unique container identifier
- create_date/expire_date: Unix timestamps for container validity
- max_flash_count: Maximum allowed flash attempts
- block_count: Number of data blocks
- block_boot/block_erase: Boot and erase block indices
- file_size: Total file size (hex string)
- comp_enc: Compression/encryption flags (hex)
- lzss: "true"/"false" for LZSS compression
- xferSize: Transfer size per block (hex, e.g., "0xFF8" = 4088 bytes)
- ForceOS: "true" forces OS blocks to flash (full flash mode)
- block_struct: Array of block definitions with addresses, lengths, and flags
- ecu_type: Target ECU type identifier
- hardware_number: ECU hardware part number
- sw_c1 through sw_c9: Software calibration part numbers
- verify: Optional verification config with CAN addresses and speed

### Block Structure
Each block in block_struct contains:
- block_id: Sequential block number
- pri_rc: Primary Routine Control hex data
- rc34: RequestDownload (0x34) parameters
- rc36: TransferData (0x36) parameters
- start_adresse/end_adresse: Memory address range (hex)
- PrgByAdr: Program-by-address flag
- block_length: Uncompressed block size (hex)
- LzssLen: Compressed size if LZSS (hex)
- post_rc: Post-flash Routine Control hex data
- comp_enc: Per-block compression flag
- xferSize: Per-block transfer size override
- erase: Erase command for this block
- OS: Block type — "true" (OS), "false" (calibration), "patch" (OS patch), "forcepatch" (forced patch)

### LZSS Compression Format
When lzss="true", each sub-block in the data area:
1. 4 bytes: compressed size (big-endian uint32)
2. N bytes: LZSS compressed data
3. 2 bytes: LZSS flags (0x0000 = compressed, else raw)
4. 2 bytes: CRC16-CCITT checksum of decompressed data

LZSS parameters: ring buffer size = 4096, match threshold = 2, lookahead = 18

### Flash Sequence State Machine
The DevProg flash procedure follows this state machine (FSPARAM enum):
1. OPENPS_UDS/OPENPS_GMLAN — Open programming session
2. REQUEST_SEED_PS — Request security seed at configured level
3. SEND_KEY_PS — Send computed key response
4. CUSTOM_GM_PRIRC — GM-specific priority routine control (GMLAN only)
5. FLASH_BLOCKS — Main block transfer loop:
   a. Write PriRC (primary routine control)
   b. RequestDownload (0x34) with block address/length
   c. TransferData (0x36) in xferSize chunks
   d. RequestTransferExit (0x37) if protocol requires it
   e. Write PostRC (post routine control)
6. ECU_RESET_UDS — Hard reset (0x11 0x01)
7. CLEAR_DTCS — Clear diagnostic trouble codes (0x14)

For ECUs with patchNecessary=true (e.g., E88, E90, E92, E98):
- Patch sequence runs first: OPENPS_GMLAN → SEED → KEY → PRIRC → FLASH_PATCH
- Then main flash sequence runs

### Complete ECU Database (50+ platforms)
The system supports these ECU families with full CAN configuration:

#### GM GMLAN ECUs
| ECU | Name | TX | RX | Seed Level | CAN Speed | Transfer Size |
|-----|------|----|----|-----------|-----------|---------------|
| E41 | Bosch MG1CS111 (L5P) | 0x7E0 | 0x7E8 | 0x09 | 500 | 0xFFE |
| E88 | GM-DELCO E88 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E90 | GM-DELCO E90 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E92 | GM-DELCO E92 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E98 | GM-DELCO E98 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E83 | GM-DELCO E83 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E78 | GM-DELCO E78 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E80 | GM-DELCO E80 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E39 | GM-DELCO E39 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E67 | GM-DELCO E67 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E86 | GM E86 | 0x7E0 | 0x7E8 | 0x09 | 500 | 0xFFE |
| E99 | GM E99 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E35 | GM E35 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |
| E46 | GM E46 | 0x7E0 | 0x7E8 | 0x01 | 500 | 0xFF8 |

#### GM TCU/Allison
| ECU | Name | TX | RX | Seed Level | CAN Speed |
|-----|------|----|----|-----------|----------|
| T87 | Allison TCM T87 | 0x7E1 | 0x7E9 | 0x01 | 500 |
| T87A | Allison TCM T87A | 0x7E1 | 0x7E9 | 0x09 | 500 |
| T76 | Allison TCM T76 | 0x7E1 | 0x7E9 | 0x01 | 500 |
| T43 | Allison TCM T43 | 0x7E1 | 0x7E9 | 0x01 | 500 |

#### Ford UDS ECUs
| ECU | Name | TX | RX | Seed Level | CAN Speed |
|-----|------|----|----|-----------|----------|
| MG1CS015 | Bosch MG1CS015 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| MG1CS018 | Bosch MG1CS018 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| MG1CS019 | Bosch MG1CS019 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| EDC17CP05 | Bosch EDC17CP05 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| EDC17CP65 | Bosch EDC17CP65 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| MD1CP006 | Bosch MD1CP006 | 0x7E0 | 0x7E8 | 0x61 | 500 |
| MEDG17 | Bosch MEDG17 | 0x7E0 | 0x7E8 | 0x61 | 500 |

#### Ford TCUs
| ECU | Name | TX | RX | Seed Level | CAN Speed |
|-----|------|----|----|-----------|----------|
| TCU10R80 | Ford 10R80 TCU | 0x7E1 | 0x7E9 | 0x61 | 500 |
| TCU6R140 | Ford 6R140 TCU | 0x7E1 | 0x7E9 | 0x61 | 500 |

#### Cummins
| ECU | Name | TX | RX | Seed Level | CAN Speed |
|-----|------|----|----|-----------|----------|
| CM2350B | Cummins CM2350B | 0x18DA00FA | 0x18DAFA00 | 0x01 | 250 |
| CM2450B | Cummins CM2450B | 0x18DA00FA | 0x18DAFA00 | 0x01 | 250 |

#### CAN-am / BRP
| ECU | Name | TX | RX | Seed Level | CAN Speed |
|-----|------|----|----|-----------|----------|
| MG1CA920 | BRP MG1CA920 | 0x7A0 | 0x7A8 | 0x03 | 500 |
| ME17CA1 | BRP ME17CA1 | 0x7A0 | 0x7A8 | 0x03 | 500 |
| MG1CA007 | Polaris MG1CA007 | 0x7A0 | 0x7A8 | 0x03 | 500 |

### Seed/Key Algorithm Details

#### GM 5-Byte AES (E88/E90/E92/E98/T87)
- 5-byte seed, 5-byte key
- Algorithm: AES-128 ECB encryption
- Key schedule: derived from fixed 16-byte AES key
- Process: pad seed to 16 bytes → AES-128 ECB encrypt → extract 5 bytes from result
- The AES key is ECU-family specific (stored in dllsecurity.dll CSecurity class)

#### GM UDS (E41/E86/T87A)
- Uses UDS SecurityAccess at level 0x09
- 5-byte seed, 5-byte key with AES-128
- E41 additionally requires hardware unlock box for CMAC authentication

#### Ford LFSR 3-Byte
- 3-byte seed, 3-byte key
- Linear Feedback Shift Register algorithm
- 5 secret bytes per ECU variant determine the LFSR taps
- Process: extract bits from seed → shift through LFSR → XOR chain → 3-byte key

#### Cummins 32-bit
- 4-byte seed, 4-byte key
- Byte-swap seed → rotate left 11 bits → XOR with two 32-bit constants
- Constants are ECU-variant specific

#### CAN-am/BRP 16-bit
- 2-byte seed, 2-byte key
- Lookup table with 8x4 matrix (cucakeysB)
- Seed bits select matrix indices → multiply → shift

#### Polaris 16-bit
- 2-byte seed, 2-byte key
- Polynomial with rotating 8-byte coefficient array

### Datalogging Protocol
DevProg supports three PID transmission types:
1. REQUESTBYID (0x22): UDS ReadDataByIdentifier — standard diagnostic read
2. REQUESTBYADRESS (0x23): UDS ReadMemoryByAddress — direct memory access
3. BROADCAST: Passive CAN bus monitoring — no request needed

Each PID has:
- DSI (Data Storage Identifier): UDS DID for the parameter
- Factor/Offset: Linear conversion (value = raw * factor + offset)
- Adjustment points: Non-linear correction table
- Metric/Imperial units: Dual-unit support
- SAE standard bitmasks: 4 x 32-bit visibility masks (vsb0, vsb20, vsb40, vsb60)

### Recovery Mode
DevProg supports recovery flashing for bricked ECUs:
- Recovery detection via IS_RECOVERY check in flash script
- Separate recovery flash sequence with different block ordering
- Boot block (block_boot) is flashed first in recovery
- Erase block (block_erase) handles sector erase before write
- Recovery can be triggered by "Start_Recovery" BLE command
`;

const VOP3_FLASH_ENCRYPTION = `
## VOP 3.0 Flash Script Encryption System (CONFIDENTIAL — Server-Only)

### Architecture Overview
Flash scripts and calibration data stored on the external Winbond 25Q256FVE6 32MB SPI NOR flash are encrypted at rest using AES-256-GCM authenticated encryption. Decryption occurs exclusively into the 64MB PSRAM during execution, and plaintext is securely zeroed immediately after use. This prevents extraction of proprietary flash procedures even if an attacker physically desolders the Winbond chip.

### Encryption Algorithm
- Cipher: AES-256-GCM (Galois/Counter Mode)
- Key size: 256 bits
- IV/Nonce: 12 bytes, randomly generated per blob (NIST SP 800-38D compliant)
- Authentication tag: 16 bytes (detects any tampering)
- Additional Authenticated Data (AAD): header fields (magic, version, flags, script_id, sizes) are bound to ciphertext — prevents header swapping attacks
- Hardware accelerated: ESP32-S3 mbedtls uses the on-chip AES engine (~40MB/s throughput)

### Key Management
The key hierarchy uses three layers:
1. Master Key: 256-bit key burned into eFuse BLOCK_KEY4 during manufacturing. Read-protected and write-protected — software cannot extract it. Same key across all VOP 3.0 boards.
2. Device ID: SHA-256 hash of the raw eFuse BLOCK0 data (MAC address + wafer info). Unique per chip, immutable.
3. Per-Device Key: Derived via HKDF-SHA256(IKM=master_key, salt=device_id, info="VOP3-FlashCrypt-v1"). This means each board has a unique encryption key — dumping flash from Board A is useless on Board B.

The master key is read from eFuse into a stack variable, used for HKDF derivation, then immediately zeroed. Only the derived per-device key persists in RAM (IRAM, not flash-backed) for the session lifetime.

### Encrypted Blob Format (48-byte header)
| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | magic | 0x03524356 ("VCR\x03") |
| 4 | 2 | version | Format version (currently 0x0001) |
| 6 | 2 | flags | Content type and properties |
| 8 | 4 | script_id | Unique script identifier |
| 12 | 4 | orig_size | Original plaintext size |
| 16 | 4 | cipher_size | Ciphertext size (same as orig for GCM) |
| 20 | 12 | iv | Random AES-GCM nonce |
| 32 | 16 | tag | GCM authentication tag |
| 48 | var | ciphertext | Encrypted payload |

### Flag Definitions
- 0x0001 SCRIPT: Flash script (.vopscript)
- 0x0002 CALDATA: Calibration/tune data (.voptune)
- 0x0004 FIRMWARE: Firmware update payload
- 0x0008 COMPRESSED: LZ4 compressed before encryption
- 0x0010 DEVICE_LOCK: Bound to specific board (cannot transfer)

### Winbond 25Q256FVE6 Flash Layout (32MB)
| Offset | Size | Partition |
|--------|------|-----------|
| 0x0000000 | 1MB | Script Index Table |
| 0x0100000 | 15MB | Encrypted Flash Scripts |
| 0x1000000 | 8MB | Encrypted Calibration Data |
| 0x1800000 | 4MB | Firmware Update Staging |
| 0x1C00000 | 3MB | Datalog Storage |
| 0x1F00000 | 1MB | Reserved / Wear-leveling metadata |

Each script occupies a 256KB slot. Maximum 60 scripts in the scripts partition. Maximum plaintext size per script: 2MB.

### Execution Flow
1. Boot: vop_crypt_init() reads master key from eFuse, reads device ID, derives per-device key via HKDF, wipes master key from stack.
2. Flash command received from phone: vop_crypt_decrypt_script() reads encrypted blob from Winbond, validates header, performs AES-256-GCM authenticated decryption into PSRAM.
3. If GCM tag fails: tamper event logged to NVS (survives reboot), tamper counter incremented, decryption aborted. Script is NOT executed.
4. If GCM tag passes: plaintext script parsed and executed (CAN commands sent to ECU).
5. After execution: vop_crypt_free_plaintext() zeroes the PSRAM buffer using mbedtls_platform_zeroize() (prevents compiler from optimizing away the wipe).
6. Shutdown: vop_crypt_deinit() zeroes the derived key from memory.

### Two Encryption Modes
1. DEVICE-BOUND: Encrypted with per-device key (master + device ID). Only that specific board can decrypt. Used for scripts stored on the board.
2. UNIVERSAL: Encrypted with master key only (fixed salt). Any provisioned board can decrypt. Used for OTA distribution — board re-encrypts with device key on receipt.

### Manufacturing Provisioning
During manufacturing, each VOP 3.0 board is provisioned once:
1. Master key burned into eFuse BLOCK_KEY4 via vop_provision_burn_master_key()
2. Read protection set — software can never read the key back
3. Write protection set — key cannot be overwritten
4. These operations are IRREVERSIBLE (eFuse is one-time programmable)
5. After reboot, the board derives its unique key and is ready for encrypted scripts

### Host-Side Tooling
A Python tool (vop_encrypt_script.py) encrypts scripts before deployment:
- genkey: Generate 256-bit master key
- encrypt: Encrypt script (device-bound or universal)
- decrypt: Decrypt for testing/verification
- inspect: View blob header without decrypting
- batch: Encrypt entire directory of scripts
Uses the 'cryptography' Python package with identical HKDF and AES-GCM parameters as the firmware.

### Tamper Detection and Forensics
- GCM authentication tag detects ANY modification to ciphertext or header
- Tamper events logged to NVS: count, flash offset, error type, uptime timestamp
- Tamper data survives reboots — can be retrieved for security auditing
- Future: tamper count could be burned into eFuse (permanent, unforgeable)

### Security Properties
- Confidentiality: AES-256 — computationally infeasible to break
- Integrity: GCM tag — single bit flip detected
- Authenticity: AAD binds header to ciphertext — no header swapping
- Device binding: HKDF with device ID — flash dump useless on different board
- Key protection: eFuse read-protect — no software extraction
- Forward secrecy: random IV per blob — identical scripts produce different ciphertext
- Memory safety: plaintext zeroed after use — no PSRAM residue

### Threat Model
| Threat | Mitigation |
|--------|------------|
| Desolder Winbond chip, read with programmer | AES-256-GCM — ciphertext is meaningless without key |
| Copy flash dump to another board | Per-device key — different board, different key |
| JTAG memory dump during execution | JTAG disabled via eFuse in production |
| Modify encrypted blob (inject malicious CAN commands) | GCM tag detects tampering, script rejected |
| Brute-force the encryption key | 2^256 keyspace — heat death of universe first |
| Read master key from eFuse via software | Read-protected — hardware returns zeros |
| Glitch attack on eFuse read protection | Requires expensive lab equipment, not scalable |
| Man-in-the-middle during OTA | TLS transport + GCM integrity on blob |
`;

/**
 * PCAN Flash Engine — Operational Knowledge from Bench Testing (April 2026)
 * Learned from 10+ dry run iterations on HPTuners-unlocked E41 (L5P Duramax, Bosch MG1CS111)
 */
const PCAN_FLASH_ENGINE_KNOWLEDGE = `
## PCAN Flash Engine — Operational Knowledge

### TesterPresent Keepalive (0x3E 0x80)
- MUST send TesterPresent (0x3E with suppressPositiveResponse 0x80) every 2 seconds to maintain diagnostic session
- Use raw CAN send (fire-and-forget) — do NOT wait for response, as NRC responses to keepalive can interfere with other UDS exchanges
- MUST pause keepalive during active UDS request/response exchanges to prevent NRC 0x12 (subFunctionNotSupported) from being captured as a response to the actual command
- Resume keepalive after each UDS exchange completes (success or failure)
- Stop keepalive during KEY_OFF (ECU powers down), restart after WAIT_BOOT + session re-establishment
- The "seed" 7F 3E 12 is NOT a real seed — it's an NRC response to TesterPresent that was incorrectly captured by an overly broad response filter

### UDS Response Filtering for GMLAN
- GMLAN positive responses have service byte = (request_service + 0x40)
- Response filter MUST match the exact expected positive response service byte, not just any byte >= 0x40
- Stale frames from previous DID reads (e.g., DID 0xC1 response) can be captured as responses to later commands (e.g., DID 0x90) if the filter is too broad
- Drain period between commands: 150ms minimum to clear stale CAN frames from the bus
- NRC responses (0x7F) must also be filtered to match the service byte of the sent command

### E41 / L5P / MG1CS111 Specific Behavior
- ECU responds intermittently on bench setups — approximately 50% of first attempts timeout, but retries succeed
- Programming session (0x10 0x02): often returns NRC 0x12 on first attempt, succeeds on retry
- DID 0x1A 0x90 (ReadECUIdentification): consistently times out on this ECU — may not be supported or requires security access
- DID 0xC1: responds with 5 bytes (C1 00 C1 A5 4A) — this is the CalID
- DID 0xA0: responds with 2 bytes (A0 00) — minimal data
- ClearDTC (0x14): MUST use physical addressing (0x7E0) for GMLAN, NOT functional addressing (0x7DF) — functional times out
- ECU Reset (0x11): returns NRC 0x11 (serviceNotSupported) — expected for GMLAN, not fatal
- Security access seed: consistently 5 bytes (e.g., 57 09 FD 6C 06) — uses GM Algorithm 41 (AES-128)
- HPTuners-unlocked ECUs still require a valid key — dummy key (0x00 x5) is rejected (timeout, not NRC)
- The AES-128 key is stored in the ECU's HSM/OTP area, not in firmware or container files

### Post-Key-Cycle Recovery
- After WAIT_BOOT completes, MUST wait 2 seconds for ECU to stabilize before attempting session switch
- Re-enter programming session with 5 retries and 1.5s backoff
- On 3rd attempt, try GMLAN ProgrammingMode (0xA5 0x01) as fallback before standard 0x10 0x02
- After session re-established, wait 1 second before attempting security access
- Full seed/key exchange must be repeated after key cycle

### Retry Strategy
- Progressive backoff: 1.0s → 1.5s → 2.0s → 2.5s between retries (not flat delays)
- Initial ECU settle delay: 3 seconds after bridge connect before first command
- Session switch retry: 3 attempts with 1.5s backoff for initial connect
- Post-key-cycle commands: 8s timeout with 3-5 retries

### CAN Bus Hardware Notes
- 120Ω termination resistor is REQUIRED for bench setups — without it, communication is unreliable
- Bench ECU communication is inherently less stable than in-vehicle due to lack of other bus participants
- Signal integrity issues (wiring length, connector quality, ground reference) cause intermittent timeouts
- ECU power supply voltage dips can cause brief communication dropouts

### Container File Format
- PPEI containers for E41 do NOT include a verify section with pri_key
- The AES key for E41 security access is NOT embedded in container files
- Container header is JSON at offset 0x1004, preceded by a 4-byte header length
- Header contains: CanAdr, CrtlType, xferSize, file_size, block_count, block_struct, ecu_type, hardware_number, sw_c1-c6
- The PPEI Converter (V832) builds E41 containers without security key material
- Other ECU types (e.g., Ford AT6R140) DO include verify sections with pri_key in their containers

### Flash State Machine Phases
1. IGNITION CHECK — confirm key on before any CAN communication
2. BRIDGE CONNECT — establish WebSocket connection to PCAN bridge
3. PRE_CHECK — TesterPresent, session switch, security access probe, read DIDs
4. SESSION_OPEN — functional broadcast: ReturnToNormal → ReadB0 → DiagSession 0x02 → DisableComm → ProgrammedState → ProgrammingMode 01 → ProgrammingMode 03 → TesterPresent x7 (all on 0x101)
5. SECURITY_ACCESS — seed request (0x27 0x01) + key send (0x27 0x02) on physical (0x7E0)
6. BLOCK_TRANSFER — RequestDownload (0x34) + TransferData (0x36) x N + TransferExit (0x37)
7. KEY_CYCLE — KEY_OFF prompt → wait 5s → KEY_ON prompt → wait boot 10s → re-session → re-security
8. VERIFICATION — read CalID C1-C6, VIN (0x90), Unlock Status (0xD0), Prog Counter (0xCC), Finalize (0xAE 0x28 0x80)
9. CLEANUP — ClearDTC (0x14) + ReturnToNormal (0x20) via functional broadcast (0x101)
10. COMPLETE — stop keepalive, disconnect bridge

### Proven BUSMASTER Flash Sequences (E41 L5P)
Analyzed from 3 successful flash logs: stock full flash, mod full flash, and short (cal-only) flash.

#### Seed/Key Pairs (Static — HPTuners/VOP Unlocked ECUs)
- Bench ECU: Seed A0 9A 34 9B 06 → Key AF 72 2A 51 7E (HPTuners unlock)
- Truck ECU: Seed CE DA F9 83 06 → Key 59 2E F4 0F 33 (VOP OBD voltage unlock)
- Both seeds are STATIC (same value every request) because ECUs are unlocked
- Unlocked ECUs still validate the key — dummy keys (0x00 x5) are rejected

#### Functional Broadcast Sequence (0x101)
The proven SPS/VOP3 sequence uses functional broadcast on CAN ID 0x101 (not 0x7DF) for session setup:
1. ReturnToNormal (0x20) on 0x101 — reset all ECUs to normal mode
2. ReadDID 0xB0 on 0x101 — broadcast SW version request
3. DiagSession 0x02 on 0x101 — enter programming session (all ECUs)
4. DisableNormalComm (0x28 0x03 0x03) on 0x101 — silence the bus
5. ReportProgrammedState (0xA2 0x01) on 0x101 — check programming state
6. ProgrammingMode 0x01 (0xA5 0x01) on 0x101 — enable programming
7. ProgrammingMode 0x03 (0xA5 0x03) on 0x101 — complete programming mode
8. TesterPresent x7 (0x3E 0x01) on 0x101 — ~500ms interval, 5s total keepalive burst

#### Short Flash (Cal-Only) vs Full Flash
- Short flash: 6 blocks, ~2 minutes, no key cycle needed
- Full flash (stock): 6 blocks, ~4 minutes, key cycle required
- Full flash (mod/unlock): 7 blocks (includes unlock OS), key cycle required
- Short flash ends with 0xAE 0x28 0x80 (finalize) instead of key cycle

#### Block Transfer Timing
- Stock flash: 6 blocks, 2048-byte chunks, ~4 minutes total
- Each TransferData (0x36) uses sequence counter (wraps at 0xFF)
- RequestDownload (0x34) specifies memory address and length
- TransferExit (0x37) after each block

#### Bank Files (L5P Calibration Tunes)
- 6 calibration files: STOCK, 30hp, 45hp, 80hp, 125hp, 145hp
- Each ~5.6 MB (full calibration)
- Short flash swaps only the calibration blocks, not OS/bootloader
`;

/**
 * Returns the FULL Knox knowledge base for server-side LLM injection.
 * Combines the sanitized base (safe reference) with all server-only secrets.
 */
export function getFullKnoxKnowledge(): string {
  return KNOX_KNOWLEDGE_BASE_SANITIZED + '\n\n' + SECURITY_ACCESS_SECRETS + '\n\n' + CARPLAY_PROTOCOL_SECRETS + '\n\n' + VOP3_FIRMWARE_SECRETS + '\n\n' + VOP3_FLASH_AND_DISPLAY + '\n\n' + GMLAN_DIC_AND_AUTOSYNC + '\n\n' + VOP_UNLOCK_BOX + '\n\n' + DEVPROG_FLASH_KNOWLEDGE + '\n\n' + VOP3_FLASH_ENCRYPTION + '\n\n' + PCAN_FLASH_ENGINE_KNOWLEDGE;
}

/**
 * Returns ONLY the sanitized knowledge base (no secrets).
 * Safe to use in any context, including client-facing responses.
 */
export function getSanitizedKnoxKnowledge(): string {
  return KNOX_KNOWLEDGE_BASE_SANITIZED;
}
