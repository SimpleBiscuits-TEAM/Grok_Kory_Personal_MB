"""
VOP Bridge — System Tray Application
=====================================

Runs the PCAN bridge in the background with a system tray icon.
Right-click the tray icon for options:
  - Show Status
  - Open VOP (browser)
  - Restart Bridge
  - Stop & Exit

This script uses only standard library modules + pystray (installed during setup).
If pystray is not available, falls back to running the bridge directly.
"""

import os
import sys
import subprocess
import threading
import time
import webbrowser
import signal
from pathlib import Path

# Paths
APP_DIR = Path(__file__).parent.parent  # Up from scripts/ to app root
PYTHON_EXE = APP_DIR / 'python' / 'python.exe'
BRIDGE_SCRIPT = APP_DIR / 'pcan_bridge.py'
LOG_FILE = APP_DIR / 'bridge.log'
VOP_URL = 'https://www.ppei.ai'

# Bridge process handle
bridge_process = None
bridge_running = False


def start_bridge():
    """Start the PCAN bridge subprocess."""
    global bridge_process, bridge_running

    if bridge_process and bridge_process.poll() is None:
        return  # Already running

    try:
        with open(LOG_FILE, 'a') as log:
            log.write(f'\n{"="*60}\n')
            log.write(f'VOP Bridge started at {time.strftime("%Y-%m-%d %H:%M:%S")}\n')
            log.write(f'{"="*60}\n\n')

        bridge_process = subprocess.Popen(
            [str(PYTHON_EXE), str(BRIDGE_SCRIPT)],
            cwd=str(APP_DIR),
            stdout=open(LOG_FILE, 'a'),
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        )
        bridge_running = True
    except Exception as e:
        bridge_running = False
        with open(LOG_FILE, 'a') as log:
            log.write(f'ERROR starting bridge: {e}\n')


def stop_bridge():
    """Stop the PCAN bridge subprocess."""
    global bridge_process, bridge_running

    bridge_running = False
    if bridge_process and bridge_process.poll() is None:
        bridge_process.terminate()
        try:
            bridge_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            bridge_process.kill()
    bridge_process = None


def restart_bridge():
    """Restart the bridge."""
    stop_bridge()
    time.sleep(1)
    start_bridge()


def get_status():
    """Get bridge status string."""
    if bridge_process and bridge_process.poll() is None:
        return f'VOP Bridge is RUNNING (PID: {bridge_process.pid})'
    elif bridge_process:
        return f'VOP Bridge STOPPED (exit code: {bridge_process.returncode})'
    else:
        return 'VOP Bridge is NOT RUNNING'


def open_vop():
    """Open VOP in the default browser."""
    webbrowser.open(VOP_URL)


def open_log():
    """Open the log file."""
    if LOG_FILE.exists():
        os.startfile(str(LOG_FILE))


def run_with_tray():
    """Run with system tray icon using pystray."""
    try:
        import pystray
        from PIL import Image
    except ImportError:
        # pystray not available — run bridge directly in console
        print('pystray not installed. Running bridge directly...')
        print('To get the system tray icon, run: pip install pystray pillow')
        run_without_tray()
        return

    # Create a simple VOP icon (red circle with white V)
    icon_path = APP_DIR / 'vop_icon.ico'
    if icon_path.exists():
        try:
            icon_image = Image.open(str(icon_path))
        except Exception:
            icon_image = create_default_icon()
    else:
        icon_image = create_default_icon()

    def on_status(icon, item):
        """Show status notification."""
        status = get_status()
        icon.notify(status, 'VOP Bridge')

    def on_open_vop(icon, item):
        open_vop()

    def on_restart(icon, item):
        icon.notify('Restarting bridge...', 'VOP Bridge')
        restart_bridge()
        time.sleep(2)
        icon.notify(get_status(), 'VOP Bridge')

    def on_open_log(icon, item):
        open_log()

    def on_exit(icon, item):
        stop_bridge()
        icon.stop()

    # Build tray menu
    menu = pystray.Menu(
        pystray.MenuItem('VOP Bridge v2.0', None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Show Status', on_status),
        pystray.MenuItem('Open VOP in Browser', on_open_vop),
        pystray.MenuItem('View Log File', on_open_log),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Restart Bridge', on_restart),
        pystray.MenuItem('Stop && Exit', on_exit),
    )

    icon = pystray.Icon('VOP Bridge', icon_image, 'VOP Bridge', menu)

    # Start bridge in background thread
    def bridge_thread():
        start_bridge()
        # Monitor and auto-restart if it crashes
        while bridge_running:
            time.sleep(5)
            if bridge_process and bridge_process.poll() is not None:
                # Bridge crashed — restart after delay
                time.sleep(3)
                if bridge_running:  # Check again in case user stopped it
                    start_bridge()

    threading.Thread(target=bridge_thread, daemon=True).start()

    # Show notification on start
    def on_setup(icon):
        icon.visible = True
        icon.notify('VOP Bridge is running. Right-click for options.', 'VOP Bridge')

    icon.run(setup=on_setup)


def create_default_icon():
    """Create a simple default icon if .ico file is missing."""
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Red circle
    draw.ellipse([4, 4, 60, 60], fill=(220, 38, 38, 255))
    # White "V"
    draw.polygon([(20, 18), (32, 48), (44, 18), (38, 18), (32, 38), (26, 18)], fill=(255, 255, 255, 255))
    return img


def run_without_tray():
    """Fallback: run bridge directly without system tray."""
    start_bridge()
    try:
        while True:
            if bridge_process and bridge_process.poll() is not None:
                print(f'Bridge exited with code {bridge_process.returncode}. Restarting in 5s...')
                time.sleep(5)
                start_bridge()
            time.sleep(1)
    except KeyboardInterrupt:
        stop_bridge()


if __name__ == '__main__':
    run_with_tray()
