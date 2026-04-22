# L5P E41 Unsupported PID Analysis

## Key Finding

The 40 "unsupported" PIDs in the screenshot are **correctly** unsupported per the Mode 01 bitmask.
The E41 ECU's bitmask response (0x98790013 / 0x8003A001 / 0xC4C2801D / 0xE9E98343 / 0xE9F20100)
genuinely does NOT support these PIDs in Mode 01.

## Why HP Tuners Shows Them

HP Tuners has **hardcoded channel lists** per ECU calibration. It doesn't rely solely on Mode 01 bitmask
discovery. It knows from its internal database which Mode 22 DIDs the E41 supports, and maps them to
user-friendly names like "IAT", "TPS", etc.

## Unsupported PIDs That Are Gasoline-Only (Not Applicable to Diesel)

These PIDs are genuinely not applicable to the L5P diesel and should remain unsupported:

| PID | Name | Reason |
|-----|------|--------|
| FUEL_SYS | Fuel System Status | Gasoline fuel system (open/closed loop) |
| STFT1/2 | Short Term Fuel Trim | Gasoline O2 feedback |
| LTFT1/2 | Long Term Fuel Trim | Gasoline O2 feedback |
| O2_B1S1-B2S2 | O2 Sensors | Gasoline narrowband O2 |
| LAM_B1S1-B1S2 | Lambda | Gasoline lambda |
| WB_B1S1-B2S2 | Wideband O2 | Gasoline wideband |
| CAT_B1S1-B1S2 | Catalyst Temp | Gasoline catalyst |
| EVAP_PCT | EVAP Purge | Gasoline EVAP system |
| EVAP_VP | EVAP Vapor Pressure | Gasoline EVAP system |
| AIR_STAT | Secondary Air Status | Gasoline secondary air |
| LAMBDA | Commanded Lambda | Gasoline lambda |

## Unsupported PIDs That COULD Be Read via Mode 22

These are diesel-relevant and HP Tuners reads them via Mode 22 DIDs:

| Mode 01 PID | Name | Mode 22 DID | Status |
|-------------|------|-------------|--------|
| 0x0E TIMING | Ignition Timing | N/A | Diesel has no ignition timing |
| 0x0F IAT | Intake Air Temp | 0x0068 (IAT_SENSOR) | **Already supported in Mode 01 PID 0x68** |
| 0x11 TPS | Throttle Position | 0x30BE (Diesel Cmd Throttle) | **Already have Mode 22 DID** |
| 0x0A FRP_A | Fuel Rail Pressure (gauge) | 0x30C1 (FRP Actual HPT) | **Already have Mode 22 DID** |
| 0x22 FRP | Fuel Rail Pressure (diesel) | 0x30C1 (FRP Actual HPT) | **Already have Mode 22 DID** |
| 0x2C EGR_CMD | EGR Commanded | 0x006B (EGR_A) | **Already supported in Mode 01 PID 0x6B** |
| 0x2D EGR_ERR | EGR Error | N/A | Could be computed from cmd vs actual |
| 0x43 ABS_LOAD | Absolute Load | 0x0062 (Actual Torque %) | Related but different |
| 0x45 REL_TPS | Relative TPS | 0x30BE (Diesel Cmd Throttle) | Related |
| 0x92 FPS_B | Fuel Pressure Sensor B | N/A | May not exist on L5P |
| 0x98 FAE | Fuel/Air Equivalence | N/A | Diesel doesn't use this |
| 0x99 GEAR | Current Gear | N/A | TCM PID, not ECM |
| 0x82 EGT2 | EGT Bank 1 Sensor 2 | 0x0581 (EGT Post-Turbo) | **Already have Mode 22 DID** |
| 0x4D MIL_TIME | Time Since MIL On | N/A | Rarely useful for diesel tuning |
| 0x4E CLR_TIME | Time Since Codes Cleared | N/A | Rarely useful for diesel tuning |

## Conclusion

Most "unsupported" PIDs fall into 3 categories:
1. **Gasoline-only** — genuinely not applicable to diesel (O2, lambda, EVAP, catalyst, fuel trim)
2. **Already covered** — we have Mode 22 equivalents (FRP, TPS, EGR, EGT, IAT)
3. **Not useful** — MIL_TIME, CLR_TIME, GEAR, etc.

The real issue is NOT missing PIDs — it's that the **scan shows them as unsupported** which looks bad.
The fix should either:
- Hide gasoline-only PIDs on diesel vehicles, OR
- Show Mode 22 equivalents as the "supported" version of these PIDs
