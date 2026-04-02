/**
 * What's New Manager
 * 
 * Manages notifications about new features, protocol support, and updates.
 * Tracks which notifications have been dismissed by the user.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type NotificationType = 'feature' | 'protocol' | 'preset' | 'improvement' | 'bugfix';

export interface WhatsNewNotification {
  id: string; // Unique identifier (e.g., "j1939_support_v1")
  type: NotificationType;
  title: string;
  description: string;
  details?: string; // Longer explanation
  icon?: string; // Emoji or icon
  color?: string; // OKLCH color
  actionLabel?: string;
  actionUrl?: string;
  createdAt: number; // Timestamp
  expiresAt?: number; // Optional expiration date
  priority: 'low' | 'medium' | 'high'; // Display order
}

export interface DismissalRecord {
  notificationId: string;
  dismissedAt: number;
  userAction: 'dismiss' | 'action_clicked' | 'auto_expired';
}

// ─── Storage Keys ─────────────────────────────────────────────────────────

const STORAGE_KEY_DISMISSALS = 'whatsNew_dismissals';
const STORAGE_KEY_LAST_CHECK = 'whatsNew_lastCheck';

// ─── Built-in Notifications ──────────────────────────────────────────────

/**
 * Default notifications about new features
 */
export const DEFAULT_NOTIFICATIONS: WhatsNewNotification[] = [
  // ── v0.03 Updates (March 2026) ──
  {
    id: 'v003_calibration_editor',
    type: 'feature',
    title: 'Calibration Editor — MG1 Alignment Fix',
    description: 'Binary map offsets now align correctly for all MG1 ECU files',
    details:
      'The alignment engine now uses NaN/Inf penalty scoring across all strategies, ensuring correct base address detection for DEADBEEF container binaries. Maps display exactly as they should.',
    icon: '🔧',
    color: 'oklch(0.52 0.22 25)', // PPEI Red
    priority: 'high',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'v003_drag_racing',
    type: 'feature',
    title: 'Drag Racing — Regional Badges & Playoffs',
    description: 'Fastest in Location badges and playoff bracket system',
    details:
      'Earn regional champion badges based on your track times. League seasons now support playoff brackets with seeded matchups from standings.',
    icon: '🏁',
    color: 'oklch(0.70 0.18 200)', // Blue
    priority: 'high',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'v003_share_integration',
    type: 'feature',
    title: 'Share Cards — Fleet & Community',
    description: 'Share fleet stats and community threads with custom cards',
    details:
      'Generate shareable cards from Fleet dashboard stats and Community threads. Includes QR codes, branding, and one-click copy.',
    icon: '📤',
    color: 'oklch(0.65 0.20 145)', // Green
    priority: 'medium',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'v003_text_contrast',
    type: 'improvement',
    title: 'UI Readability Improvements',
    description: '246 text contrast fixes across 36 files for better readability',
    details:
      'All dim text elements have been brightened for better contrast against dark backgrounds. Subtitles, helper text, version badges, and data labels are now clearly visible.',
    icon: '👁️',
    color: 'oklch(0.75 0.18 60)', // Yellow
    priority: 'low',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'v003_auth_upgrade',
    type: 'improvement',
    title: 'Authentication & Access Control',
    description: 'Restored logout, removed legacy passcode from Advanced',
    details:
      'User avatar dropdown with sign-out in the header. Advanced section now requires authentication (legacy passcode removed). Sign-in button for guests.',
    icon: '🔐',
    color: 'oklch(0.60 0.20 300)', // Purple
    priority: 'medium',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  // ── v0.02 Updates ──
  {
    id: 'j1939_support_v1',
    type: 'protocol',
    title: 'J1939 Protocol Support',
    description: 'Heavy-duty truck diagnostics now available',
    details:
      'Log and analyze J1939 parameters from Cummins, Duramax, and Volvo engines. Includes 6 essential PGNs with real-time monitoring.',
    icon: '🚛',
    color: 'oklch(0.60 0.20 300)',
    priority: 'high',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'kline_support_v1',
    type: 'protocol',
    title: 'K-Line Protocol Support',
    description: 'Legacy vehicle diagnostics (pre-2010)',
    details:
      'Connect to older European and Asian vehicles via K-Line (ISO 9141-2). Supports 30+ OBD-II parameters with 5-baud initialization.',
    icon: '🔧',
    color: 'oklch(0.65 0.20 55)',
    priority: 'high',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'protocol_auto_detection_v1',
    type: 'feature',
    title: 'Protocol Auto-Detection',
    description: 'Automatically detects supported protocols',
    details:
      'When you connect, the analyzer scans for OBD-II, J1939, and K-Line support. Displays confidence scores and recommended protocol.',
    icon: '🔍',
    color: 'oklch(0.70 0.18 200)',
    priority: 'medium',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
];

// ─── Manager Class ────────────────────────────────────────────────────────

export class WhatsNewManager {
  private dismissals: Map<string, DismissalRecord> = new Map();

  constructor() {
    this.loadDismissals();
  }

  /**
   * Load dismissal records from localStorage
   */
  private loadDismissals(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DISMISSALS);
      if (stored) {
        const records = JSON.parse(stored) as DismissalRecord[];
        for (const record of records) {
          this.dismissals.set(record.notificationId, record);
        }
      }
    } catch (error) {
      console.error('Failed to load dismissal records:', error);
    }
  }

  /**
   * Save dismissal records to localStorage
   */
  private saveDismissals(): void {
    try {
      const records = Array.from(this.dismissals.values());
      localStorage.setItem(STORAGE_KEY_DISMISSALS, JSON.stringify(records));
    } catch (error) {
      console.error('Failed to save dismissal records:', error);
    }
  }

  /**
   * Check if a notification has been dismissed
   */
  isDismissed(notificationId: string): boolean {
    return this.dismissals.has(notificationId);
  }

  /**
   * Dismiss a notification
   */
  dismiss(notificationId: string, action: 'dismiss' | 'action_clicked' | 'auto_expired' = 'dismiss'): void {
    this.dismissals.set(notificationId, {
      notificationId,
      dismissedAt: Date.now(),
      userAction: action,
    });
    this.saveDismissals();
  }

  /**
   * Undismiss a notification (show it again)
   */
  undismiss(notificationId: string): void {
    this.dismissals.delete(notificationId);
    this.saveDismissals();
  }

  /**
   * Get active (non-dismissed) notifications
   */
  getActiveNotifications(notifications: WhatsNewNotification[]): WhatsNewNotification[] {
    return notifications.filter(n => !this.isDismissed(n.id) && !this.isExpired(n));
  }

  /**
   * Check if a notification has expired
   */
  private isExpired(notification: WhatsNewNotification): boolean {
    if (!notification.expiresAt) return false;
    return Date.now() > notification.expiresAt;
  }

  /**
   * Get notifications sorted by priority
   */
  getSortedNotifications(notifications: WhatsNewNotification[]): WhatsNewNotification[] {
    const active = this.getActiveNotifications(notifications);
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return active.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt; // Newer first
    });
  }

  /**
   * Get notifications by type
   */
  getNotificationsByType(
    notifications: WhatsNewNotification[],
    type: NotificationType
  ): WhatsNewNotification[] {
    return this.getActiveNotifications(notifications).filter(n => n.type === type);
  }

  /**
   * Get count of active notifications
   */
  getActiveCount(notifications: WhatsNewNotification[]): number {
    return this.getActiveNotifications(notifications).length;
  }

  /**
   * Clear all dismissals (show all notifications again)
   */
  clearAllDismissals(): void {
    this.dismissals.clear();
    this.saveDismissals();
  }

  /**
   * Get dismissal statistics
   */
  getDismissalStats(): {
    total: number;
    byAction: Record<string, number>;
  } {
    const stats = {
      total: this.dismissals.size,
      byAction: { dismiss: 0, action_clicked: 0, auto_expired: 0 },
    };

    const records = Array.from(this.dismissals.values());
    for (const record of records) {
      const action = record.userAction as keyof typeof stats.byAction;
      stats.byAction[action]++;
    }

    return stats;
  }

  /**
   * Update last check timestamp
   */
  updateLastCheck(): void {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_CHECK, Date.now().toString());
    } catch (error) {
      console.error('Failed to update last check:', error);
    }
  }

  /**
   * Get last check timestamp
   */
  getLastCheck(): number | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_CHECK);
      return stored ? parseInt(stored, 10) : null;
    } catch (error) {
      console.error('Failed to get last check:', error);
      return null;
    }
  }

  /**
   * Check if notifications should be shown (e.g., on first login)
   */
  shouldShowNotifications(): boolean {
    const lastCheck = this.getLastCheck();
    if (!lastCheck) return true; // First time
    const daysSinceCheck = (Date.now() - lastCheck) / (24 * 60 * 60 * 1000);
    return daysSinceCheck >= 7; // Show again after 7 days
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────

let managerInstance: WhatsNewManager | null = null;

export function getWhatsNewManager(): WhatsNewManager {
  if (!managerInstance) {
    managerInstance = new WhatsNewManager();
  }
  return managerInstance;
}

// ─── Helper Functions ─────────────────────────────────────────────────────

/**
 * Get color for notification type
 */
export function getNotificationTypeColor(type: NotificationType): string {
  switch (type) {
    case 'protocol':
      return 'oklch(0.60 0.20 300)'; // Purple
    case 'feature':
      return 'oklch(0.70 0.18 200)'; // Blue
    case 'preset':
      return 'oklch(0.65 0.20 145)'; // Green
    case 'improvement':
      return 'oklch(0.75 0.18 60)'; // Yellow
    case 'bugfix':
      return 'oklch(0.65 0.20 55)'; // Orange
    default:
      return 'oklch(0.55 0.010 260)'; // Gray
  }
}

/**
 * Get icon for notification type
 */
export function getNotificationTypeIcon(type: NotificationType): string {
  switch (type) {
    case 'protocol':
      return '📡';
    case 'feature':
      return '✨';
    case 'preset':
      return '⚙️';
    case 'improvement':
      return '⚡';
    case 'bugfix':
      return '🐛';
    default:
      return 'ℹ️';
  }
}
