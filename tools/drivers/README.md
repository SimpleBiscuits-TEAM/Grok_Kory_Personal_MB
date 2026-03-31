# PCAN-USB Pro Driver Setup

## Requirements
- **Hardware**: PEAK PCAN-USB Pro (IPEH-004061) or PCAN-USB Pro FD
- **Cable**: PCAN-Cable OBD-2 (IPEH-003044) — standard 16-pin OBD-II to DB9
- **OS**: Windows 10/11 (64-bit)

## Driver Installation

1. Download the PEAK System driver installer:
   - **Bundled**: `PEAK-System_Driver-Setup.zip` (contains `PeakOemDrv.exe`)
   - **CDN**: https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PEAK-System_Driver-Setup_f349ce29.zip
   - **Official**: https://www.peak-system.com/Drivers.523.0.html

2. Extract and run `PeakOemDrv.exe` as Administrator

3. Follow the installation wizard — select "PCAN-USB Pro" when prompted

4. Connect the PCAN-USB Pro via USB — Windows should recognize it immediately

5. Verify installation:
   - Open Device Manager → expand "PEAK-System CAN interfaces"
   - You should see "PCAN-USB Pro" listed with two channels

## Python Bridge Setup

After installing the PEAK drivers, install the Python dependencies:

```bash
pip install python-can websockets
```

Then run the PCAN bridge:

```bash
python pcan_bridge.py --interface pcan --channel PCAN_USBBUS1
```

For dual-channel monitoring:

```bash
python pcan_bridge.py --interface pcan --channel PCAN_USBBUS1 --channel2 PCAN_USBBUS2
```

## Supported Protocols

The PCAN-USB Pro + bridge supports:

| Protocol | Bitrate | Frame Type | Use Case |
|----------|---------|------------|----------|
| OBD-II over CAN | 500 kbps | 11-bit standard | Standard diagnostics, PID scanning |
| J1939 | 250 kbps | 29-bit extended | Heavy-duty diesel, Cummins ISB/ISX |
| UDS (ISO 14229) | 500 kbps | 11-bit standard | ECU flashing, DID read/write |
| CAN FD | Up to 8 Mbps | 11/29-bit, 64-byte | Next-gen ECUs, high-speed data |
| Raw CAN | Configurable | Any | Bus sniffing, reverse engineering |

## Troubleshooting

- **"No PCAN channel found"**: Ensure drivers are installed and device is connected
- **"Bus error"**: Check OBD cable connection and vehicle ignition state
- **"Channel busy"**: Close any other PCAN software (PCAN-View, etc.)
- **Slow frame rate**: Ensure correct bitrate for the protocol (500k for OBD, 250k for J1939)
