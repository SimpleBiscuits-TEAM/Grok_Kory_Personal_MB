# HPT Full PID BUSMASTER Analysis

## Key Findings

### Frame Counts
- TX 0x7E0: 6,419 frames
- RX 0x7E8: 5,970 frames
- RX 0x5E8: 0 frames (NO periodic streaming!)
- TX 0x7DF: 36 frames (broadcast)

### CRITICAL: NO DDDI PERIODIC STREAMING
Unlike the fuel-pressure-only log, the full PID log uses **NO DDDI periodic streaming at all**.
- 0 DDDI 0x2C commands
- 0 periodic 0x5E8 frames
- Only 1 0xAA command: `0xAA 0x00` (stop all periodic)

### HPT uses SID 0x23 (ReadMemoryByAddress) instead!
HPT uses **Service 0x23** to read ECU RAM directly, NOT IOCTL 0x2D + DDDI 0x2C.

6 IOCTL 0x2D commands found, but they appear to be initialization/setup only.
The main data reads use **SID 0x23** (ReadMemoryByAddress).

### IOCTL 0x2D Commands (6 total - initialization)
| DID | Control | RAM Address | Bytes |
|-----|---------|-------------|-------|
| 0xFE00 | 0x40 | 02 21 58 | 4 |
| 0xFE01 | 0x40 | 01 BC 8C | 4 |
| 0xFE02 | 0x40 | 01 4F 08 | 4 |
| 0xFE03 | 0x40 | 01 23 D4 | 4 |
| 0xFE04 | 0x40 | 01 1F 18 | 2 |
| 0xFE05 | 0x40 | 01 40 82 | 2 |

### SID 0x23 Commands (ReadMemoryByAddress)
These are the main data reads. Format: `07 23 40 [3-byte RAM addr] 00 [byte count]`
Repeated every polling cycle alongside Mode 22 reads.

Key RAM addresses seen:
- 0x011544 (4 bytes) - repeated frequently
- 0x014A44 (4 bytes) - repeated frequently  
- 0x013B84 (4 bytes) - repeated frequently
- 0x0225D8 (4 bytes) - FRP Desired (same as fuel-only log)
- 0x002124 (4 bytes) - 
- 0x022534 (1 byte) -

### Mode 22 Reads (interleaved with 0x23)
Many Mode 22 DID reads interleaved with SID 0x23 reads:
- 0x005D, 0x0062, 0x30C1, 0x0063, 0x30BC, 0x1337, 0x004A, 0x30BE
- 0x0071, 0x006A, 0x000D, 0x0069, 0x328A, 0x002C, 0x308A, 0x20BC
- 0x000F, 0x007A, 0x1141, etc.

### Session Control
- 2 DiagnosticSessionControl commands (0x10)
- 0 TesterPresent (0x3E) commands!
- HPT keeps session alive through continuous Mode 22 + 0x23 reads

### Summary
The full PID HPT approach is:
1. Switch to extended diagnostic session
2. Send 6 IOCTL 0x2D commands to set up RAM read DIDs
3. Stop all periodic streaming (0xAA 0x00)
4. Poll continuously using interleaved Mode 22 (0x22) + ReadMemoryByAddress (0x23)
5. No DDDI, no periodic streaming, no TesterPresent
6. Pure polling approach with ~200ms cycle time
