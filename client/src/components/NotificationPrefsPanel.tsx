/**
 * Notification Preferences Panel
 * 
 * Allows users to configure their notification preferences:
 * - Enable/disable push notifications
 * - Enable/disable What's New panel
 * - Set minimum priority filter
 * - Mute notifications temporarily
 */

import { useState } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Clock, Shield } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  bgHover: 'oklch(0.36 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  orange: 'oklch(0.70 0.18 55)',
};

type Priority = 'low' | 'medium' | 'high' | 'critical';

const priorityOptions: { value: Priority; label: string; description: string; color: string }[] = [
  { value: 'low', label: 'ALL', description: 'Receive all notifications', color: sColor.textDim },
  { value: 'medium', label: 'MEDIUM+', description: 'Medium, high, and critical only', color: sColor.yellow },
  { value: 'high', label: 'HIGH+', description: 'High and critical only', color: sColor.orange },
  { value: 'critical', label: 'CRITICAL', description: 'Only critical notifications', color: sColor.red },
];

const muteOptions: { value: '1h' | '8h' | '24h' | '7d' | 'forever'; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '8h', label: '8 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: 'forever', label: 'Until I turn back on' },
];

function ToggleSwitch({ checked, onChange, label, description, icon: Icon }: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description: string;
  icon: typeof Bell;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
      borderRadius: '3px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Icon style={{ width: 18, height: 18, color: checked ? sColor.green : sColor.textMuted }} />
        <div>
          <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', fontWeight: 600, color: sColor.text }}>{label}</div>
          <div style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim }}>{description}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px', border: 'none',
          background: checked ? sColor.green : 'oklch(0.25 0.008 260)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%', background: 'white',
          position: 'absolute', top: '3px',
          left: checked ? '23px' : '3px',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

export default function NotificationPrefsPanel() {
  const [showMuteOptions, setShowMuteOptions] = useState(false);

  const { data: prefs, isLoading } = trpc.notificationPrefs.get.useQuery();
  const utils = trpc.useUtils();

  const updatePrefs = trpc.notificationPrefs.update.useMutation({
    onSuccess: () => utils.notificationPrefs.get.invalidate(),
  });

  const muteNotifs = trpc.notificationPrefs.mute.useMutation({
    onSuccess: () => {
      utils.notificationPrefs.get.invalidate();
      setShowMuteOptions(false);
    },
  });

  const unmuteNotifs = trpc.notificationPrefs.unmute.useMutation({
    onSuccess: () => utils.notificationPrefs.get.invalidate(),
  });

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: sFont.mono, color: sColor.textDim }}>Loading preferences...</div>
      </div>
    );
  }

  const isMuted = prefs?.mutedUntil ? prefs.mutedUntil > Date.now() : !prefs?.enablePush;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Bell style={{ width: 20, height: 20, color: sColor.red }} />
        <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>NOTIFICATION PREFERENCES</h2>
      </div>

      {/* Muted banner */}
      {isMuted && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: `${sColor.orange}15`, border: `1px solid ${sColor.orange}40`,
          borderRadius: '3px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VolumeX style={{ width: 16, height: 16, color: sColor.orange }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.orange }}>
              Notifications are muted
              {prefs?.mutedUntil && prefs.mutedUntil > Date.now() && (
                <> until {new Date(prefs.mutedUntil).toLocaleString()}</>
              )}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => unmuteNotifs.mutate()}
            disabled={unmuteNotifs.isPending}
            style={{ fontFamily: sFont.mono, fontSize: '0.72rem' }}
          >
            UNMUTE
          </Button>
        </div>
      )}

      {/* Toggle switches */}
      <ToggleSwitch
        checked={prefs?.enablePush ?? true}
        onChange={(val) => updatePrefs.mutate({ enablePush: val })}
        label="Push Notifications"
        description="Receive notifications from PPEI admins about updates, alerts, and announcements"
        icon={prefs?.enablePush ? Volume2 : VolumeX}
      />

      <ToggleSwitch
        checked={prefs?.enableWhatsNew ?? true}
        onChange={(val) => updatePrefs.mutate({ enableWhatsNew: val })}
        label="What's New Panel"
        description="Show What's New panel on login with latest feature updates and changes"
        icon={Bell}
      />

      {/* Priority filter */}
      <div style={{
        padding: '16px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderRadius: '3px', marginBottom: '8px', marginTop: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Shield style={{ width: 16, height: 16, color: sColor.blue }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.9rem', fontWeight: 600, color: sColor.text }}>Minimum Priority</span>
        </div>
        <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: '0 0 12px' }}>
          Only receive notifications at or above this priority level
        </p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {priorityOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => updatePrefs.mutate({ minPriority: opt.value })}
              style={{
                padding: '8px 14px', fontFamily: sFont.mono, fontSize: '0.75rem',
                background: prefs?.minPriority === opt.value ? `${opt.color}25` : 'oklch(0.31 0.005 260)',
                border: `1px solid ${prefs?.minPriority === opt.value ? opt.color : sColor.border}`,
                borderRadius: '3px', cursor: 'pointer', color: opt.color,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              }}
            >
              <span style={{ fontWeight: 700 }}>{opt.label}</span>
              <span style={{ fontSize: '0.65rem', color: sColor.textMuted }}>{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mute options */}
      <div style={{
        padding: '16px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderRadius: '3px', marginTop: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock style={{ width: 16, height: 16, color: sColor.yellow }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.9rem', fontWeight: 600, color: sColor.text }}>Mute Notifications</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMuteOptions(!showMuteOptions)}
            style={{ fontFamily: sFont.mono, fontSize: '0.72rem' }}
          >
            {showMuteOptions ? 'CANCEL' : 'MUTE'}
          </Button>
        </div>

        {showMuteOptions && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {muteOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => muteNotifs.mutate({ duration: opt.value })}
                disabled={muteNotifs.isPending}
                style={{
                  padding: '6px 12px', fontFamily: sFont.mono, fontSize: '0.72rem',
                  background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`,
                  borderRadius: '3px', cursor: 'pointer', color: sColor.text,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
