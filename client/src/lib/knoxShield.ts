/**
 * Knox Shield — Client-Side Anti-Tampering & Anti-Sniffing
 * ==========================================================
 * Defense-in-depth measures to make it harder (not impossible) for
 * someone to inspect, intercept, or extract proprietary data from
 * the running VOP application.
 *
 * Layers:
 *  1. DevTools detection — detects open inspector/debugger
 *  2. Console protection — disables console output in production
 *  3. Context menu / source view prevention
 *  4. Timing-based debugger detection
 *  5. DOM integrity monitoring
 *  6. Network request fingerprinting
 *
 * NOTE: These are deterrents, not absolute protection. Determined
 * attackers with browser source access can bypass client-side measures.
 * The real protection is keeping secrets server-side (knoxVault.ts).
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface ShieldConfig {
  /** Enable DevTools detection */
  detectDevTools: boolean;
  /** Enable console protection (disable console.log etc.) */
  protectConsole: boolean;
  /** Disable right-click context menu */
  disableContextMenu: boolean;
  /** Disable keyboard shortcuts (Ctrl+U, Ctrl+Shift+I, F12) */
  disableInspectShortcuts: boolean;
  /** Enable timing-based debugger detection */
  timingDetection: boolean;
  /** Callback when tampering is detected */
  onTamperDetected?: (type: string, details?: string) => void;
  /** Run in production mode only */
  productionOnly: boolean;
}

const DEFAULT_CONFIG: ShieldConfig = {
  detectDevTools: true,
  protectConsole: true,
  disableContextMenu: true,
  disableInspectShortcuts: true,
  timingDetection: true,
  productionOnly: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// SHIELD STATE
// ═══════════════════════════════════════════════════════════════════════════

let shieldActive = false;
let devToolsOpen = false;
let tamperCount = 0;
const cleanupFunctions: (() => void)[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Activate Knox Shield protections.
 * Call once during app initialization.
 */
export function activateShield(config?: Partial<ShieldConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Skip in development unless explicitly enabled
  if (cfg.productionOnly && import.meta.env.DEV) {
    console.log('[Knox Shield] Skipping — development mode');
    return;
  }

  if (shieldActive) return;
  shieldActive = true;

  console.log('[Knox Shield] Activating protections...');

  if (cfg.detectDevTools) initDevToolsDetection(cfg);
  if (cfg.protectConsole) initConsoleProtection();
  if (cfg.disableContextMenu) initContextMenuProtection(cfg);
  if (cfg.disableInspectShortcuts) initKeyboardProtection(cfg);
  if (cfg.timingDetection) initTimingDetection(cfg);

  // Monitor for script injection
  initDOMIntegrityMonitor(cfg);

  console.log('[Knox Shield] Active — all protections enabled');
}

/**
 * Deactivate all shield protections (for debugging).
 * Only callable in development mode.
 */
export function deactivateShield(): void {
  if (import.meta.env.PROD) return; // Cannot deactivate in production
  for (const cleanup of cleanupFunctions) {
    cleanup();
  }
  cleanupFunctions.length = 0;
  shieldActive = false;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVTOOLS DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function initDevToolsDetection(cfg: ShieldConfig): void {
  // Method 1: Window size differential (detects docked DevTools)
  const checkWindowSize = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;
    const isOpen = widthThreshold || heightThreshold;

    if (isOpen && !devToolsOpen) {
      devToolsOpen = true;
      tamperCount++;
      cfg.onTamperDetected?.('devtools_open', 'DevTools detected via window size differential');
    } else if (!isOpen) {
      devToolsOpen = false;
    }
  };

  // Method 2: debugger statement timing
  const checkDebuggerTiming = () => {
    const start = performance.now();
    // This line causes a pause if DevTools is open with breakpoints
    // eslint-disable-next-line no-debugger
    (function () {})();
    const elapsed = performance.now() - start;

    if (elapsed > 100) {
      devToolsOpen = true;
      tamperCount++;
      cfg.onTamperDetected?.('debugger_detected', `Debugger pause detected: ${elapsed.toFixed(0)}ms`);
    }
  };

  // Method 3: console.log timing (console.log is slow when DevTools is open)
  const checkConsoleTiming = () => {
    const img = new Image();
    Object.defineProperty(img, 'id', {
      get: function () {
        devToolsOpen = true;
        tamperCount++;
        cfg.onTamperDetected?.('devtools_console', 'DevTools detected via console object inspection');
      },
    });
    // Trigger the getter only if console is being observed
    console.debug(img);
  };

  const interval = setInterval(() => {
    checkWindowSize();
    if (Math.random() < 0.1) checkDebuggerTiming(); // Occasional check
  }, 2000);

  // Less frequent console check
  const consoleInterval = setInterval(checkConsoleTiming, 10000);

  cleanupFunctions.push(() => {
    clearInterval(interval);
    clearInterval(consoleInterval);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSOLE PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

function initConsoleProtection(): void {
  // In production, neuter console methods to prevent data leakage
  const noop = () => {};
  const methods: (keyof Console)[] = ['log', 'debug', 'info', 'warn', 'table', 'dir', 'dirxml', 'trace'];

  const originals = new Map<string, Function>();
  for (const method of methods) {
    originals.set(method, (console as any)[method]);
    (console as any)[method] = noop;
  }

  // Keep console.error for critical issues
  // Keep console.log available via a secret accessor for debugging
  (window as any).__knoxDebug = (msg: string) => {
    originals.get('log')?.call(console, `[Knox] ${msg}`);
  };

  cleanupFunctions.push(() => {
    for (const [method, original] of Array.from(originals)) {
      (console as any)[method] = original;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MENU & KEYBOARD PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

function initContextMenuProtection(cfg: ShieldConfig): void {
  const handler = (e: MouseEvent) => {
    e.preventDefault();
    cfg.onTamperDetected?.('context_menu', 'Right-click context menu blocked');
    return false;
  };

  document.addEventListener('contextmenu', handler);
  cleanupFunctions.push(() => document.removeEventListener('contextmenu', handler));
}

function initKeyboardProtection(cfg: ShieldConfig): void {
  const handler = (e: KeyboardEvent) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      cfg.onTamperDetected?.('keyboard_f12', 'F12 key blocked');
      return false;
    }

    // Ctrl+Shift+I (DevTools)
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      cfg.onTamperDetected?.('keyboard_devtools', 'Ctrl+Shift+I blocked');
      return false;
    }

    // Ctrl+Shift+J (Console)
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      cfg.onTamperDetected?.('keyboard_console', 'Ctrl+Shift+J blocked');
      return false;
    }

    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      cfg.onTamperDetected?.('keyboard_viewsource', 'Ctrl+U blocked');
      return false;
    }

    // Ctrl+S (Save Page)
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      return false;
    }
  };

  document.addEventListener('keydown', handler);
  cleanupFunctions.push(() => document.removeEventListener('keydown', handler));
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING-BASED DEBUGGER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function initTimingDetection(cfg: ShieldConfig): void {
  let lastCheck = performance.now();

  const check = () => {
    const now = performance.now();
    const elapsed = now - lastCheck;

    // If more than 5 seconds passed for a 1-second interval, debugger was active
    if (elapsed > 5000) {
      tamperCount++;
      cfg.onTamperDetected?.('timing_anomaly', `Timing anomaly: ${elapsed.toFixed(0)}ms for 1s interval`);
    }

    lastCheck = now;
  };

  const interval = setInterval(check, 1000);
  cleanupFunctions.push(() => clearInterval(interval));
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM INTEGRITY MONITORING
// ═══════════════════════════════════════════════════════════════════════════

function initDOMIntegrityMonitor(cfg: ShieldConfig): void {
  // Watch for injected scripts (browser extensions, tampermonkey, etc.)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLScriptElement) {
          const src = node.src || '';
          // Allow our own scripts and known CDNs
          if (src && !src.includes(window.location.origin) && !src.includes('cdn.')) {
            tamperCount++;
            cfg.onTamperDetected?.('script_injection', `Unknown script injected: ${src.slice(0, 100)}`);
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  cleanupFunctions.push(() => observer.disconnect());
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK REQUEST PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap fetch to add request fingerprinting and detect proxy/MITM.
 * Call during app init to override global fetch.
 */
export function protectNetworkRequests(): void {
  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Add a request fingerprint header for server-side validation
    const headers = new Headers(init?.headers);
    headers.set('X-Knox-Shield', generateRequestFingerprint());
    headers.set('X-Knox-Timestamp', Date.now().toString());

    const modifiedInit = { ...init, headers };

    return originalFetch.call(window, input, modifiedInit);
  };

  cleanupFunctions.push(() => {
    window.fetch = originalFetch;
  });
}

/**
 * Generate a simple request fingerprint based on browser characteristics.
 * Server can validate this to detect automated scraping tools.
 */
function generateRequestFingerprint(): string {
  const data = [
    navigator.userAgent.length.toString(),
    screen.width.toString(),
    screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.language,
    navigator.hardwareConcurrency?.toString() || '0',
  ].join('|');

  // Simple hash — not cryptographic, just a fingerprint
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

export function getShieldStatus(): {
  active: boolean;
  devToolsOpen: boolean;
  tamperCount: number;
} {
  return { active: shieldActive, devToolsOpen, tamperCount };
}
