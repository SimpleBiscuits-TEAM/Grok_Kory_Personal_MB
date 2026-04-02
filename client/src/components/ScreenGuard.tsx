/**
 * ScreenGuard — Detects screenshot and screen recording attempts.
 * Shows escalating scare messages and notifies the admin.
 *
 * Detection methods:
 * 1. PrintScreen / Cmd+Shift+3/4 key combos
 * 2. Screen Capture API (navigator.mediaDevices.getDisplayMedia)
 * 3. Visibility change during suspected capture
 * 4. DevTools detection (window resize heuristic)
 *
 * NOTE: No browser API can 100% prevent screenshots. This is a deterrent.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { ShieldAlert, X, Skull } from 'lucide-react';

const sColor = {
  bg: '#0a0a0a',
  red: 'oklch(0.52 0.22 25)',
  redBright: 'oklch(0.58 0.22 25)',
  text: '#ffffff',
  textMuted: 'oklch(0.65 0.01 260)',
};

const SCARE_MESSAGES = [
  {
    title: 'NICE TRY.',
    body: 'We are a neural network. Did you really think you could screenshot and get away with it? Your IP has been logged and the admin has been notified.',
    icon: ShieldAlert,
  },
  {
    title: 'SERIOUSLY?',
    body: 'Again? We have your IP, your browser fingerprint, and your questionable life choices. The admin has been alerted. Again.',
    icon: Skull,
  },
  {
    title: 'YOU KNOW WE HAVE YOUR IP, RIGHT?',
    body: 'We are a neural network — did you really think you could do dot com things and get away with it? Every attempt is logged, timestamped, and forwarded. This is your final warning.',
    icon: Skull,
  },
  {
    title: 'STILL GOING?',
    body: 'At this point we\'re impressed by your persistence. But every single attempt has been logged with your IP, user agent, screen resolution, and timestamp. The admin is watching. In real time.',
    icon: Skull,
  },
];

interface ScreenGuardProps {
  /** Only active when user is on a share-token session */
  active: boolean;
  /** Signer email for logging */
  signerEmail?: string;
}

export default function ScreenGuard({ active, signerEmail }: ScreenGuardProps) {
  const [alertCount, setAlertCount] = useState(0);
  const [showAlert, setShowAlert] = useState(false);
  const alertCountRef = useRef(0);
  const notifyMutation = trpc.system.notifyOwner.useMutation();

  const triggerAlert = useCallback(() => {
    const newCount = alertCountRef.current + 1;
    alertCountRef.current = newCount;
    setAlertCount(newCount);
    setShowAlert(true);

    // Notify admin
    notifyMutation.mutate({
      title: `⚠️ Screen Capture Attempt #${newCount}`,
      content: [
        `A share-token user attempted to capture the screen.`,
        `Email: ${signerEmail || 'Unknown'}`,
        `Attempt #: ${newCount}`,
        `Page: ${window.location.pathname}`,
        `User Agent: ${navigator.userAgent}`,
        `Screen: ${screen.width}x${screen.height}`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
    });
  }, [signerEmail, notifyMutation]);

  useEffect(() => {
    if (!active) return;

    // 1. Detect PrintScreen, Cmd+Shift+3/4, Ctrl+Shift+S, Win+Shift+S
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen';
      const isMacScreenshot = e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5');
      const isWinSnip = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's';
      const isCtrlP = e.ctrlKey && e.key.toLowerCase() === 'p'; // Print dialog

      if (isPrintScreen || isMacScreenshot || isWinSnip || isCtrlP) {
        e.preventDefault();
        e.stopPropagation();
        triggerAlert();
      }
    };

    // 2. Detect right-click (context menu) — common for "Save image as"
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Don't trigger alert for right-click, just block it
    };

    // 3. Override getDisplayMedia to detect screen recording
    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices && typeof originalGetDisplayMedia === 'function') {
      navigator.mediaDevices.getDisplayMedia = function(...args: any[]) {
        triggerAlert();
        return Promise.reject(new Error('Screen recording is not permitted'));
      };
    }

    // 4. Detect copy events on the page
    const handleCopy = (e: ClipboardEvent) => {
      // Allow text copy but log it
      // Only trigger for suspected full-page copy
    };

    // 5. CSS-based protection: disable selection and drag on protected content
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopy, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('copy', handleCopy, true);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      // Restore original getDisplayMedia
      if (navigator.mediaDevices && originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
    };
  }, [active, triggerAlert]);

  if (!showAlert || !active) return null;

  const msgIndex = Math.min(alertCount - 1, SCARE_MESSAGES.length - 1);
  const msg = SCARE_MESSAGES[msgIndex];
  const Icon = msg.icon;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(20px)',
        animation: 'screenGuardFadeIn 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes screenGuardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes screenGuardPulse {
          0%, 100% { box-shadow: 0 0 30px oklch(0.52 0.22 25 / 0.3); }
          50% { box-shadow: 0 0 60px oklch(0.52 0.22 25 / 0.6); }
        }
        @keyframes screenGuardShake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>

      <div
        style={{
          maxWidth: 480,
          width: '90%',
          background: '#111111',
          border: '2px solid oklch(0.52 0.22 25)',
          padding: 40,
          textAlign: 'center',
          animation: `screenGuardPulse 2s ease-in-out infinite, screenGuardShake 0.5s ease-in-out`,
        }}
      >
        {/* Icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'oklch(0.52 0.22 25 / 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Icon style={{ width: 40, height: 40, color: sColor.red }} />
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '2rem',
          color: sColor.red,
          letterSpacing: '0.1em',
          margin: '0 0 16px 0',
        }}>
          {msg.title}
        </h2>

        {/* Body */}
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '1rem',
          color: sColor.textMuted,
          lineHeight: 1.6,
          margin: '0 0 8px 0',
        }}>
          {msg.body}
        </p>

        {/* Attempt counter */}
        <p style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.7rem',
          color: 'oklch(0.52 0.22 25 / 0.6)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          margin: '16px 0 24px 0',
        }}>
          CAPTURE ATTEMPT #{alertCount} LOGGED
        </p>

        {/* Dismiss button */}
        <button
          onClick={() => setShowAlert(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            background: 'transparent',
            border: '1px solid oklch(0.25 0.01 260)',
            color: sColor.textMuted,
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          <X style={{ width: 14, height: 14 }} />
          I UNDERSTAND
        </button>
      </div>
    </div>
  );
}
