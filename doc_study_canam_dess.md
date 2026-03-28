# CAN-am DESS Key System Research

## RF D.E.S.S. System Overview (from BRP official docs)

### Components
- ECM, D.E.S.S. key (inside tether cord cap), engine cut-off switch
- D.E.S.S. key contains a magnet and RFID chip
- Magnet closes hall effect switch inside engine cut-off switch
- RFID chip contains unique digital code (13.56 MHz NFC)
- Equivalent of tooth-pattern cut on conventional ignition key

### How It Works
- Engine starts only if tether cord cap is on engine cut-off switch AND D.E.S.S. key is recognized as valid by ECM
- Up to 8 D.E.S.S. keys can be programmed in ECM memory using BuDS2
- Keys can be erased individually
- Same key can be used on another vehicle (needs programming for that vehicle)

### Key Types
- Normal key: Yellow or Black float
- Learning key: Green float (limits speed to 25mph, no torque limit)
- 5 speed settings available for learning key mode (default: setting 3)

### Beeper Codes
- 0.5 sec beep every 5 sec = reading key
- 2 short beeps = key recognized
- 1 sec beep every 5 sec = key NOT recognized

### Key Settings
- Can only change key settings when engine is NOT running
- Settings managed via INTELLI-GENT THROTTLE CONTROL (ITC) subsection

## VIN Change Procedure (from forums and BuDS Megatech)
- BuDS2 Megatech license required for VIN/Model change
- VIN stored in ECM via WriteDataByIdentifier (DID 0xF190)
- Model number also stored (separate DID)
- Requires security access level 3 ($27 03/04)
- After VIN change, DESS keys must be re-learned

## Key Programming via BuDS2
1. Connect vehicle to BuDS2
2. Select "Keys" tab
3. Install RF DESS key on RF DESS post
4. Click "Add Key" in BuDS2
5. BuDS2 sends security access, then writes key data to ECM
6. Up to 8 keys can be stored
7. Keys can be individually erased

## UDS Sequence for VIN Write (reconstructed from seed/key source + BuDS behavior)
1. DiagnosticSessionControl ($10 03) - Extended session
2. SecurityAccess ($27 03) - Request seed (16-bit)
3. Compute key using CAN-am algorithm (cuakeyA/cucakeysB lookup tables)
4. SecurityAccess ($27 04 + key) - Send key
5. WriteDataByIdentifier ($2E F190 + VIN bytes) - Write new VIN
6. ECUReset ($11 01) - Reset ECU
7. Re-learn DESS keys after VIN change

## UDS Sequence for DESS Key Learn (reconstructed)
1. DiagnosticSessionControl ($10 03) - Extended session
2. SecurityAccess ($27 03) - Request seed
3. Compute and send key ($27 04)
4. Place DESS key on RF post
5. RoutineControl ($31 01 xxxx) - Start key learn routine
6. Wait for routine completion
7. RoutineControl ($31 03 xxxx) - Get routine result
8. Repeat for additional keys

## CAN-am ECU Details
- Most modern CAN-am use Bosch ECU (MED17 variants for gas, EDC17 for diesel)
- CAN bus: 500kbps, 11-bit standard addressing
- ECM typically at 0x7E0/0x7E8 (standard OBD)
- Some models use 0x7A0/0x7A8 for ECM
- Cluster/gauge at separate address


## DESS Key Recognition Procedure (Official BRP)
1. Briefly press START/STOP button to wake up ECM
2. Securely install tether cord on watercraft/ATV engine cut-off switch
3. Press and hold START/STOP button to start engine

## Programming DESS Keys (Official BRP via BuDS2)
1. Connect vehicle to BRP diagnostic software (BuDS2)
2. Briefly press START/STOP button to power the ECM
3. Install a tether cord on the engine cut-off switch to program a DESS key

## Troubleshooting
- "No beep code when key installed, engine cannot start" = Defective engine cut-off switch
- "No beep code when key installed, engine CAN start" = Defective gauge beeper
- "Gauge displays READING KEY and no key on switch" = Gauge shuts down after 3 minutes, defective cut-off switch
- "Key not read with magnet on DESS post" = Damaged RFID chip, no voltage at RFID-D/C connector
- "Invalid key" = Key not programmed to ECM, need to program key

## Key Points for Implementation
- RFID operates at 13.56 MHz NFC
- ECM stores up to 8 key codes
- Each key has a unique digital code in RFID chip
- Key type (Normal/Learning) determines speed/torque limits
- BuDS2 communicates via CAN bus to ECM for key management
- Security access required before key write operations


## Detailed DESS Key Programming Steps (from BuDS2 official doc)

### Adding Keys
1. Connect vehicle to BuDS2
2. Power ECM (START/STOP)
3. Install tether cord on engine cut-off switch
4. Go to the key page in BuDS2
5. Ensure anti-theft system is activated (activate it first if not)
6. Install new key on the D.E.S.S. post
7. Press the READ button (top right of the table)
8. Select key type (Normal or Learning)
9. Press ADD button to register the key
10. New key should be displayed in the table
11. Repeat steps 6-9 to add other keys (up to 8 total)

### Erasing Keys
1. Install the tether cord on the engine cut-off switch
2. Click on "Erase Key"
3. After approximately 10 seconds, message: "The key is now erased"

### Physical RFID Connector Pins
- RFID-A connector: Ground
- RFID-B connector: Voltage
- RFID-C connector: Voltage
- RFID-D connector: Voltage/Data

### Key Implementation Notes for Our Logger
- The DESS key system communicates via the RFID connector on the D.E.S.S. post
- ECM handles the RFID read/write through the RFID connector
- BuDS2 communicates with ECM via CAN bus
- BuDS2 tells ECM to read the key on the post, then stores the key code
- We need: CAN bus access to ECM + security access + the key management DIDs
- Key management is done through specific DIDs (not standard F190 VIN DID)
- Anti-theft must be activated before key programming


## CAN-am ECU Hardware (from bFlash article)

### ECU Types
- **Bosch MED17.8.5** — older CAN-am models (Maverick 1000R, older Outlander, etc.)
- **Bosch MG1CA920** — newer CAN-am models (latest X3 series, 2020+)
  - MG1CA920 is harder to tune than MED17.8.5
  - bFlash was first to market with MG1CA920 support

### Engine Types
- Rotax 3-cylinder turbo (Maverick X3)
- Rotax 2-cylinder V-twin (Outlander, Commander, Defender)

### Flash via OBD
- Stock Bosch calibration can be rewritten via flash capability
- Plug into factory connector, flash ECU, plug out
- Can be reverted to stock by flashing original file
- No external piggyback units needed

### Key Tuning Parameters
- Fuel injection maps
- Ignition timing (+4-5 degrees on pump gas)
- Boost targets (turbo models)
- Rev limits (can raise 500-1000 RPM)
- Speed limits (can be removed)
- Shaft saver delete (first-gear torque limiter removal)
- E-gas/throttle curves
- Fan control thresholds (165-180F instead of factory high threshold)
- Altitude/load compensation maps

### Implications for Our Tool
- MED17.8.5 uses the same seed/key algorithm as in our source code (SK_FORD_MG1 variant likely)
- MG1CA920 may use a different/updated security access method
- Both ECUs support UDS protocol over CAN bus
- VIN is stored in ECU and can be changed via WriteDataByIdentifier
- DESS key data is stored in ECU memory
- Flash read/write is possible via RequestDownload/TransferData/RequestTransferExit


## BuDS2 Megatech License Features (from official BuDS manual)

### 1. VIN and Model Number Change
- Vehicle (VIN) field: editable text field (e.g., "ABC1234567890")
- Engine serial number: editable (e.g., "M1234567")
- Model number: editable (e.g., "123465678")
- All three are on the "Vehicle" tab in BuDS

### 2. Advanced Settings (Logistic Programming Bytes)
The "Advanced" tab shows raw ECU configuration bytes:
- **Byte 0**: Vehicle type
- **Byte 1**: Platform
- **Byte 2**: Engine type
- **Byte 3**: Variant
- **Byte 4**: Model MSB
- **Byte 5**: Model
- **Byte 6**: Model
- **Byte 7**: Model LSB

**Logistic Programming Byte 1 (bit flags):**
- Bit 0: Supercharger Fit
- Bit 1: iS Fit
- Bit 2: iBR
- Bit 3: CLU or Inter (Inter = 1)
- Bit 4: Fuel tank config bit 1
- Bit 5: Fuel tank config bit 2
- Bit 6: SPORT BALLAST
- Bit 7: Spare

**Logistic Programming Byte 2 (bit flags):**
- Bit 0: CRUISE + SLOW SPEED
- Bit 1: SkiMODE
- Bit 2: Fuel Autonomy
- Bit 3: TopAvr Spd/RPM, LAP
- Bit 4: Altitude
- Bit 5: VTS Switch
- Bit 6: Spare
- Bit 7: Spare

**Buttons at bottom:** "ECM Coding" and "ECM Coding2" — these write the configuration to ECU

### 3. View stories in hours (not percentage)

### Key Insight: ECM Coding
- The "ECM Coding" button writes all the logistic programming bytes to the ECU
- This is done via WriteDataByIdentifier to specific DIDs
- The VIN/Model/Engine serial are separate DIDs
- The logistic programming bytes are likely a single DID or a few DIDs
- This means we need to identify the specific DIDs for:
  - VIN (likely 0xF190 - standard UDS)
  - Engine serial (likely 0xF18C - standard UDS)
  - Model number (manufacturer-specific DID)
  - Logistic programming bytes (manufacturer-specific DID)
  - ECM Coding data (manufacturer-specific DID)
