' ═══════════════════════════════════════════════════════════════════════
' VOP Bridge — Silent Launcher (no console window)
' Used for auto-start on login — runs the bridge hidden in background
' ═══════════════════════════════════════════════════════════════════════

Dim WshShell, appDir, pythonExe, bridgeScript

Set WshShell = CreateObject("WScript.Shell")

' Get the directory this script is in
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

pythonExe = appDir & "python\pythonw.exe"
bridgeScript = appDir & "pcan_bridge.py"

' Launch bridge silently (pythonw.exe = no console window)
WshShell.Run """" & pythonExe & """ """ & bridgeScript & """", 0, False

Set WshShell = Nothing
