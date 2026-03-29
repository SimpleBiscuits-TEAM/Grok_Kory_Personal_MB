/**
 * Admin Notification Panel
 * 
 * Allows admins to create, send, and manage push notifications to all users.
 * Includes analytics, history, and delivery tracking.
 */

import { useState, useMemo } from 'react';
import {
  Bell, Send, Archive, Trash2, BarChart3, Plus, X,
  AlertTriangle, Info, AlertCircle, ChevronDown, ChevronUp,
  Users, Shield, Eye, Clock
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  bgHover: 'oklch(0.16 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.60 0.20 300)',
};

type Priority = 'low' | 'medium' | 'high' | 'critical';
type Audience = 'all' | 'admins' | 'users';

function getPriorityColor(p: Priority): string {
  switch (p) {
    case 'critical': return sColor.red;
    case 'high': return sColor.yellow;
    case 'medium': return sColor.blue;
    case 'low': return sColor.green;
  }
}

function getPriorityIcon(p: Priority) {
  switch (p) {
    case 'critical': return <AlertCircle style={{ width: 14, height: 14 }} />;
    case 'high': return <AlertTriangle style={{ width: 14, height: 14 }} />;
    case 'medium': return <Info style={{ width: 14, height: 14 }} />;
    case 'low': return <Info style={{ width: 14, height: 14 }} />;
  }
}

function getAudienceIcon(a: Audience) {
  switch (a) {
    case 'all': return <Users style={{ width: 14, height: 14 }} />;
    case 'admins': return <Shield style={{ width: 14, height: 14 }} />;
    case 'users': return <Users style={{ width: 14, height: 14 }} />;
  }
}

// ── Compose Form ──────────────────────────────────────────────────────────

function ComposeForm({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [audience, setAudience] = useState<Audience>('all');
  const [actionLabel, setActionLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; total: number } | null>(null);

  const createAndSend = trpc.notifications.createAndSend.useMutation();

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const res = await createAndSend.mutateAsync({
        title: title.trim(),
        message: message.trim(),
        description: description.trim() || undefined,
        priority,
        targetAudience: audience,
        actionLabel: actionLabel.trim() || undefined,
        actionUrl: actionUrl.trim() || undefined,
      });
      setResult({ sent: res.sent, total: res.total });
      onSent();
    } catch (err) {
      console.error('[AdminNotifications] Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div style={{
        background: sColor.bgCard,
        border: `1px solid ${sColor.green}40`,
        borderRadius: '8px',
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>&#x2705;</div>
        <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text, letterSpacing: '0.08em', marginBottom: '8px' }}>
          NOTIFICATION SENT
        </div>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.textDim }}>
          Delivered to {result.sent} of {result.total} users
        </div>
        <Button
          variant="outline"
          onClick={onClose}
          style={{ marginTop: '16px', fontFamily: sFont.body, fontSize: '0.75rem' }}
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <div style={{
      background: sColor.bgCard,
      border: `1px solid ${sColor.border}`,
      borderRadius: '8px',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em' }}>
          COMPOSE NOTIFICATION
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: sColor.textMuted, cursor: 'pointer' }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
          TITLE *
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Notification title..."
          maxLength={255}
          style={{
            width: '100%',
            background: sColor.bg,
            border: `1px solid ${sColor.border}`,
            borderRadius: '4px',
            padding: '8px 12px',
            color: sColor.text,
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Message */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
          MESSAGE *
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Write your notification message..."
          maxLength={5000}
          rows={4}
          style={{
            width: '100%',
            background: sColor.bg,
            border: `1px solid ${sColor.border}`,
            borderRadius: '4px',
            padding: '8px 12px',
            color: sColor.text,
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Description (optional) */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
          DETAILS (optional)
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Additional details shown when expanded..."
          maxLength={10000}
          rows={2}
          style={{
            width: '100%',
            background: sColor.bg,
            border: `1px solid ${sColor.border}`,
            borderRadius: '4px',
            padding: '8px 12px',
            color: sColor.text,
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Priority + Audience row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
            PRIORITY
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['low', 'medium', 'high', 'critical'] as Priority[]).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  flex: 1,
                  background: priority === p ? `${getPriorityColor(p)}30` : sColor.bg,
                  border: `1px solid ${priority === p ? getPriorityColor(p) : sColor.border}`,
                  borderRadius: '4px',
                  padding: '6px 4px',
                  color: priority === p ? getPriorityColor(p) : sColor.textMuted,
                  fontFamily: sFont.mono,
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s ease',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
            AUDIENCE
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'users', 'admins'] as Audience[]).map(a => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                style={{
                  flex: 1,
                  background: audience === a ? `${sColor.blue}30` : sColor.bg,
                  border: `1px solid ${audience === a ? sColor.blue : sColor.border}`,
                  borderRadius: '4px',
                  padding: '6px 4px',
                  color: audience === a ? sColor.blue : sColor.textMuted,
                  fontFamily: sFont.mono,
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  transition: 'all 0.2s ease',
                }}
              >
                {getAudienceIcon(a)}
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action button (optional) */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
            ACTION LABEL (optional)
          </label>
          <input
            value={actionLabel}
            onChange={e => setActionLabel(e.target.value)}
            placeholder="e.g. Learn More"
            style={{
              width: '100%',
              background: sColor.bg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '4px',
              padding: '8px 12px',
              color: sColor.text,
              fontFamily: sFont.body,
              fontSize: '0.8rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
            ACTION URL (optional)
          </label>
          <input
            value={actionUrl}
            onChange={e => setActionUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%',
              background: sColor.bg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '4px',
              padding: '8px 12px',
              color: sColor.text,
              fontFamily: sFont.body,
              fontSize: '0.8rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Send Button */}
      <Button
        onClick={handleSend}
        disabled={!title.trim() || !message.trim() || sending}
        style={{
          width: '100%',
          background: sColor.red,
          color: '#fff',
          fontFamily: sFont.heading,
          fontSize: '0.85rem',
          letterSpacing: '0.1em',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {sending ? (
          <>SENDING...</>
        ) : (
          <>
            <Send style={{ width: 14, height: 14 }} />
            SEND NOTIFICATION
          </>
        )}
      </Button>
    </div>
  );
}

// ── Notification History Card ─────────────────────────────────────────────

function NotificationHistoryCard({
  notification,
  onArchive,
  onDelete,
}: {
  notification: any;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getPriorityColor(notification.priority);

  const { data: analytics } = trpc.notifications.analytics.useQuery(
    { notificationId: notification.id },
    { enabled: expanded }
  );

  const sentDate = notification.sentAt
    ? new Date(notification.sentAt).toLocaleString()
    : 'Not sent';

  return (
    <div style={{
      background: sColor.bgCard,
      border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '4px',
      padding: '12px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ color, flexShrink: 0 }}>
          {getPriorityIcon(notification.priority)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: sFont.heading,
            fontSize: '0.8rem',
            color: sColor.text,
            letterSpacing: '0.05em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {notification.title}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted }}>
            {sentDate}
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          fontFamily: sFont.mono,
          fontSize: '0.55rem',
          background: notification.status === 'sent' ? `${sColor.green}30` : `${sColor.yellow}30`,
          color: notification.status === 'sent' ? sColor.green : sColor.yellow,
          padding: '2px 6px',
          borderRadius: '3px',
          textTransform: 'uppercase',
        }}>
          {notification.status}
        </div>

        {/* Audience badge */}
        <div style={{
          fontFamily: sFont.mono,
          fontSize: '0.55rem',
          background: `${sColor.blue}20`,
          color: sColor.blue,
          padding: '2px 6px',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
        }}>
          {getAudienceIcon(notification.targetAudience)}
          {notification.targetAudience}
        </div>

        <div style={{ color: sColor.textMuted, flexShrink: 0 }}>
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${sColor.border}` }}>
          {/* Message */}
          <div style={{
            fontFamily: sFont.body,
            fontSize: '0.75rem',
            color: sColor.textDim,
            marginBottom: '12px',
            lineHeight: '1.4',
          }}>
            {notification.message}
          </div>

          {notification.description && (
            <div style={{
              fontFamily: sFont.body,
              fontSize: '0.7rem',
              color: sColor.textMuted,
              background: 'rgba(0,0,0,0.2)',
              padding: '8px',
              borderRadius: '4px',
              marginBottom: '12px',
              lineHeight: '1.4',
            }}>
              {notification.description}
            </div>
          )}

          {/* Analytics */}
          {analytics && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '12px',
            }}>
              {[
                { label: 'SENT', value: analytics.totalSent, color: sColor.blue },
                { label: 'READ', value: analytics.totalRead, color: sColor.green },
                { label: 'DISMISSED', value: analytics.totalDismissed, color: sColor.yellow },
                { label: 'CLICKED', value: analytics.totalActionClicked, color: sColor.purple },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: sColor.bg,
                  borderRadius: '4px',
                  padding: '8px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1rem', color: stat.color }}>
                    {stat.value}
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {analytics && (
            <div style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '12px',
            }}>
              {[
                { label: 'Delivery Rate', value: analytics.deliveryRate },
                { label: 'Read Rate', value: analytics.readRate },
                { label: 'Engagement', value: analytics.engagementRate },
              ].map(rate => (
                <div key={rate.label} style={{ flex: 1 }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, marginBottom: '4px' }}>
                    {rate.label}
                  </div>
                  <div style={{
                    height: '4px',
                    background: sColor.bg,
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${rate.value}%`,
                      background: sColor.green,
                      borderRadius: '2px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.text, marginTop: '2px' }}>
                    {rate.value}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {notification.status !== 'archived' && (
              <button
                onClick={() => onArchive(notification.id)}
                style={{
                  background: `${sColor.yellow}20`,
                  border: `1px solid ${sColor.yellow}40`,
                  borderRadius: '4px',
                  padding: '6px 12px',
                  color: sColor.yellow,
                  fontFamily: sFont.mono,
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Archive style={{ width: 12, height: 12 }} />
                ARCHIVE
              </button>
            )}
            <button
              onClick={() => onDelete(notification.id)}
              style={{
                background: `${sColor.red}20`,
                border: `1px solid ${sColor.red}40`,
                borderRadius: '4px',
                padding: '6px 12px',
                color: sColor.red,
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
              DELETE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── User Notification Bell ────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unread } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Poll every 30s
  });
  const { data: notifications, refetch } = trpc.notifications.myNotifications.useQuery(
    { limit: 10, includeRead: false },
    { enabled: open }
  );
  const markRead = trpc.notifications.markAsRead.useMutation();
  const dismiss = trpc.notifications.dismiss.useMutation();
  const markAllRead = trpc.notifications.markAllAsRead.useMutation();

  const count = unread?.count || 0;

  const handleMarkRead = async (deliveryId: string) => {
    await markRead.mutateAsync({ deliveryId });
    refetch();
  };

  const handleDismiss = async (deliveryId: string) => {
    await dismiss.mutateAsync({ deliveryId });
    refetch();
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
    refetch();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          color: count > 0 ? sColor.red : sColor.textMuted,
          cursor: 'pointer',
          padding: '6px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Bell style={{ width: 18, height: 18 }} />
        {count > 0 && (
          <div style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '14px',
            height: '14px',
            background: sColor.red,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: sFont.mono,
            fontSize: '0.5rem',
            color: '#fff',
          }}>
            {count > 9 ? '9+' : count}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          width: '340px',
          maxHeight: '400px',
          overflowY: 'auto',
          background: sColor.bgCard,
          border: `1px solid ${sColor.border}`,
          borderRadius: '8px',
          padding: '12px',
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.text, letterSpacing: '0.08em' }}>
              NOTIFICATIONS
            </div>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: sColor.blue,
                  fontFamily: sFont.mono,
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                }}
              >
                MARK ALL READ
              </button>
            )}
          </div>

          {(!notifications || notifications.length === 0) ? (
            <div style={{
              textAlign: 'center',
              padding: '24px',
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              color: sColor.textMuted,
            }}>
              No new notifications
            </div>
          ) : (
            notifications.map((notif: any) => (
              <div
                key={notif.id}
                style={{
                  background: notif.delivery?.status === 'delivered' ? `${sColor.blue}08` : 'transparent',
                  border: `1px solid ${sColor.border}`,
                  borderLeft: `3px solid ${getPriorityColor(notif.priority)}`,
                  borderRadius: '4px',
                  padding: '10px',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: sFont.heading,
                      fontSize: '0.75rem',
                      color: sColor.text,
                      letterSpacing: '0.05em',
                      marginBottom: '4px',
                    }}>
                      {notif.title}
                    </div>
                    <div style={{
                      fontFamily: sFont.body,
                      fontSize: '0.7rem',
                      color: sColor.textDim,
                      lineHeight: '1.3',
                    }}>
                      {notif.message.length > 120 ? notif.message.slice(0, 120) + '...' : notif.message}
                    </div>
                    {notif.sentAt && (
                      <div style={{
                        fontFamily: sFont.mono,
                        fontSize: '0.55rem',
                        color: sColor.textMuted,
                        marginTop: '4px',
                      }}>
                        {new Date(notif.sentAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                    {notif.delivery?.status === 'delivered' && (
                      <button
                        onClick={() => handleMarkRead(notif.delivery.id)}
                        title="Mark as read"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: sColor.blue,
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                      >
                        <Eye style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(notif.delivery?.id)}
                      title="Dismiss"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: sColor.textMuted,
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>

                {notif.actionLabel && notif.actionUrl && (
                  <a
                    href={notif.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      fontFamily: sFont.mono,
                      fontSize: '0.6rem',
                      color: sColor.blue,
                      textDecoration: 'none',
                    }}
                  >
                    {notif.actionLabel} &rarr;
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Admin Panel ──────────────────────────────────────────────────────

interface AdminNotificationPanelProps {
  onClose?: () => void;
}

export default function AdminNotificationPanel({ onClose }: AdminNotificationPanelProps) {
  const [composing, setComposing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: notifications, refetch } = trpc.notifications.list.useQuery({
    status: statusFilter as any,
    limit: 50,
  });

  const archiveMutation = trpc.notifications.archive.useMutation();
  const deleteMutation = trpc.notifications.delete.useMutation();

  const handleArchive = async (id: string) => {
    await archiveMutation.mutateAsync({ notificationId: id });
    refetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification and all delivery records?')) return;
    await deleteMutation.mutateAsync({ notificationId: id });
    refetch();
  };

  const stats = useMemo(() => {
    if (!notifications) return { total: 0, sent: 0, draft: 0, archived: 0 };
    return {
      total: notifications.length,
      sent: notifications.filter(n => n.status === 'sent').length,
      draft: notifications.filter(n => n.status === 'draft').length,
      archived: notifications.filter(n => n.status === 'archived').length,
    };
  }, [notifications]);

  return (
    <div style={{
      background: sColor.bg,
      border: `1px solid ${sColor.border}`,
      borderRadius: '8px',
      padding: '20px',
      maxHeight: '80vh',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text, letterSpacing: '0.1em' }}>
            PUSH NOTIFICATIONS
          </div>
          <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, marginTop: '2px' }}>
            Send announcements to all users
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            onClick={() => setComposing(true)}
            style={{
              background: sColor.red,
              color: '#fff',
              fontFamily: sFont.heading,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            NEW
          </Button>
          {onClose && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: sColor.textMuted, cursor: 'pointer' }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      }}>
        {[
          { label: 'TOTAL', value: stats.total, color: sColor.text },
          { label: 'SENT', value: stats.sent, color: sColor.green },
          { label: 'DRAFT', value: stats.draft, color: sColor.yellow },
          { label: 'ARCHIVED', value: stats.archived, color: sColor.textMuted },
        ].map(s => (
          <div key={s.label} style={{
            background: sColor.bgCard,
            borderRadius: '4px',
            padding: '10px',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: sFont.mono, fontSize: '1.2rem', color: s.color }}>
              {s.value}
            </div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Compose Form */}
      {composing && (
        <div style={{ marginBottom: '16px' }}>
          <ComposeForm
            onClose={() => setComposing(false)}
            onSent={() => {
              refetch();
              setComposing(false);
            }}
          />
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {[
          { label: 'ALL', value: undefined },
          { label: 'SENT', value: 'sent' },
          { label: 'DRAFT', value: 'draft' },
          { label: 'ARCHIVED', value: 'archived' },
        ].map(f => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.value)}
            style={{
              background: statusFilter === f.value ? `${sColor.blue}30` : sColor.bgCard,
              border: `1px solid ${statusFilter === f.value ? sColor.blue : sColor.border}`,
              borderRadius: '4px',
              padding: '4px 10px',
              color: statusFilter === f.value ? sColor.blue : sColor.textMuted,
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification History */}
      <div>
        {(!notifications || notifications.length === 0) ? (
          <div style={{
            textAlign: 'center',
            padding: '32px',
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            color: sColor.textMuted,
          }}>
            No notifications yet. Click "NEW" to create one.
          </div>
        ) : (
          notifications.map((notif: any) => (
            <NotificationHistoryCard
              key={notif.id}
              notification={notif}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
