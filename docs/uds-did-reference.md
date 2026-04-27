# UDS DID Reference (ISO 14229-1:2020)

## Standard F1xx DIDs for ECU Identification

| DID | Name | Description |
|-----|------|-------------|
| 0xF180 | BootSoftwareIdentification | Bootloader Software Identification |
| 0xF181 | applicationSoftwareIdentification | Application Software Identification |
| 0xF182 | applicationDataIdentification | Application Data Identification |
| 0xF183 | bootSoftwareFingerprint | Info about last Bootloader Software update |
| 0xF184 | applicationSoftwareFingerprint | Info about last Application Software update |
| 0xF185 | applicationDataFingerprint | Info about last Application Data update |
| 0xF186 | activeDiagnosticSession | Currently active Diagnostic Session |
| 0xF187 | vehicleManufacturerSparePartNumber | Spare Part Number (OEM) |
| 0xF188 | vehicleManufacturerECUSoftwareNumber | ECU software number (OEM) |
| 0xF189 | vehicleManufacturerECUSoftwareVersionNumber | ECU software version number |
| 0xF18A | systemSupplierIdentifier | Supplier identification |
| 0xF18B | ECUManufacturingDate | ECU manufacturing date |
| 0xF18C | ECUSerialNumber | ECU Serial Number |
| 0xF18D | supportedFunctionalUnits | Functional units implemented |
| 0xF18E | VehicleManufacturerKitAssemblyPartNumber | Assembly kit part number |
| 0xF18F | RegulationXSoftwareIdentificationNumbers | Software ID numbers for legislation |
| 0xF190 | VINDataIdentifier | VIN Number |
| 0xF191 | vehicleManufacturerECUHardwareNumber | ECU hardware number (OEM) |
| 0xF192 | systemSupplierECUHardwareNumber | ECU hardware number (supplier) |
| 0xF193 | systemSupplierECUHardwareVersionNumber | ECU hardware version (supplier) |
| 0xF194 | systemSupplierECUSoftwareNumber | ECU software number (supplier) |
| 0xF195 | systemSupplierECUSoftwareVersionNumber | ECU software version (supplier) |
| 0xF196 | exhaustRegulationOrTypeApprovalNumber | Exhaust regulation/type approval |
| 0xF197 | systemNameOrEngineType | System name or engine type |
| 0xF198 | repairShopCodeOrTesterSerialNumber | Repair shop code/tester serial |
| 0xF199 | programmingDate | Programming date |

## Ford-Specific DIDs (Bosch MG1/EDC17/MD1)

Ford uses standard UDS protocol with Bosch ECUs. Key DIDs:

### ECU Identification
- 0xF190 — VIN (17 bytes ASCII)
- 0xF188 — ECU Software Number (Ford calibration part number)
- 0xF191 — ECU Hardware Number
- 0xF187 — Spare Part Number
- 0xF189 — ECU Software Version Number
- 0xF197 — System Name / Engine Type
- 0xF18C — ECU Serial Number

### Calibration Data
- 0xF181 — Application Software Identification (may contain cal ID)
- 0xF182 — Application Data Identification (calibration data ID)
- 0xF184 — Application Software Fingerprint (last software update info)
- 0xF185 — Application Data Fingerprint (last calibration update info)

### Ford OEM-Specific DIDs (0x0100-0xA5FF range)
Ford uses OEM-specific DIDs in the vehicle manufacturer range. Common ones:
- 0xF111 — ECU Calibration Verification Number (CVN)
- 0xF113 — ECU Calibration Software Identification
- 0xDE00 — Ford Module Configuration
- 0xDE01 — Ford As-Built Data
- 0xDD01 — Ford Module Programming Information

### Ford Calibration Structure
Ford Bosch ECUs typically have fewer calibration segments than GM:
- 1 OS/Application Software block
- 1-3 Calibration data blocks (varies by ECU type)
- EDC17: typically 2 cal blocks
- MG1/MD1: typically 2-3 cal blocks

## Cummins-Specific DIDs

Cummins uses standard UDS protocol. Key DIDs:

### ECU Identification
- 0xF190 — VIN (17 bytes ASCII)
- 0xF188 — ECU Software Number
- 0xF191 — ECU Hardware Number
- 0xF189 — ECU Software Version Number
- 0xF18A — System Supplier Identifier (should return "CUMMINS")
- 0xF197 — Engine Type / System Name

### Cummins OEM-Specific DIDs
- 0xF180 — Boot Software Identification
- 0xF181 — Application Software Identification
- 0xF182 — Application Data Identification (calibration ID)
- 0xF18C — ECU Serial Number (Cummins ESN - Engine Serial Number)
- 0xF18B — ECU Manufacturing Date

### Cummins Calibration Structure
Cummins CM2350/CM2450 ECUs:
- 1 OS/Application block
- 1-2 Calibration data blocks
- Security level 0x05 for seed/key

## OBD-II Mode 9 (Request Vehicle Information)
Available on all OBD-II compliant vehicles:
- PID 0x02 — VIN (17 bytes)
- PID 0x04 — Calibration ID (multiple 16-byte entries)
- PID 0x06 — Calibration Verification Numbers (CVN, 4 bytes each)
- PID 0x0A — ECU Name (20 bytes ASCII)

## Protocol Notes

### Ford Security Access
- Seed Level: 0x01 (standard) or 0x61 (extended)
- Uses standard UDS 0x27 service
- Key algorithm varies by ECU type (Bosch-specific)

### Cummins Security Access
- Seed Level: 0x05
- Uses standard UDS 0x27 service
- Cummins-specific key algorithm

### Session Control
Both Ford and Cummins use standard UDS:
- 0x10 0x01 — Default Session
- 0x10 0x02 — Programming Session
- 0x10 0x03 — Extended Diagnostic Session
