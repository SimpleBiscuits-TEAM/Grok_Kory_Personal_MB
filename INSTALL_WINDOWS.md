# V-OP — Local setup on Windows (new machine)

Use **Command Prompt (cmd.exe)**, not PowerShell, for the steps below unless noted.  
Replace paths like `C:\Projects\V-OP` with your real folder.

---

## 1. Install Node.js (required)

1. Open a browser and go to: **https://nodejs.org/**
2. Download the **LTS** Windows installer (`.msi`, 64-bit).
3. Run the installer. Leave **“Add to PATH”** checked. Finish the wizard.
4. **Close and reopen** Command Prompt after install (so `PATH` updates).

Verify in **cmd**:

```bat
node -v
npm -v
```

You should see version numbers (for example `v22.x.x` and `10.x.x`). If `node` is not recognized, reboot once and try again.

---

## 2. Get the project files

**Option A — Git (recommended if your team uses Git)**  
Install Git for Windows from **https://git-scm.com/download/win**, then in cmd:

```bat
cd /d C:\Projects
git clone <YOUR_REPO_URL> V-OP
cd /d C:\Projects\V-OP
```

**Option B — ZIP**  
Download the project ZIP, extract it (for example to `C:\Projects\V-OP`), then:

```bat
cd /d C:\Projects\V-OP
```

---

## 3. Install pnpm (package manager this repo expects)

This repo is configured for **pnpm** (not plain `npm install`).

In **cmd**:

```bat
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm -v
```

If `corepack` is not found, use Node’s npm to install pnpm globally:

```bat
npm install -g pnpm@10
pnpm -v
```

---

## 4. Install project dependencies

Still in the project folder:

```bat
cd /d C:\Projects\V-OP
pnpm install
```

Wait until it finishes without errors. First run may take a few minutes.

---

## 5. (Optional) Environment file — database and secrets

The app can **start without** a database, but **many features** (saved data, some APIs) need **MySQL** and a connection string.

1. In the project root, create a file named **`.env`** (same folder as `package.json`).
2. Add at least:

```env
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE_NAME
```

Use your real MySQL user, password, host, port, and database name.  
If you skip this, leave `.env` empty or omit `DATABASE_URL` — the UI may still load, but DB-backed features will not work.

Other variables are optional for a minimal local UI. For **Manus sign-in** (same as hosted WebDev), copy the block from **`.env.example`**: at minimum set **`VITE_APP_ID`** and **`JWT_SECRET`**. The app defaults the OAuth portal to **`https://portal.manus.im`** and the token API to **`https://api.manus.im`** when those URL variables are omitted. Add **`BUILT_IN_FORGE_*`** when you use Knox / LLM features **or** hosted object storage (Manus Forge). **Tune file upload** in development works without Forge: binaries are stored under **`.data/object-storage`** and served via **`/api/dev-object-storage`**. For production without Forge, set **`LOCAL_OBJECT_STORAGE_DIR`** (see **`.env.example`**). The library still needs **MySQL**: set **`DATABASE_URL`** and apply migrations (through **`0006_mysterious_titanium_man`**, which creates **`tune_deploy_calibrations`** and related tables) or uploads will fail after storage with a clear **`DATABASE_NOT_CONFIGURED`** or missing-table message.

---

## 6. Run the development server

```bat
cd /d C:\Projects\V-OP
pnpm run dev
```

When you see a line like `Server running on http://localhost:3000/`, open a browser to:

**http://localhost:3000/**

If port `3000` is busy, the server may pick another port (for example `3001`) — read the line printed in the terminal and use that URL.

Stop the server with **Ctrl+C** in the same cmd window.

---

## 7. PCAN WebSocket bridge (hardware / IntelliSpy / flash)

The browser talks to CAN hardware through a **local Python WebSocket bridge** (`docs/pcan_bridge_current.py`). Node does not start this; run it in a **second** terminal when you need the bridge.

1. Install Python 3 if you do not have it (https://www.python.org/downloads/ — check **Add python.exe to PATH**), or use the **`py`** launcher.
2. Install Python dependencies (once):

```bat
cd /d C:\Projects\V-OP
py -3 -m pip install -r bridge\requirements.txt
```

3. **Trust the self-signed TLS cert once:** open **https://localhost:8766** in Chrome and proceed past the warning (needed for **wss://**).
4. Start the bridge:

```bat
cd /d C:\Projects\V-OP
bridge\run-bridge.cmd
```

Or: `py -3 docs\pcan_bridge_current.py`

You still need **PCAN-USB drivers** (PEAK) and hardware; the pip packages only satisfy the Python side.

---

## Quick reference — copy/paste sequence (after Node is installed)

Adjust `C:\Projects\V-OP` to your path.

```bat
cd /d C:\Projects\V-OP
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
pnpm run dev
```

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| `'node' is not recognized` | Reinstall Node with “Add to PATH”, close all cmd windows, reopen; reboot if needed. |
| `'pnpm' is not recognized` | Run `npm install -g pnpm@10`, close and reopen cmd. |
| `pnpm install` errors / network | Corporate firewall: try from another network or VPN off; run cmd **as Administrator** only if your IT requires it. |
| Port already in use | Close other apps using port 3000, or set `PORT=3001` before `pnpm run dev`: `set PORT=3001` then `pnpm run dev`. |
| Script execution errors in **PowerShell** | Use **cmd** for the commands above, or run `npm.cmd` / full path to `npm.cmd` under `C:\Program Files\nodejs\`. |
| MySQL / `DATABASE_URL` | Install MySQL 8 locally or use Docker; create an empty database; put the URL in `.env`. Run migrations only when your team documents `pnpm run db:push` for your environment. |

---

## What you are not installing for a minimal run

- **Python, Java, Visual Studio** — not required for this Node/Vite app.
- **OAuth / cloud keys** — not required to open the local UI; add later if you wire up real sign-in.

For questions about **MySQL schema** or **production deploy**, use your team’s internal runbook or ask the repo owner.
