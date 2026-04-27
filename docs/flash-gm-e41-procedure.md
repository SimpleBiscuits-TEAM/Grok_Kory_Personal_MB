# GM E41 (L5P Duramax) — Flash procedure in Good-Gravy-2 / V-OP

**Document purpose:** Summarize how the **E41** flash path is implemented in this repo (orchestrator + engine + ECU DB), where evidence came from, and **where to improve**.  
**Audience:** Engineers extending flash to more ECUs.  
**Sources:** `shared/ecuDatabase.ts`, `shared/pcanFlashOrchestrator.ts`, `client/src/lib/pcanFlashEngine.ts`, project notes (`todo.md`, BUSMASTER traces).

---

## 1. Role of the E41 in the vehicle

- **E41** is the primary **engine control module** for **GM L5P Duramax** (6.6L diesel).  
- **UDS on CAN** for flash uses **physical addressing** typically **TX `0x7E0` / RX `0x7E8`** (ISO 15765).  
- **Calibration / DAQ** on some platforms may use **XCP** on other IDs (e.g. 1 Mbps) — flash in this app is modeled on **UDS/GMLAN** traces, not XCP.

---

## 2. Where the behavior lives (code map)

| Layer | File | Responsibility |
|--------|------|------------------|
| ECU profile | `shared/ecuDatabase.ts` | `E41` entry: protocol `GMLAN`, `xferSize`, `seedLevel`, CAN IDs, `usesTransferExit`, patch/flash step lists |
| Flash plan (ordered steps, labels, timeouts) | `shared/pcanFlashOrchestrator.ts` | `generateFlashPlan()` — phases, GMLAN broadcast session, security, verification, key cycle, cleanup |
| Execution | `client/src/lib/pcanFlashEngine.ts` | Sends frames, handles **NRC 0x78**, **PriRC**, **TransferData**, **UUDT TesterPresent** keepalive |
| Security key | `client/src/lib/computeSecurityKeyClient.ts` / seed-key pipeline | GM AES-style keying for seed/key (profile-dependent) |
| Container binary | `shared/flashFileValidator.ts`, parsers | Block layout, `rc34`, lengths — must match DevProg / OEM tooling |

---

## 3. E41-specific configuration (`ECU_DATABASE.E41`)

From `shared/ecuDatabase.ts` (conceptual; verify in file for exact values):

- **`protocol: 'GMLAN'`** — Uses **functional broadcast** on **`0x101`** (UUDT `FE …`) for session entry, **not** a naive copy of “standard UDS only on `0x7E0`”.
- **`txAddr: 0x7E0`, `rxAddr: 0x7E8`** — Physical ECM request/response.
- **`xferSize: 0xFFE`** — Matches BUSMASTER **RequestDownload** form **`34 00 00 0F FE`** (per-block format differs from some other GM ECUs using `0xFF8`).
- **`seedLevel: 0x01`** — SecurityAccess level for seed/key (paired with key level `+1` in orchestrator).
- **`usesTransferExit: false`** — Successful **E41** stock flash trace showed **no service `0x37`** across the log; next block’s **`0x34`** implicitly continues. **Do not** force UDS-style `0x37` between blocks for GMLAN E41.
- **`patchNecessary: true`** — Patch pipeline may run before/around main flash per container strategy.

---

## 4. High-level flash phases (orchestrator)

Phases are expressed as `FlashPhase` in `pcanFlashOrchestrator.ts`:  
`PRE_CHECK` → `VOLTAGE_INIT` → `SESSION_OPEN` → `SECURITY_ACCESS` → `PRE_FLASH` / `BLOCK_TRANSFER` → `POST_FLASH` (often skipped GMLAN) → `VERIFICATION` → `KEY_CYCLE` → `CLEANUP`.

### 4.1 GMLAN vs UDS (tester present)

- **Standard UDS** ECUs: **`0x3E 0x00`** on physical address → expect **`0x7E`**.
- **GMLAN E41**: **USDT `0x3E 0x00` on ECM often yields NRC `0x12`** (sub-function not supported). **Keepalive** is **UUDT** on functional address **`0x101`**: **`FE 01 3E`** (cyclic, e.g. 500 ms), **after** the programming-mode steps that bring the ECU into bootloader — **not** before **`0x28` / `A5`** in the reference trace.

### 4.2 SESSION_OPEN — BUSMASTER-derived broadcast sequence (E41 / L5P)

Order and delays were tuned from a **successful stock flash** CAN log (BUSMASTER). Conceptual sequence on **`0x101`** (UUDT):

1. **ReturnToNormal** — `FE 01 20`
2. **ReadDID `0xB0`** (SW versions) — `FE 02 1A B0` (delay after RTN ~1000 ms in plan)
3. **DiagnosticSessionControl programming** — `FE 02 10 02`
4. **DisableNormalCommunication** — `FE 01 28`
5. **ReportProgrammedState** — `FE 01 A2`
6. **ProgrammingMode enable** — `FE 02 A5 01` (then ~1000 ms before next in trace)
7. **ProgrammingMode complete** — `FE 02 A5 03` → ECU transitions toward **bootloader**
8. **Start cyclic UUDT TesterPresent** — `FE 01 3E` (plan includes explicit first shot; engine runs interval)

**Note:** There is **no** separate **physical `0x10 0x02` on `0x7E0`** between broadcast and security in this reference — the functional programming session is the entry path.

### 4.3 SECURITY_ACCESS

- Physical: **`0x27`** seed at `seedLevel`, then key at `seedLevel+1`.
- **GMLAN:** Steps may be marked **`nonFatal`** if seed/key already succeeded in **PRE_CHECK** — post-bootloader seed can **time out** while flash still proceeds (engine safety net).

### 4.4 Erase and RequestDownload (blocks)

- **No standalone RoutineControl erase (`0x31`)** for GMLAN E41 — **`0x31`** has been observed as **NRC `0x11`** (service not supported). **Erase is implicit** in **`0x34`**: expect **NRC `0x78`** (response pending) while the ECU erases, then positive **`0x74`** when ready.
- **PriRC (bootloader entry):** Once per run, engine sends **SendCustomGMPriRC** — ISO-TP single frame **`05 34 00 00 0F FE`** after security, **before** the first per-block **`0x34`** from container `rc34` (see `sendGmBootloaderPriRc()` in `pcanFlashEngine.ts`).
- **Per block:** **`0x34`** → **`0x36`** TransferData chunks → **no `0x37`** for E41 (`usesTransferExit: false`).

### 4.5 POST_FLASH

- **RoutineControl `0x31 0x01 0xFF 0x01`** (check programming dependencies) is **omitted for GMLAN** in the plan (not supported or not used on typical GM ECMs in this flow).

### 4.6 VERIFICATION (after last transfer)

Reference order on physical + functional:

1. **ReturnToNormal** on `0x101` — `FE 01 20`
2. **Finalize** — **`0xAE 0x28 0x80`** on **`0x7E0`** (ECU may stay silent ~12 s — **reboot**)
3. **ReadDID** **`0x90`** (VIN), **`0xC1`…`0xC6`** (calibration IDs), **`0xD0`** (unlock / tuning status), **`0xCC`** (programming counter / CRC-style DID)
4. **ClearDTC** — **`0x04`** on **`0x7DF`** (GMLAN-style clear, not always same as UDS `0x14` framing)

### 4.7 KEY_CYCLE & CLEANUP

- **ECUReset `0x11`** on GMLAN E41 often **NRC `0x11`** — **ignition cycle** does the reset.
- User prompts: **KEY_OFF** → **KEY_ON** → **WAIT_BOOT**.
- **CLEANUP:** **ClearDTC**, **ReturnToNormal** on `0x101` — **no** reliance on **`0x11 0x01`** for E41.

---

## 5. Evidence and parity

- **BUSMASTER** full-stock flash: timing, **absence of `0x37`**, **PriRC** form, **post-flash `0xAE`** sequence.
- **DevProg** (C#) is the **authoritative** container layout reference — TypeScript must stay aligned (`@devprog` rule).
- **Ford / other UDS** profiles use different `flashSequence` and UDS-only steps — compare `FORD_UDS_FLASH_SEQUENCE` vs `GM_FLASH_SEQUENCE` in `ecuDatabase.ts`.

---

## 6. Improvement opportunities (E41-focused)

| Area | Idea |
|------|------|
| **Timing** | Re-validate `delayBeforeMs` against newest GM logs (battery voltage, gateway load). |
| **Security** | Unlocked / HPTuners ECUs may accept **relaxed** keys — document test vs production ECU. |
| **Verification** | Harden DID reads if ECU is slow to boot after `0xAE` (retries, longer timeout). |
| **Multi-block edge cases** | Single-block “cal-only” containers that mark `OS=true` — orchestrator may warn and flash all blocks; confirm UX. |
| **Telemetry** | Structured flash logs for regression: compare frame counts per phase vs golden trace. |

---

## 7. Strategy: many ECUs, many procedures

**Goal:** Reusable **procedure** per ECU without copying unmaintainable one-off code.

1. **Data-driven ECU profile (`EcuConfig`)**  
   - Protocol: `GMLAN` vs `UDS` (+ future: J1939, OEM-specific).  
   - Addresses, `xferSize`, `usesTransferExit`, `seedLevel`, `patchNecessary`, `flashSequence` / `patchSequence`.

2. **Capture ground truth**  
   - Successful flash **CAN log** (BUSMASTER, PCAN, etc.) + **DevProg** container for same strategy.

3. **Map deltas to branches**  
   - If only **timing** differs: adjust `delayBeforeMs` / timeouts in **`generateFlashPlan`** or per-ECU overrides (new optional field on `EcuConfig` if needed).  
   - If **services** differ: add `if (ecuType === 'X')` or prefer **`ecuConfig.flashHooks`** style flags (e.g. `skipTransferExit`, `postFlashVerificationDids`).

4. **Single execution path**  
   - **`pcanFlashEngine`** should stay the **one** place for NRC `0x78`, PriRC, keepalive — avoid duplicating in bridge-only code.

5. **Regression tests**  
   - Simulator / unit tests on **`generateFlashPlan`** for each ECU: expected command count, presence/absence of `0x37`, phase order.

6. **Documentation**  
   - One **markdown + exported PDF** per “reference ECU” (like this document) when the procedure stabilizes.

---

## 8. Revision history (manual)

| Date | Note |
|------|------|
| 2026-04-14 | Generated from codebase review (orchestrator + ecuDatabase + flash engine). |

---

*End of document.*
