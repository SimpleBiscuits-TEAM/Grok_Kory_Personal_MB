# Dry Run Log #3 Analysis

## Key Findings

### What's Working
- Bridge connects (5.5s)
- GMLAN protocol correctly detected for E41
- TesterPresent gets NRC 0x31 (requestOutOfRange) — ECU is responding
- ECU HW Number (UDS 0xF195) gets NRC 0x31 — ECU is on the bus
- Seed received successfully: `57 09 FD 6C 06` (5 bytes) on level 0x01
- Verification GMLAN ReadDID 0x1A 0x90 gets response: `90 31 47 54 31` (partial VIN "1GT1")
- Return to Normal Mode (0x20) works
- Dry run completes end-to-end

### Bugs Still Present

1. **GMLAN ReadDID timeouts during pre-check (DIDs 0xB0, 0xC1, 0x90, 0xA0)**
   - All 4 GMLAN DIDs timeout during pre-check phase
   - But 0x1A 0x90 works later in VERIFICATION phase!
   - Root cause: ECU may need to be in a specific session, or the pre-check sends too many requests too fast

2. **"Cannot read properties of undefined (reading 'toString')" crash**
   - Still happens on Send Key (line 96-102) and RequestDownload (line 108-117)
   - The fix from the previous round didn't take effect, or there's another code path

3. **Seed/key not computed — "No seed/key algorithm or pre-computed key available"**
   - The scanner used seed sub-function 0x01 (correct for GMLAN E41)
   - But the key computation failed because no container pri_key was available
   - The E41 security profile says seedSubFunction=0x09, but the actual ECU responded to 0x01
   - This is because HPTuners-unlocked ECU may use level 1 instead of level 9

4. **Stale response on ECU Reset and Key Cycle ReadDID**
   - ECU Reset (0x11 0x01) at line 138: response is `90 31 47 54 31` — this is the VIN response from the previous ReadDID, NOT an ECU reset response
   - Key Cycle ReadDID (0x1A 0x90) at line 172: gets NRC 0x12 (subFunctionNotSupported)
   - The response buffer is not being cleared between commands

5. **Clear DTCs timeout on physical address**
   - 0x14 FF FF FF on 0x7E0 times out
   - May need functional address or different service

### Critical Issue: Response Buffer Contamination
The ECU Reset response at line 140-141 shows `RX: 0x7E8 90 31 47 54 31` which is clearly the VIN data from the previous GMLAN ReadDID at line 129. This means:
- The response listener is picking up stale/buffered responses
- OR the ECU is echoing the previous response
- Need to flush the response buffer between commands
