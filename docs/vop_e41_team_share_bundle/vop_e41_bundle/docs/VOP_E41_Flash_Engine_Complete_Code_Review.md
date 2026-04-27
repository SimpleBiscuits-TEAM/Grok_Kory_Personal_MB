# VOP E41 Flash Engine - Complete Code Review

**Document Purpose:** Full walkthrough of every line of code that executes during a live E41 flash, organized by execution order. This is the code that will run on attempt #17.

---

## Table of Contents

1. ECU Configuration (Static Data)
2. Flash Plan Generation (Orchestrator)
3. Flash Engine Execution - PRE_CHECK
4. Flash Engine Execution - SESSION_OPEN (Broadcast)
5. Flash Engine Execution - SECURITY_ACCESS
6. Flash Engine Execution - BLOCK_TRANSFER
7. POST_FLASH / VERIFICATION / CLEANUP
8. Transport Layer - sendUDSviaRawCAN (Single Frame)
9. Transport Layer - sendUDSMultiFrame (ISO-TP)
10. Seed/Key Algorithm - AES-128 ECB
11. TesterPresent Keepalive
12. Bridge Reconnection
13. Summary of Current Failure Point

---

## 1. ECU Configuration

**File:** `shared/ecuDatabase.ts` - E41 entry

```typescript
E41: {
  ecuType: 'E41', name: 'E41 (L5P Duramax)',
  oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
  xferSize: 0xFFE,        // Max block length per BUSMASTER (34 00 00 0F FE)
  canSpeed: 500,           // 500 kbps
  seedLevel: 0x01,         // Security access level 1 (0x27 0x01)
  txAddr: 0x7E0,           // Physical request address
  rxAddr: 0x7E8,           // Physical response address
  txPrefix: null, rxPrefix: null,
  saeSupported: true, saeReqAdd: null, fastMode: true,
  patchNecessary: true,
  flashSequence: GM_FLASH_SEQUENCE,
  usesTransferExit: false, // ZERO 0x37 commands in 504,189 BUSMASTER frames
},
```

**File:** `shared/seedKeyAlgorithms.ts` - E41 security profile

```typescript
'E41': {
  ecuType: 'E41', name: 'Bosch MG1CS111 (L5P Duramax)',
  manufacturer: 'GM', algorithmType: 'GM_5B_AES',
  seedLength: 5, keyLength: 5, securityLevel: 'standard',
  protocol: 'GMLAN', requiresUnlockBox: false,
  seedSubFunction: 0x01, keySubFunction: 0x02,
  aesKeyHex: '45AE6BA2CB81F5656B05072D74FF47E0',
},
```

### Key facts

- Protocol: GMLAN (not standard UDS)
- Transfer size: `0xFFE` (4094 bytes per chunk)
- Security: AES-128-ECB, 5-byte seed -> 5-byte key
- AES key: `45AE6BA2CB81F5656B05072D74FF47E0`
- No TransferExit (`0x37`) - confirmed by BUSMASTER
- CAN addresses: `TX=0x7E0`, `RX=0x7E8`

---

## 2. Flash Plan Generation

**File:** `shared/pcanFlashOrchestrator.ts` - `generateFlashPlan()`

The orchestrator generates the command list. For E41 GMLAN, the exact command sequence is:

### Generated Command Sequence (E41 FULL_FLASH)

| # | Phase | Command | CAN TX | Delay Before | nonFatal |
|---|---|---|---|---:|---|
| 0 | VOLTAGE_INIT | Set relay board | (no CAN) | - | - |
| 1 | SESSION_OPEN | ReturnToNormal | `0x101 FE 01 20` | - | - |
| 2 | SESSION_OPEN | ReadDID 0xB0 | `0x101 FE 02 1A B0` | 1000ms | - |
| 3 | SESSION_OPEN | Programming Session | `0x101 FE 02 10 02` | 60ms | - |
| 4 | SESSION_OPEN | DisableNormalComm | `0x101 FE 01 28` | 50ms | - |
| 5 | SESSION_OPEN | ReportProgrammedState | `0x101 FE 01 A2` | 50ms | - |
| 6 | SESSION_OPEN | ProgrammingMode Enable | `0x101 FE 02 A5 01` | 1000ms | - |
| 7 | SESSION_OPEN | ProgrammingMode Complete | `0x101 FE 02 A5 03` | 50ms | - |
| 8 | SESSION_OPEN | Start TesterPresent | `0x101 FE 01 3E` | 50ms | - |
| 9 | SECURITY_ACCESS | Request Seed (Level 1) | `0x7E0 02 27 01` | **4000ms** | **YES** |
| 10 | SECURITY_ACCESS | Send Key | `0x7E0 xx 27 02 ...` | - | **YES** |
| 11+ | BLOCK_TRANSFER | Flash blocks | (per block) | - | - |
| - | POST_FLASH | Routine Control 0xFF01 | `0x7E0 04 31 01 FF 01` | - | **YES** |
| - | VERIFICATION | ReturnToNormal | `0x101 FE 01 20` | - | YES |
| - | VERIFICATION | Finalize (AE 28 80) | `0x7E0 03 AE 28 80` | - | YES |
| - | VERIFICATION | Read VIN, Cal IDs, etc. | `0x7E0 02 1A xx` | - | - |
| - | VERIFICATION | ClearDTC | `0x7DF 01 04` | - | YES |
| - | KEY_CYCLE | Key Off / Key On / Wait | (user action) | - | - |
| - | CLEANUP | ClearDTC (GMLAN) | `0x7DF 01 04` | 1000ms | - |
| - | CLEANUP | ReturnToNormal | `0x101 FE 01 20` | - | - |

### Critical notes from orchestrator

- All `SESSION_OPEN` commands are UUDT (prefix `FE`) on functional address `0x101` - fire-and-forget, no response expected.
- No PRE_CHECK physical commands for GMLAN live flash (BUSMASTER shows zero before broadcast).
- No PriRC (removed - E88-specific, always fails on E41).
- No separate erase command (`0x31`) - erase is implicit in RequestDownload (NRC `0x78`).
- No TransferExit (`0x37`) - next RequestDownload implicitly closes block.
- Security access has 4000ms delay before first seed request (BUSMASTER: 4.0s after `A5 03`).
- Security access is nonFatal for GMLAN.

---

## 3. PRE_CHECK Phase (Flash Engine)

**File:** `client/src/lib/pcanFlashEngine.ts` - `execute()` method, lines 522-728

### What happens in order

```text
1. Prompt user: "Turn ignition ON (key on / engine off)"
   -> Waits for user confirmation (no timeout)

2. Connect to PCAN bridge via WebSocket
   -> conn.connect() - tries wss://localhost:8766 then ws://localhost:8765
   -> Full vehicle initialization (VIN read, PID scan)

3. Wait 3000ms for ECU to settle after bridge connect

4. GMLAN LIVE FLASH: Skip ALL physical commands
   -> No 0x10 0x02 (programming session) on 0x7E0
   -> No 0x27 0x01 (seed request) on 0x7E0
   -> Log: "GMLAN live flash: skipping physical session/security"
   -> TesterPresent keepalive NOT started here (started by SESSION_OPEN cmd #8)

5. CAN bus termination tip logged

6. Check bridge still connected before command loop
   -> If dropped during pre-check, attempt reconnect (3 attempts)
```

**Key decision:** For live flash, PRE_CHECK does **nothing** to the ECU. No physical commands. This matches BUSMASTER, which shows zero physical commands before the broadcast.

---

## 4. SESSION_OPEN Phase (Broadcast Sequence)

**File:** `pcanFlashEngine.ts` - `executeCommand()` method

Each `SESSION_OPEN` command is a UUDT message. The engine detects UUDT by checking if the first data byte is `0xFE`.

### UUDT execution path

```typescript
// Detection: first byte is FE
const isUUDT = rawDataParts[0]?.toUpperCase() === 'FE';

// If TesterPresent UUDT (FE 01 3E) and keepalive not yet active:
//   -> Start cyclic keepalive timer (500ms interval on 0x101)
//   -> Return immediately (don't send this frame - timer handles it)

// For all other UUDT messages:
//   -> Build 8-byte CAN frame with 0x00 padding
//   -> Send via WebSocket: { type: 'can_send', arb_id: 0x101, data: [...] }
//   -> Fire-and-forget - no response listener
//   -> Apply delayBeforeMs if specified
```

### Exact CAN frames sent (with timing)

```text
T+0ms:     0x101 [FE 01 20 00 00 00 00 00]  <- ReturnToNormal
T+1000ms:  0x101 [FE 02 1A B0 00 00 00 00]  <- ReadDID 0xB0
T+1060ms:  0x101 [FE 02 10 02 00 00 00 00]  <- Programming Session
T+1110ms:  0x101 [FE 01 28 00 00 00 00 00]  <- DisableNormalComm
T+1160ms:  0x101 [FE 01 A2 00 00 00 00 00]  <- ReportProgrammedState
T+2160ms:  0x101 [FE 02 A5 01 00 00 00 00]  <- ProgrammingMode Enable
T+2210ms:  0x101 [FE 02 A5 03 00 00 00 00]  <- ProgrammingMode Complete <- ECU REBOOTS
T+2260ms:  Keepalive timer starts (FE 01 3E on 0x101 every 500ms)
```

**Total broadcast window:** ~2.26 seconds (BUSMASTER reference: 2.21s)

After `A5 03`, the ECU reboots into its bootloader. The keepalive timer fires every 500ms during the 4000ms wait before the seed request.

---

## 5. SECURITY_ACCESS Phase

**File:** `pcanFlashEngine.ts` - `handleSecurityAccess()` method, lines 1331-1574

### Bootloader polling loop

```text
The orchestrator sets delayBeforeMs: 4000 on the seed request command.
This 4s delay runs BEFORE the seed request, with keepalive active.

Then the polling loop begins:
  maxPollAttempts = 12 (for GMLAN post-broadcast)
  pollIntervalMs = 3000

  For each poll attempt (0..11):
    For each lockout retry (0..3):
      -> Send: 0x7E0 [02 27 01 00 00 00 00 00]  (Request Seed Level 1)
      -> Wait up to 5000ms for response on 0x7E8

      If no response:
        -> "ECU bootloader not ready yet"
        -> Wait 3000ms, try next poll attempt

      If NRC 0x37 (requiredTimeDelayNotExpired):
        -> Wait 10000ms for lockout to expire
        -> Retry lockout (up to 3 times)

      If NRC 0x36 (exceededNumberOfAttempts):
        -> Wait 10000ms
        -> Retry

      If positive response:
        -> Extract 5-byte seed
        -> Break out of both loops

  Total polling budget: ~36s (12 x 3s) + 4s initial delay = ~40s
```

**CRITICAL:** Keepalive is **not paused** during seed probes. BUSMASTER shows keepalive on UUDT `0x101` running continuously during seed/key exchange on USDT `0x7E0`. Different CAN IDs, no interference.

### Seed/key computation

```text
1. Check known seed->key lookup table:
   - Bench ECU: seed [A0 9A 34 9B 06] -> key [AF 72 2A 51 7E]
   - Truck ECU: seed [CE DA F9 83 06] -> key [59 2E F4 0F 33]

2. If not in lookup table, compute via AES-128-ECB:
   - Get security profile for E41
   - AES key: 45AE6BA2CB81F5656B05072D74FF47E0
   - Build 16-byte buffer: [FF FF FF FF FF FF FF FF FF FF FF seed[0..4]]
   - AES-128-ECB encrypt (via Web Crypto API: AES-CBC with zero IV)
   - Take first 5 bytes of ciphertext as key

3. If seed is all zeros: ECU already unlocked (zero key)

4. Wait 200ms after seed received

5. Send key: 0x7E0 [xx 27 02 key[0..4]]
   -> Wait for positive response (0x67 0x02)
```

### If security times out (nonFatal for GMLAN)

```text
The engine has a belt-and-suspenders safety net:
  - cmd.nonFatal is set by orchestrator -> log warning, continue
  - Separate GMLAN safety net in executeCommand() -> also continues
  - Proceeds to BLOCK_TRANSFER regardless
```

---

## 6. BLOCK_TRANSFER Phase

**File:** `pcanFlashEngine.ts` - `executeBlockTransfer()` method, lines 1578-1804

### Per-block sequence

```text
For each block in the container:

  1. RESOLVE TRANSFER SIZE
     containerXfer = parseInt(block.xferSize, 16)  // from container header
     ecuDbXfer = 0xFFE                              // from ECU database
     xferSize = containerXfer > 0 ? containerXfer : ecuDbXfer
     // Result: 0xFFE (4094 bytes) for E41

  2. CALCULATE BLOCK DATA OFFSET
     headerLength = parseInt(header.header_length, 16)  // typically 0x3000
     blockOffset = headerLength + sum(previous block lengths)

  3. REQUEST DOWNLOAD (0x34)
     If block has rc34 in container header:
       -> Use exact bytes from container
     Else if GMLAN:
       First block:  [0x00, 0x00, 0x0F, 0xFE]  -> 34 00 00 0F FE
       Other blocks: [0x10, 0x0F, 0xFE]         -> 34 10 0F FE

     Send via sendUDSRequest(0x34, undefined, rc34Bytes, 0x7E0)

     If NRC 0x78 (responsePending = ECU erasing flash):
       -> Retry loop with delays: 500ms, 1s, 2s, 5s, 10s, 15s
       -> Total budget: 60s
       -> Each retry re-sends the full RequestDownload
       -> Wait for positive 0x74 response

     If other NRC: throw error (fatal)

  4. TRANSFER DATA (0x36) - chunk loop
     sequenceNumber = 0x00  // ALWAYS 0x00 per BUSMASTER (not incrementing)

     While bytesSent < blockData.length:
       chunkSize = min(xferSize, remaining)  // up to 4094 bytes
       payload = [0x00, ...chunk]            // [seqNum, data...]

       -> sendUDSRequest(0x36, undefined, payload, 0x7E0)
       -> This routes to sendUDSMultiFrame (payload > 7 bytes)
       -> Wait for positive 0x76 response
       -> NRC 0x78 handled by multi-frame listener (keeps waiting for 0x76)

       If NRC other than 0x78: throw error

       Update progress every ~10%

  5. NO TRANSFER EXIT
     // BUSMASTER: zero 0x37 in 504,189 frames
     // Next RequestDownload implicitly closes this block
```

---

## 7. POST_FLASH / VERIFICATION / CLEANUP

### POST_FLASH

```text
-> Send: 0x7E0 [04 31 01 FF 01]  (RoutineControl - Check Dependencies)
-> nonFatal for GMLAN (0x31 returns NRC 0x11 on E41)
```

### VERIFICATION (GMLAN)

```text
1. 0x101 [FE 01 20]        <- ReturnToNormal broadcast (nonFatal)
2. 0x7E0 [03 AE 28 80]     <- Finalize Programming (nonFatal, ECU silent ~12s)
3. 0x7E0 [02 1A 90]        <- Read VIN
4. 0x7E0 [02 1A C1..C6]    <- Read Cal IDs (6 reads)
5. 0x7E0 [02 1A D0]        <- Read Unlock Status
6. 0x7E0 [02 1A CC]        <- Read Programming Counter
7. 0x7DF [01 04]           <- ClearDTC functional (nonFatal)
```

### KEY_CYCLE

```text
1. Prompt: "Turn ignition OFF" -> wait for user
2. Prompt: "Turn ignition ON" -> wait for user
3. Auto-wait 8s for ECU boot
4. reEstablishSession():
   -> Reconnect bridge if needed
   -> Wait 2s for ECU to settle
   -> Send 0x10 0x02 (programming session) - up to 5 retries
   -> Send 0x27 0x01 (seed request) - with lockout handling
   -> Compute and send key
   -> Restart keepalive
5. Read VIN (0x1A 0x90) to verify new cal loaded
```

### CLEANUP

```text
1. 0x7DF [01 04]           <- ClearDTC GMLAN (1000ms delay before)
2. 0x101 [FE 01 20]        <- ReturnToNormal broadcast
3. Stop keepalive
```

---

## 8. Transport Layer - Single Frame

**File:** `client/src/lib/pcanConnection.ts` - `sendUDSviaRawCAN()`

```text
For payloads <= 7 bytes (seed request, session control, DID reads):

1. Ensure bus monitor is running (for response capture)
2. Build ISO-TP single frame:
   frame = [PCI_length, service, sub?, data..., 0x00 padding]
   Example: [02, 27, 01, 00, 00, 00, 00, 00]  <- Request Seed

3. Drain stale frames: clear listener, wait 150ms

4. Set up response listener:
   -> Filter for arb_id = targetAddress + 0x08 (0x7E8)
   -> For functional (0x7DF): accept 0x7E8-0x7EF
   -> Validate response service ID matches expected positive (service + 0x40)
   -> For negative (0x7F): verify rejected service matches what we sent
   -> NRC 0x78: keep listener active (don't resolve)
   -> Timeout: 5000ms default

5. Send frame: { type: 'can_send', arb_id: targetAddress, data: frame }

6. Wait for response promise

7. Parse ISO-TP response:
   -> PCI type 0 (single frame): extract payload
   -> PCI type 1 (first frame): extract partial
   -> Check for 0x7F (negative) or service+0x40 (positive)
```

---

## 9. Transport Layer - Multi-Frame (ISO-TP)

**File:** `pcanConnection.ts` - `sendUDSMultiFrame()`

```text
For payloads > 7 bytes (TransferData chunks of 4094 bytes):

1. Drain stale frames (150ms)

2. Build First Frame (FF):
   [0x10 | (totalLen >> 8), totalLen & 0xFF, data[0..5]]
   Example for 4095 bytes: [10 FF, 36, 00, d0, d1, d2, d3]

3. Set up Flow Control listener BEFORE sending FF
   -> Wait for FC frame: [0x30, BlockSize, STmin, ...]
   -> Timeout: 5000ms
   -> BUSMASTER reference: ECU sends 30 00 F1 (BS=0 unlimited, STmin=241us)

4. Send First Frame via can_send

5. Wait for Flow Control
   -> If no FC: throw error

6. Calculate inter-frame delay from STmin:
   0xF1 = 241us -> use 1ms minimum (JS can't do us)

7. Send Consecutive Frames (CF):
   For each 7-byte chunk of remaining data:
     cf = [0x20 | (seqNum & 0x0F), data[0..6]]
     Send via can_send (fire-and-forget)
     seqNum++ (wraps at 0x0F)
     Wait stMinMs between frames

     If BlockSize > 0 and frames sent >= BlockSize:
       Wait for next FC (5s timeout)

8. Wait for ECU response (30s timeout for first-chunk-after-erase):
   -> Filter for positive (0x76) or negative (0x7F)
   -> NRC 0x78: keep waiting (ECU writing to flash)
   -> Accept single-frame (PCI type 0) or first-frame (PCI type 1) responses
```

---

## 10. Seed/Key Algorithm - AES-128 ECB

**File:** `shared/seedKeyAlgorithms.ts` - `computeGM5B()`

```typescript
async function computeGM5B(seed: Uint8Array, aesKey: Uint8Array): Promise<Uint8Array> {
  // seed = 5 bytes from ECU
  // aesKey = 45AE6BA2CB81F5656B05072D74FF47E0 (16 bytes)

  // Step 1: Build salted seed (16 bytes)
  const saltedSeed = new Uint8Array(16);
  saltedSeed.fill(0xFF);           // Fill with 0xFF
  saltedSeed[0x0B] = seed[0];     // Place seed at offset 11-15
  saltedSeed[0x0C] = seed[1];
  saltedSeed[0x0D] = seed[2];
  saltedSeed[0x0E] = seed[3];
  saltedSeed[0x0F] = seed[4];
  // Result: [FF FF FF FF FF FF FF FF FF FF FF s0 s1 s2 s3 s4]

  // Step 2: AES-128 ECB encrypt
  // Web Crypto doesn't support ECB directly
  // AES-CBC with zero IV on a single 16-byte block = ECB
  const cryptoKey = await crypto.subtle.importKey(
    'raw', aesKey, { name: 'AES-CBC' }, false, ['encrypt']
  );
  const iv = new Uint8Array(16); // zero IV
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv }, cryptoKey, saltedSeed
  );

  // Step 3: Return first 5 bytes of ciphertext
  return new Uint8Array(encrypted).slice(0, 5);
}
```

### Known seed/key pairs (hardcoded lookup)

| ECU | Seed | Key | Label |
|---|---|---|---|
| Bench | `A0 9A 34 9B 06` | `AF 72 2A 51 7E` | HPTuners unlocked |
| Truck | `CE DA F9 83 06` | `59 2E F4 0F 33` | VOP/PPEI unlocked |

---

## 11. TesterPresent Keepalive

**File:** `pcanFlashEngine.ts` - `startKeepalive()` / keepalive timer

```text
GMLAN keepalive:
  Interval: 500ms
  CAN ID: 0x101 (functional broadcast)
  Frame: [FE 01 3E 00 00 00 00 00]  <- UUDT TesterPresent

  Fire-and-forget via WebSocket:
    { type: 'can_send', arb_id: 0x101, data: [0xFE, 0x01, 0x3E, 0, 0, 0, 0, 0] }

  Started: When TesterPresent UUDT command is encountered in SESSION_OPEN (after A5 03)
  Paused: During non-security UDS exchanges (pauseKeepalive/resumeKeepalive)
  NOT paused: During security access (seed probes use 0x7E0, keepalive uses 0x101)
  Stopped: On abort, on key-off, on flash complete
```

---

## 12. Bridge Reconnection

**File:** `pcanFlashEngine.ts` - `reconnectBridge()` and `pcanConnection.ts` - `reconnectForFlash()`

```text
Bridge drops every ~50s (observed in logs).

reconnectBridge():
  1. Check WebSocket readyState
  2. If closed: attempt reconnect (3 tries, 1s/2s/3s delays)
  3. Uses reconnectForFlash() instead of connect():
     -> Closes old WebSocket
     -> Resets UDS monitor state (udsMonitorStarted, monitorActive, listeners)
     -> Cancels pending requests
     -> Opens new WebSocket (tries last successful URL first)
     -> Does NOT run full vehicle initialization (VIN/PID scan)
     -> Sets state to 'ready'
  4. Wait 500ms for bridge to stabilize
```

---

## 13. Summary of Current Failure Point

**Attempt #16 result:** Bootloader completely silent after 36 seed request probes (~230s total).

### What the code does at the failure point

1. Broadcast sequence completes in ~2.26s.
2. Keepalive starts after `A5 03`.
3. `4000ms` delay before first seed request.
4. Seed request sent: `0x7E0 [02 27 01 00 00 00 00 00]`
5. No response on `0x7E8` within `5000ms`.
6. Retry every `3000ms`, 12 attempts.
7. All 12 attempts timeout -> `ECU bootloader did not respond`.
8. `nonFatal` -> engine continues to `BLOCK_TRANSFER`.
9. RequestDownload also times out -> flash fails.

### The question

Why does the bootloader not respond to seed requests after the broadcast puts it in programming mode?
