/**
 * Editor Session Persistence
 * 
 * Manages saving and restoring editor state to localStorage
 * Prevents data loss when user navigates away from editor
 */

export interface EditorSessionState {
  binaryData: string | null; // Base64 encoded
  binaryFileName: string | null;
  a2lContent: string | null;
  a2lFileName: string | null;
  selectedMapIndex: number | null;
  modifiedMaps: Record<string, string>; // Map name -> hex values
  autoCorrectChecksums: boolean;
  timestamp: number;
}

const SESSION_STORAGE_KEY = 'calibration_editor_session';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save editor state to localStorage
 */
export function saveEditorSession(state: Partial<EditorSessionState>): void {
  try {
    const currentSession = getEditorSession();
    const newSession: EditorSessionState = {
      ...currentSession,
      ...state,
      timestamp: Date.now(),
    };

    // Convert binary data to base64 for storage
    if (state.binaryData && typeof state.binaryData !== 'string' && 'length' in state.binaryData) {
      const binaryArray = Array.from(state.binaryData as Uint8Array);
      const binaryString = String.fromCharCode(...binaryArray);
      newSession.binaryData = btoa(binaryString);
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  } catch (error) {
    console.error('[Editor Session] Failed to save session:', error);
  }
}

/**
 * Restore editor state from localStorage
 */
export function getEditorSession(): EditorSessionState {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return getEmptySession();
    }

    const session = JSON.parse(stored) as EditorSessionState;

    // Check if session has expired
    if (Date.now() - session.timestamp > SESSION_TIMEOUT_MS) {
      clearEditorSession();
      return getEmptySession();
    }

    return session;
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
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return false;

    const session = JSON.parse(stored) as EditorSessionState;
    const isExpired = Date.now() - session.timestamp > SESSION_TIMEOUT_MS;

    return !isExpired && (session.binaryData !== null || session.a2lContent !== null);
  } catch {
    return false;
  }
}

/**
 * Check if session has unsaved changes
 */
export function hasUnsavedChanges(): boolean {
  try {
    const session = getEditorSession();
    return (
      session.binaryData !== null ||
      session.a2lContent !== null ||
      Object.keys(session.modifiedMaps).length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Clear editor session
 */
export function clearEditorSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
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
 * Get session size in bytes
 */
export function getSessionSize(): number {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? new Blob([stored]).size : 0;
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
    const session = getEditorSession();
    const now = Date.now();
    const ageMs = now - session.timestamp;

    return {
      hasSession: hasActiveSession(),
      sizeKB: Math.round(getSessionSize() / 1024),
      ageMinutes: Math.round(ageMs / 60000),
      hasBinary: session.binaryData !== null,
      hasA2L: session.a2lContent !== null,
      modifiedMapsCount: Object.keys(session.modifiedMaps).length,
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
