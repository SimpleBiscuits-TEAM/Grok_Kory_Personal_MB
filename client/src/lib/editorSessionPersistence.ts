/**
 * Editor Session Persistence
 * 
 * Manages saving and restoring editor state to localStorage.
 * Prevents data loss when user navigates away from editor.
 * 
 * NOTE: Binary data can be 4-8MB+. Base64 encoding inflates ~33%, so a 6MB
 * binary becomes ~8MB base64. localStorage typically has a 5-10MB limit.
 * We store binary data in a separate key and handle quota errors gracefully.
 */

export interface EditorSessionState {
  binaryData: string | null; // Base64 encoded (stored separately for large files)
  binaryFileName: string | null;
  a2lContent: string | null;
  a2lFileName: string | null;
  selectedMapIndex: number | null;
  modifiedMaps: Record<string, string>; // Map name -> hex values
  autoCorrectChecksums: boolean;
  timestamp: number;
}

const SESSION_STORAGE_KEY = 'calibration_editor_session';
const BINARY_STORAGE_KEY = 'calibration_editor_binary';
const A2L_STORAGE_KEY = 'calibration_editor_a2l';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Convert Uint8Array to base64 string in chunks to avoid stack overflow.
 * String.fromCharCode(...array) fails for large arrays because the spread
 * operator pushes every element onto the call stack.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  const CHUNK_SIZE = 8192; // Process 8KB at a time
  let binaryString = '';
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));
    binaryString += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binaryString);
}

/**
 * Save editor state to localStorage.
 * Binary and A2L content are stored in separate keys to maximize
 * the chance of fitting within localStorage quota limits.
 */
export function saveEditorSession(state: Partial<EditorSessionState>): void {
  try {
    const currentSession = getEditorSessionMetadata();
    const newSession = {
      binaryFileName: state.binaryFileName ?? currentSession.binaryFileName,
      a2lFileName: state.a2lFileName ?? currentSession.a2lFileName,
      selectedMapIndex: state.selectedMapIndex ?? currentSession.selectedMapIndex,
      modifiedMaps: state.modifiedMaps ?? currentSession.modifiedMaps,
      autoCorrectChecksums: state.autoCorrectChecksums ?? currentSession.autoCorrectChecksums,
      timestamp: Date.now(),
      hasBinary: false,
      hasA2L: false,
    };

    // Handle binary data — convert Uint8Array to base64 in chunks
    if (state.binaryData !== undefined) {
      if (state.binaryData && typeof state.binaryData !== 'string' && 'length' in state.binaryData) {
        try {
          const base64 = uint8ArrayToBase64(state.binaryData as unknown as Uint8Array);
          localStorage.setItem(BINARY_STORAGE_KEY, base64);
          newSession.hasBinary = true;
        } catch (e) {
          // Likely quota exceeded for large binaries — skip binary persistence
          console.warn('[Editor Session] Binary too large for localStorage, skipping binary persistence');
          // Keep existing binary if present
          if (localStorage.getItem(BINARY_STORAGE_KEY)) {
            newSession.hasBinary = true;
          }
        }
      } else if (typeof state.binaryData === 'string') {
        // Already base64 encoded
        try {
          localStorage.setItem(BINARY_STORAGE_KEY, state.binaryData);
          newSession.hasBinary = true;
        } catch {
          console.warn('[Editor Session] Binary string too large for localStorage');
          if (localStorage.getItem(BINARY_STORAGE_KEY)) {
            newSession.hasBinary = true;
          }
        }
      } else {
        // null — clear binary
        localStorage.removeItem(BINARY_STORAGE_KEY);
      }
    } else {
      // Not provided — keep existing
      newSession.hasBinary = !!localStorage.getItem(BINARY_STORAGE_KEY);
    }

    // Handle A2L content — store separately since it can be 10+ MB
    if (state.a2lContent !== undefined) {
      if (state.a2lContent) {
        try {
          localStorage.setItem(A2L_STORAGE_KEY, state.a2lContent);
          newSession.hasA2L = true;
        } catch {
          console.warn('[Editor Session] A2L too large for localStorage, skipping A2L persistence');
          if (localStorage.getItem(A2L_STORAGE_KEY)) {
            newSession.hasA2L = true;
          }
        }
      } else {
        localStorage.removeItem(A2L_STORAGE_KEY);
      }
    } else {
      newSession.hasA2L = !!localStorage.getItem(A2L_STORAGE_KEY);
    }

    // Save metadata (small — always fits)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  } catch (error) {
    console.error('[Editor Session] Failed to save session:', error);
  }
}

/**
 * Get session metadata (without binary/A2L content)
 */
function getEditorSessionMetadata(): EditorSessionState & { hasBinary: boolean; hasA2L: boolean } {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return { ...getEmptySession(), hasBinary: false, hasA2L: false };
    }
    const session = JSON.parse(stored);
    if (Date.now() - session.timestamp > SESSION_TIMEOUT_MS) {
      clearEditorSession();
      return { ...getEmptySession(), hasBinary: false, hasA2L: false };
    }
    return session;
  } catch {
    return { ...getEmptySession(), hasBinary: false, hasA2L: false };
  }
}

/**
 * Restore editor state from localStorage.
 * Reassembles binary and A2L from their separate storage keys.
 */
export function getEditorSession(): EditorSessionState {
  try {
    const metadata = getEditorSessionMetadata();

    // Check expiry
    if (Date.now() - metadata.timestamp > SESSION_TIMEOUT_MS) {
      clearEditorSession();
      return getEmptySession();
    }

    // Restore binary data from separate key
    const binaryData = metadata.hasBinary ? (localStorage.getItem(BINARY_STORAGE_KEY) || null) : null;

    // Restore A2L content from separate key
    const a2lContent = metadata.hasA2L ? (localStorage.getItem(A2L_STORAGE_KEY) || null) : null;

    return {
      binaryData,
      binaryFileName: metadata.binaryFileName,
      a2lContent,
      a2lFileName: metadata.a2lFileName,
      selectedMapIndex: metadata.selectedMapIndex,
      modifiedMaps: metadata.modifiedMaps || {},
      autoCorrectChecksums: metadata.autoCorrectChecksums ?? true,
      timestamp: metadata.timestamp,
    };
  } catch (error) {
    console.error('[Editor Session] Failed to restore session:', error);
    return getEmptySession();
  }
}

/**
 * Convert base64 binary data back to Uint8Array
 */
export function restoreBinaryData(base64Data: string | null): Uint8Array | null {
  if (!base64Data) return null;

  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.error('[Editor Session] Failed to restore binary data:', error);
    return null;
  }
}

/**
 * Check if there is an active editor session
 */
export function hasActiveSession(): boolean {
  try {
    const metadata = getEditorSessionMetadata();
    const isExpired = Date.now() - metadata.timestamp > SESSION_TIMEOUT_MS;
    return !isExpired && (metadata.hasBinary || metadata.hasA2L);
  } catch {
    return false;
  }
}

/**
 * Check if session has unsaved changes
 */
export function hasUnsavedChanges(): boolean {
  try {
    const metadata = getEditorSessionMetadata();
    return (
      metadata.hasBinary ||
      metadata.hasA2L ||
      Object.keys(metadata.modifiedMaps || {}).length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Clear editor session (all keys)
 */
export function clearEditorSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(BINARY_STORAGE_KEY);
    localStorage.removeItem(A2L_STORAGE_KEY);
  } catch (error) {
    console.error('[Editor Session] Failed to clear session:', error);
  }
}

/**
 * Get empty session state
 */
function getEmptySession(): EditorSessionState {
  return {
    binaryData: null,
    binaryFileName: null,
    a2lContent: null,
    a2lFileName: null,
    selectedMapIndex: null,
    modifiedMaps: {},
    autoCorrectChecksums: true,
    timestamp: Date.now(),
  };
}

/**
 * Get session size in bytes (across all keys)
 */
export function getSessionSize(): number {
  try {
    let total = 0;
    const metaStored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (metaStored) total += new Blob([metaStored]).size;
    const binaryStored = localStorage.getItem(BINARY_STORAGE_KEY);
    if (binaryStored) total += new Blob([binaryStored]).size;
    const a2lStored = localStorage.getItem(A2L_STORAGE_KEY);
    if (a2lStored) total += new Blob([a2lStored]).size;
    return total;
  } catch {
    return 0;
  }
}

/**
 * Get session info for debugging
 */
export function getSessionInfo(): {
  hasSession: boolean;
  sizeKB: number;
  ageMinutes: number;
  hasBinary: boolean;
  hasA2L: boolean;
  modifiedMapsCount: number;
} {
  try {
    const metadata = getEditorSessionMetadata();
    const now = Date.now();
    const ageMs = now - metadata.timestamp;

    return {
      hasSession: hasActiveSession(),
      sizeKB: Math.round(getSessionSize() / 1024),
      ageMinutes: Math.round(ageMs / 60000),
      hasBinary: metadata.hasBinary,
      hasA2L: metadata.hasA2L,
      modifiedMapsCount: Object.keys(metadata.modifiedMaps || {}).length,
    };
  } catch {
    return {
      hasSession: false,
      sizeKB: 0,
      ageMinutes: 0,
      hasBinary: false,
      hasA2L: false,
      modifiedMapsCount: 0,
    };
  }
}
