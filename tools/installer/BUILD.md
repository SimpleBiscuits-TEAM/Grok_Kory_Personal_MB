# VOP Bridge Installer — Build Instructions

## Overview

This directory contains everything needed to build the **VOP Bridge** Windows installer. The installer bundles Python, PCAN drivers, and the bridge script into a single `.exe` that customers can double-click to install — no command prompt or technical knowledge required.

## Prerequisites

You need a **Windows machine** with [Inno Setup 6](https://jrsoftware.org/isdl.php) installed to compile the installer.

## Step 1: Download Required Files

Place these files in the `build/` folder:

| File | Source | Purpose |
|------|--------|---------|
| `python-3.11.9-embed-amd64.zip` | [python.org/downloads](https://www.python.org/downloads/release/python-3119/) → "Windows embeddable package (64-bit)" | Portable Python runtime |
| `get-pip.py` | [bootstrap.pypa.io/get-pip.py](https://bootstrap.pypa.io/get-pip.py) | pip installer bootstrap |
| `PeakOemDrv.exe` | [PEAK System Drivers](https://www.peak-system.com/Drivers.523.0.html) or bundled CDN copy | PCAN-USB hardware drivers |
| `vop_icon.ico` | Create from PPEI/VOP logo (256x256, .ico format) | Installer and shortcut icon |
| `vop_wizard.bmp` | Create VOP-branded image (164x314 pixels, .bmp) | Installer wizard sidebar |
| `vop_banner.bmp` | Create VOP-branded image (55x55 pixels, .bmp) | Installer header banner |
| `license.txt` | Already included in `build/` | License agreement shown during install |

## Step 2: Extract Python

Extract the `python-3.11.9-embed-amd64.zip` into `build/python-3.11.9-embed-amd64/`:

```
build/
  python-3.11.9-embed-amd64/
    python.exe
    python311.dll
    python311._pth
    python311.zip
    ...
  get-pip.py
  PeakOemDrv.exe
  vop_icon.ico
  vop_wizard.bmp
  vop_banner.bmp
  license.txt
```

## Step 3: Compile the Installer

1. Open `VOP_Bridge_Setup.iss` in Inno Setup
2. Click **Build** > **Compile** (or press Ctrl+F9)
3. The compiled installer will be at: `build/VOP_Bridge_Setup_v2.0.exe`

## Step 4: Test the Installer

1. Run `VOP_Bridge_Setup_v2.0.exe` on a clean Windows machine
2. Verify:
   - Installation completes without errors
   - Desktop shortcut is created
   - PEAK drivers install (if selected)
   - VOP Bridge launches and shows the startup banner
   - System tray icon appears (if auto-start was selected)
   - Bridge connects to VOP web app in browser

## What the Installer Does

The installer performs these steps automatically:

1. Copies embedded Python 3.11 to `C:\Program Files\VOP Bridge\python\`
2. Removes the `._pth` file to enable pip/site-packages
3. Runs `get-pip.py` to install pip
4. Installs `python-can`, `websockets`, and `cryptography` via pip
5. Copies the `pcan_bridge.py` script
6. Optionally installs PEAK PCAN-USB drivers
7. Creates Start Menu and Desktop shortcuts
8. Optionally adds auto-start on Windows login (system tray mode)

## File Structure

```
tools/installer/
├── VOP_Bridge_Setup.iss      ← Inno Setup script (main build file)
├── BUILD.md                  ← This file
├── build/
│   ├── license.txt           ← License agreement
│   ├── (python-3.11.9-embed-amd64/)  ← You download this
│   ├── (get-pip.py)                    ← You download this
│   ├── (PeakOemDrv.exe)               ← You download this
│   ├── (vop_icon.ico)                  ← You create this
│   ├── (vop_wizard.bmp)               ← You create this
│   └── (vop_banner.bmp)               ← You create this
├── scripts/
│   ├── VOP_Bridge.bat        ← Main launcher (console window)
│   ├── VOP_Bridge_Silent.vbs ← Silent launcher (no window)
│   ├── VOP_Bridge_Tray.pyw  ← System tray app with auto-restart
│   ├── install_deps.bat      ← Dependency installer (runs during setup)
│   └── check_status.bat      ← Troubleshooting status checker
└── resources/
    └── QUICKSTART.txt        ← Customer quick-start guide
```

## Updating the Bridge

To update the bridge script:

1. Edit `tools/pcan_bridge.py` as needed
2. Update the version number in `VOP_Bridge_Setup.iss` (`#define MyAppVersion`)
3. Recompile the installer

The Inno Setup script automatically pulls `pcan_bridge.py` from the parent `tools/` directory.
