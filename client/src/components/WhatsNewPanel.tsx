/**
 * What's New Panel Component
 * 
 * Displays new features, protocol updates, and improvements.
 * Users can dismiss individual notifications or all of them.
 */

import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import {
  WhatsNewNotification,
  DEFAULT_NOTIFICATIONS,
  getWhatsNewManager,
  getNotificationTypeColor,
} from '@/lib/whatsNewManager';

interface WhatsNewPanelProps {
  onClose?: () => void;
  autoHide?: boolean; // Auto-hide after 10 seconds
}

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

// ─── Notification Card ────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onDismiss,
}: {
  notification: WhatsNewNotification;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = notification.color || getNotificationTypeColor(notification.type);

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
        border: `1px solid ${color}40`,
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {/* Icon */}
        <div style={{ fontSize: '1.2rem', marginTop: '2px', flexShrink: 0 }}>
          {notification.icon || '✨'}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <div
              style={{
                fontFamily: sFont.heading,
                fontSize: '0.85rem',
                color: sColor.text,
                letterSpacing: '0.08em',
              }}
            >
              {notification.title}
            </div>
            <div
              style={{
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                background: color,
                color: sColor.bg,
                padding: '2px 6px',
                borderRadius: '3px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {notification.type}
            </div>
          </div>

          <div
            style={{
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              color: sColor.textDim,
              marginBottom: '6px',
            }}
          >
            {notification.description}
          </div>

          {/* Expanded Details */}
          {expanded && notification.details && (
            <div
              style={{
                fontFamily: sFont.body,
                fontSize: '0.7rem',
                color: sColor.textMuted,
                background: 'rgba(0,0,0,0.2)',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '8px',
                lineHeight: '1.4',
              }}
            >
              {notification.details}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {notification.details && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: color,
                  fontFamily: sFont.body,
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 4px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.opacity = '0.8';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
              >
                {expanded ? 'HIDE' : 'DETAILS'}
                <ChevronRight style={{ width: 12, height: 12, transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }} />
              </button>
            )}

            {notification.actionLabel && notification.actionUrl && (
              <a
                href={notification.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: color,
                  fontFamily: sFont.body,
                  fontSize: '0.65rem',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 4px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.opacity = '0.8';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
              >
                {notification.actionLabel}
                <ChevronRight style={{ width: 12, height: 12 }} />
              </a>
            )}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => onDismiss(notification.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: sColor.textMuted,
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = sColor.text;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = sColor.textMuted;
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export function WhatsNewPanel({ onClose, autoHide = true }: WhatsNewPanelProps) {
  const [notifications, setNotifications] = useState<WhatsNewNotification[]>([]);
  const [manager] = useState(() => getWhatsNewManager());

  useEffect(() => {
    // Get active notifications
    const active = manager.getSortedNotifications(DEFAULT_NOTIFICATIONS);
    setNotifications(active);
    manager.updateLastCheck();

    // Auto-hide after 10 seconds
    if (autoHide && active.length > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = (id: string) => {
    manager.dismiss(id);
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const handleDismissAll = () => {
    for (const notification of notifications) {
      manager.dismiss(notification.id);
    }
    setNotifications([]);
    onClose?.();
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${sColor.bgCard}80 0%, ${sColor.bgCard}40 100%)`,
        border: `1px solid ${sColor.border}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        maxHeight: '600px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em' }}>
            WHAT'S NEW
          </div>
          <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, marginTop: '2px' }}>
            {notifications.length} new update{notifications.length !== 1 ? 's' : ''}
          </div>
        </div>

        <button
          onClick={handleDismissAll}
          style={{
            background: 'transparent',
            border: 'none',
            color: sColor.textMuted,
            fontFamily: sFont.body,
            fontSize: '0.65rem',
            cursor: 'pointer',
            padding: '4px 8px',
            transition: 'all 0.2s ease',
            letterSpacing: '0.05em',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = sColor.text;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = sColor.textMuted;
          }}
        >
          DISMISS ALL
        </button>
      </div>

      {/* Notifications */}
      <div>
        {notifications.map(notification => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Hook for What's New ──────────────────────────────────────────────────

export function useWhatsNew() {
  const [showPanel, setShowPanel] = useState(false);
  const [manager] = useState(() => getWhatsNewManager());

  useEffect(() => {
    // Show on first login or after 7 days
    if (manager.shouldShowNotifications()) {
      const active = manager.getActiveNotifications(DEFAULT_NOTIFICATIONS);
      if (active.length > 0) {
        setShowPanel(true);
      }
    }
  }, []);

  return {
    showPanel,
    setShowPanel,
    manager,
  };
}
