# EDC17 Tuning Guide - Key Findings (Image-Based PDF)

## Source: 324638230-EDC17-Tuning-Guide.pdf (29 pages, by VECTRADTI/ecuconnections.com, 2013)
## Target: VAG EDC17 (Audi A4 2.0 TDI, Bosch MED17, SW 396472)

## Map Categories and Addresses (from page 4-5)

### Driver's Wish (Accelerator Pedal to Torque Request)
- 6 maps at addresses 0x1B26CC-0x1B2CD0, each 8x16
- These are the pedal-to-torque request maps (like GM's driver demand tables)

### Driver's Wish Limiter
- 1 map at 0x1A13AA, 8x8
- Caps the maximum torque the driver can request

### EGR (Exhaust Gas Recirculation)
- 5 maps at 0x1B43D2-0x1B5018, each 12x12
- EGR valve position targets as function of RPM and load

### EGR Start Map
- 1 map at 0x1B52C0, 11x12
- EGR behavior during cold start

### EGR in Working
- 1 map at 0x1B56BC, 11x12
- EGR behavior during normal operation

### Torque to IQ Conversion
- 2 maps at 0x1BD364-0x1BD5A8, each 16x16
- Converts torque request (Nm) to injection quantity (mg/stroke)
- CRITICAL for tuning: this is where torque becomes fuel

### Torque Limiter
- 1 map at 0x1C1FCC, 24x4
- Maximum allowed torque as function of RPM and conditions

### Start of Injection (SOI)
- 6 maps at 0x1C9B54-0x1CA1D0, each 10x12
- Injection timing maps - degrees BTDC
- Multiple maps for different operating conditions

### Duration Map
- 1 map at 0x1E16E6, 20x16
- Injection pulse width/duration

### N75 (Turbo Wastegate/VGT Solenoid)
- 5 maps at 0x1E453C-0x1E52E6, sizes 16x15 to 13x16
- Turbo actuator duty cycle maps

### Boost Pressure
- 8 maps at 0x1E6BBE-0x1E7FBE, sizes 16x15 to 13x16
- Target boost pressure maps

### Boost Limiter
- 1 map at 0x1E86C0, 10x16
- Maximum allowed boost pressure

### Single Value Boost Limiter (SVBL)
- 1 value at 0x1C2332
- Absolute maximum boost cutoff

### DPF / FAP
- 3 maps at 0x1EBD2E-0x1EBFA2, each 11x12
- DPF regeneration control maps

### DPF / FAP Off Switches
- 2 values at 0x1EC667-0x1EC668
- DPF enable/disable flags

### Smoke Map
- 2 maps at 0x1EE33A-0x1EE610, 16x11 and 16x12
- Smoke limiter - caps injection quantity to prevent visible smoke

### Smoke Map from Boost
- 1 map at 0x1F55BE, 14x16
- Additional smoke limiting based on boost pressure

### Requested Rail Pressure Offset
- 1 map at 0x1F165C, 16x16
- Rail pressure offset/correction

### Requested Rail Pressure
- 4 maps at 0x1F1CF2-0x1F23BE, each 15x16
- Target rail pressure maps

### Rail Pressure Limiter Offset
- 1 map at 0x1F2C6E, 10x14

### Rail Pressure Limiter
- 1 map at 0x1F2DC6, 10x14

### Start Map
- 2 maps at 0x1F6A62-0x1F6B40, each 10x9
- Cold start fuel maps

## Key Tuning Relationships (for Erika's knowledge)
1. Driver's Wish -> Torque Request -> Torque-to-IQ -> Injection Quantity -> Duration Map
2. Boost Pressure maps set target -> N75 actuates turbo -> Boost Limiter caps maximum
3. Smoke Map limits injection quantity based on available air (prevents black smoke)
4. Rail Pressure maps set fuel pressure -> Rail Pressure Limiter caps maximum
5. SOI maps control injection timing -> affects power, emissions, noise
6. EGR maps control exhaust recirculation -> affects NOx, soot, power
7. DPF maps control regeneration -> soot burning strategy
