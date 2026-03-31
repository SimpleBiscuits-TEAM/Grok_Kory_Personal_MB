; ═══════════════════════════════════════════════════════════════════════════════
; VOP Bridge Installer — Inno Setup Script
; ═══════════════════════════════════════════════════════════════════════════════
;
; Builds a single-click Windows installer that:
;   1. Installs embedded Python 3.11 (portable, no system PATH changes)
;   2. Installs python-can + websockets + cryptography into the embedded env
;   3. Copies the PCAN bridge script
;   4. Bundles PEAK System PCAN drivers (PeakOemDrv.exe)
;   5. Creates a VOP-branded system tray launcher
;   6. Adds a Start Menu shortcut and optional auto-start on login
;   7. Creates an uninstaller
;
; BUILD INSTRUCTIONS:
;   1. Install Inno Setup 6 from https://jrsoftware.org/isdl.php
;   2. Place these files in the build/ folder:
;      - python-3.11.9-embed-amd64.zip  (from python.org/downloads)
;      - get-pip.py                       (from bootstrap.pypa.io)
;      - PeakOemDrv.exe                  (from PEAK System)
;      - vop_icon.ico                    (VOP/PPEI icon, 256x256)
;      - vop_banner.bmp                  (164x314 installer banner)
;      - vop_wizard.bmp                  (164x314 wizard image)
;      - license.txt                     (PPEI license agreement)
;   3. Open this .iss file in Inno Setup and click Build > Compile
;   4. Output: build/VOP_Bridge_Setup_v2.0.exe
;
; ═══════════════════════════════════════════════════════════════════════════════

#define MyAppName "VOP Bridge"
#define MyAppVersion "2.0"
#define MyAppPublisher "PPEI Custom Tuning"
#define MyAppURL "https://www.ppei.ai"
#define MyAppExeName "VOP_Bridge.bat"

[Setup]
AppId={{B7E3F2A1-9C4D-4E8B-A1F0-3D5C7E9B2A4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\VOP Bridge
DefaultGroupName=VOP Bridge
AllowNoIcons=yes
LicenseFile=build\license.txt
OutputDir=build
OutputBaseFilename=VOP_Bridge_Setup_v{#MyAppVersion}
SetupIconFile=build\vop_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardImageFile=build\vop_wizard.bmp
WizardSmallImageFile=build\vop_banner.bmp
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\vop_icon.ico
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to VOP Bridge Setup
WelcomeLabel2=This will install the VOP Bridge on your computer.%n%nThe VOP Bridge connects your PCAN-USB adapter to the VOP web application for real-time vehicle diagnostics, datalogging, and ECU communication.%n%nNo technical knowledge required — just click Install!

[Tasks]
Name: "autostart"; Description: "Start VOP Bridge automatically when Windows starts"; GroupDescription: "Startup Options:"; Flags: checkedonce
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce
Name: "installpeakdrivers"; Description: "Install PEAK PCAN-USB drivers (required for first-time setup)"; GroupDescription: "Hardware Drivers:"; Flags: checkedonce

[Files]
; Python embedded distribution
Source: "build\python-3.11.9-embed-amd64\*"; DestDir: "{app}\python"; Flags: ignoreversion recursesubdirs createallsubdirs
; pip bootstrap
Source: "build\get-pip.py"; DestDir: "{app}\python"; Flags: ignoreversion
; PCAN bridge script
Source: "..\pcan_bridge.py"; DestDir: "{app}"; Flags: ignoreversion
; Launcher scripts
Source: "scripts\VOP_Bridge.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\VOP_Bridge_Silent.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\VOP_Bridge_Tray.pyw"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\install_deps.bat"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\check_status.bat"; DestDir: "{app}\scripts"; Flags: ignoreversion
; PEAK drivers
Source: "build\PeakOemDrv.exe"; DestDir: "{app}\drivers"; Flags: ignoreversion
; Icon
Source: "build\vop_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; README
Source: "resources\QUICKSTART.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
; Start Menu
Name: "{group}\VOP Bridge"; Filename: "{app}\VOP_Bridge.bat"; IconFilename: "{app}\vop_icon.ico"; Comment: "Start VOP Bridge for vehicle diagnostics"
Name: "{group}\VOP Bridge (System Tray)"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\scripts\VOP_Bridge_Tray.pyw"""; IconFilename: "{app}\vop_icon.ico"; Comment: "Start VOP Bridge minimized to system tray"
Name: "{group}\Install PEAK Drivers"; Filename: "{app}\drivers\PeakOemDrv.exe"; Comment: "Install PEAK PCAN-USB hardware drivers"
Name: "{group}\Uninstall VOP Bridge"; Filename: "{uninstallexe}"
; Desktop
Name: "{autodesktop}\VOP Bridge"; Filename: "{app}\VOP_Bridge.bat"; IconFilename: "{app}\vop_icon.ico"; Tasks: desktopicon
; Startup folder (auto-start)
Name: "{userstartup}\VOP Bridge"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\scripts\VOP_Bridge_Tray.pyw"""; IconFilename: "{app}\vop_icon.ico"; Tasks: autostart

[Run]
; Install pip and Python dependencies (runs silently during install)
Filename: "{app}\scripts\install_deps.bat"; Parameters: """{app}"""; StatusMsg: "Installing Python dependencies (python-can, websockets)..."; Flags: runhidden waituntilterminated
; Install PEAK drivers if selected
Filename: "{app}\drivers\PeakOemDrv.exe"; StatusMsg: "Installing PEAK PCAN-USB drivers..."; Tasks: installpeakdrivers; Flags: waituntilterminated
; Launch bridge after install
Filename: "{app}\VOP_Bridge.bat"; Description: "Launch VOP Bridge now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\python\Lib"
Type: filesandordirs; Name: "{app}\python\Scripts"
Type: filesandordirs; Name: "{app}\.certs"
Type: filesandordirs; Name: "{app}\__pycache__"

[Code]
// Custom installer page behavior
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Enable pip in embedded Python by removing the ._pth file restriction
    if FileExists(ExpandConstant('{app}\python\python311._pth')) then
    begin
      DeleteFile(ExpandConstant('{app}\python\python311._pth'));
    end;
  end;
end;
