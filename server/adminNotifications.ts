/**
 * Admin Push Notification System
 * 
 * Allows admins to send push notifications to all users.
 * Tracks delivery, read status, and engagement metrics.
 */

// Database operations will be implemented via tRPC procedures

// ─── Types ────────────────────────────────────────────────────────────────

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type NotificationStatus = 'draft' | 'scheduled' | 'sent' | 'archived';
export type DeliveryStatus = 'pending' | 'delivered' | 'read' | 'dismissed';

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  description?: string; // Longer explanation
  priority: NotificationPriority;
  status: NotificationStatus;
  createdBy: string; // Admin user ID
  createdAt: number;
  scheduledFor?: number; // Optional scheduled send time
  sentAt?: number;
  expiresAt?: number; // When notification expires
  actionLabel?: string;
  actionUrl?: string;
  targetAudience?: 'all' | 'admins' | 'users'; // Who to send to
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  userId: string;
  status: DeliveryStatus;
  deliveredAt?: number;
  readAt?: number;
  dismissedAt?: number;
  actionClickedAt?: number;
}

export interface NotificationAnalytics {
  notificationId: string;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalDismissed: number;
  totalActionClicked: number;
  deliveryRate: number; // percentage
  readRate: number; // percentage
  engagementRate: number; // percentage
}

// ─── Database Schema (for reference) ──────────────────────────────────────

/**
 * Expected database tables:
 * 
 * admin_notifications:
 *   - id (primary key)
 *   - title
 *   - message
 *   - description
 *   - priority
 *   - status
 *   - created_by
 *   - created_at
 *   - scheduled_for
 *   - sent_at
 *   - expires_at
 *   - action_label
 *   - action_url
 *   - target_audience
 * 
 * notification_deliveries:
 *   - id (primary key)
 *   - notification_id (foreign key)
 *   - user_id (foreign key)
 *   - status
 *   - delivered_at
 *   - read_at
 *   - dismissed_at
 *   - action_clicked_at
 */

// ─── Admin Notification Manager ────────────────────────────────────────────

export class AdminNotificationManager {
  /**
   * Create a new notification
   */
  async createNotification(
    notification: Omit<AdminNotification, 'id' | 'createdAt' | 'status'>,
    status: NotificationStatus = 'draft'
  ): Promise<AdminNotification> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = Date.now();

    const newNotification: AdminNotification = {
      id,
      ...notification,
      createdAt,
      status,
    };

    // TODO: Save to database
    // await db.adminNotifications.create(newNotification);

    return newNotification;
  }

  /**
   * Send notification to all users
   */
  async sendNotification(notificationId: string): Promise<{ sent: number; failed: number }> {
    // TODO: Fetch notification from database
    // TODO: Fetch all users
    // TODO: Create delivery records for each user
    // TODO: Send push notifications via service worker or WebSocket
    // TODO: Update notification status to 'sent'

    return { sent: 0, failed: 0 };
  }

  /**
   * Schedule notification for later
   */
  async scheduleNotification(notificationId: string, scheduledFor: number): Promise<void> {
    // TODO: Update notification with scheduled_for timestamp
    // TODO: Set up background job to send at scheduled time
  }

  /**
   * Update notification delivery status
   */
  async updateDeliveryStatus(
    notificationId: string,
    userId: string,
    status: DeliveryStatus,
    timestamp?: number
  ): Promise<void> {
    const now = timestamp || Date.now();

    // TODO: Update delivery record in database
    // const delivery = await db.notificationDeliveries.findOne({
    //   notificationId,
    //   userId,
    // });
    // if (delivery) {
    //   await db.notificationDeliveries.update(delivery.id, {
    //     status,
    //     ...(status === 'delivered' && { deliveredAt: now }),
    //     ...(status === 'read' && { readAt: now }),
    //     ...(status === 'dismissed' && { dismissedAt: now }),
    //   });
    // }
  }

  /**
   * Mark notification as read by user
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.updateDeliveryStatus(notificationId, userId, 'read');
  }

  /**
   * Mark notification as dismissed by user
   */
  async markAsDismissed(notificationId: string, userId: string): Promise<void> {
    await this.updateDeliveryStatus(notificationId, userId, 'dismissed');
  }

  /**
   * Track action click
   */
  async trackActionClick(notificationId: string, userId: string): Promise<void> {
    // TODO: Update delivery record with actionClickedAt
    // TODO: Increment engagement metrics
  }

  /**
   * Get notification analytics
   */
  async getAnalytics(notificationId: string): Promise<NotificationAnalytics> {
    // TODO: Query delivery records and calculate metrics

    return {
      notificationId,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalDismissed: 0,
      totalActionClicked: 0,
      deliveryRate: 0,
      readRate: 0,
      engagementRate: 0,
    };
  }

  /**
   * Get user's pending notifications
   */
  async getUserNotifications(userId: string, limit: number = 10): Promise<AdminNotification[]> {
    // TODO: Query notifications where:
    // - status = 'sent'
    // - expiresAt > now (or expiresAt is null)
    // - delivery status != 'dismissed'
    // - targetAudience matches user role

    return [];
  }

  /**
   * Archive old notifications
   */
  async archiveOldNotifications(olderThanDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    // TODO: Update notifications where sentAt < cutoffTime to status = 'archived'

    return 0;
  }

  /**
   * Delete notification (admin only)
   */
  async deleteNotification(notificationId: string): Promise<void> {
    // TODO: Delete notification and all delivery records
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(limit: number = 50): Promise<AdminNotification[]> {
    // TODO: Query notifications ordered by createdAt DESC with limit

    return [];
  }

  /**
   * Bulk send notifications to specific users
   */
  async sendToUsers(notificationId: string, userIds: string[]): Promise<{ sent: number; failed: number }> {
    // TODO: Create delivery records only for specified users
    // TODO: Send push notifications

    return { sent: 0, failed: 0 };
  }

  /**
   * Get delivery status for user
   */
  async getDeliveryStatus(notificationId: string, userId: string): Promise<DeliveryStatus | null> {
    // TODO: Query delivery record

    return null;
  }

  /**
   * Get all deliveries for notification
   */
  async getDeliveries(notificationId: string): Promise<NotificationDelivery[]> {
    // TODO: Query all delivery records for notification

    return [];
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────

let managerInstance: AdminNotificationManager | null = null;

export function getAdminNotificationManager(): AdminNotificationManager {
  if (!managerInstance) {
    managerInstance = new AdminNotificationManager();
  }
  return managerInstance;
}

// ─── Helper Functions ─────────────────────────────────────────────────────

/**
 * Get priority color for UI
 */
export function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return 'oklch(0.52 0.22 25)'; // Red
    case 'high':
      return 'oklch(0.75 0.18 60)'; // Yellow
    case 'medium':
      return 'oklch(0.70 0.18 200)'; // Blue
    case 'low':
      return 'oklch(0.65 0.20 145)'; // Green
    default:
      return 'oklch(0.55 0.010 260)'; // Gray
  }
}

/**
 * Get status badge text
 */
export function getStatusBadge(status: NotificationStatus): string {
  switch (status) {
    case 'draft':
      return '📝 DRAFT';
    case 'scheduled':
      return '⏰ SCHEDULED';
    case 'sent':
      return '✅ SENT';
    case 'archived':
      return '📦 ARCHIVED';
  }
}

/**
 * Calculate engagement rate
 */
export function calculateEngagementRate(analytics: NotificationAnalytics): number {
  if (analytics.totalDelivered === 0) return 0;
  const engaged = analytics.totalRead + analytics.totalActionClicked;
  return Math.round((engaged / analytics.totalDelivered) * 100);
}

/**
 * Format notification for display
 */
export function formatNotificationForDisplay(notification: AdminNotification): {
  title: string;
  subtitle: string;
  badge: string;
} {
  return {
    title: notification.title,
    subtitle: notification.message,
    badge: getStatusBadge(notification.status),
  };
}
