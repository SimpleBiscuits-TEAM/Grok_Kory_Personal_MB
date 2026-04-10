/**
 * AccessGate — Full-screen access code entry gate.
 * Shows a branded PPEI/V-OP gate that prompts for an access code.
 * On success, refreshes the access tier query so the parent re-renders.
 *
 * MAIN branch only — grok branch uses OAuth-based auth.
 */
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Lock, Loader2 } from 'lucide-react';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

const sFont = {
  heading: '"Bebas Neue", "Impact", "Arial Black", sans-serif',
  body: '"Rajdhani", "Segoe UI", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: 'oklch(0.08 0.004 260)',
  bgDark: 'oklch(0.06 0.004 260)',
  textDim: 'oklch(0.60 0.010 260)',
  border: 'oklch(0.20 0.008 260)',
};

const funnyDenials = [
  "Access denied. Try turning the key off and back on... oh wait, wrong tool.",
  "That ain't it chief. The turbo just spooled down in disappointment.",
  "Incorrect. The injectors are crying.",
  "Wrong again. At this rate, you'll need a flash tool just to unlock the door.",
  "Still no. Your ECU called — it wants a competent operator.",
  "Denied. Even the DPF has more flow than your password game.",
  "Nope. The wastegate just opened from the cringe.",
  "Invalid. The EGR valve is less clogged than your memory.",
];

export default function AccessGate() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const verifyMutation = trpc.auth.verifyAccessCode.useMutation();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const result = await verifyMutation.mutateAsync({ code: code.trim() });
      if (result.success) {
        // Refresh the access tier query so parent components re-render
        await utils.auth.checkAccess.invalidate();
      } else {
        const msg = funnyDenials[Math.floor(Math.random() * funnyDenials.length)];
        setError(msg);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setCode('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection error. Try again.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: sColor.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      {/* Accent bar at top */}
      <div className="ppei-accent-animated" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px', zIndex: 100,
      }} />

      {/* Logo */}
      <img
        src={PPEI_LOGO_URL}
        alt="PPEI"
        style={{ height: '72px', width: 'auto', objectFit: 'contain', marginBottom: '2rem' }}
      />

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: sFont.heading,
          fontSize: '2.2rem',
          letterSpacing: '0.12em',
          color: 'white',
          margin: 0,
          lineHeight: 1.1,
        }}>V-OP</h1>
        <p style={{
          fontFamily: sFont.body,
          fontSize: '0.85rem',
          color: sColor.textDim,
          letterSpacing: '0.06em',
          margin: '0.5rem 0 0 0',
        }}>VEHICLE OPTIMIZER BY PPEI</p>
      </div>

      {/* Lock icon */}
      <div style={{
        width: '56px', height: '56px',
        borderRadius: '50%',
        background: `${sColor.red}20`,
        border: `2px solid ${sColor.red}60`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '1.5rem',
      }}>
        <Lock style={{ width: 24, height: 24, color: sColor.red }} />
      </div>

      {/* Prompt */}
      <p style={{
        fontFamily: sFont.body,
        fontSize: '0.95rem',
        color: sColor.textDim,
        maxWidth: '360px',
        textAlign: 'center',
        marginBottom: '1.5rem',
      }}>
        Enter your access code to continue.
      </p>

      {/* Input + submit */}
      <div className={shake ? 'ppei-shake' : ''} style={{ width: '100%', maxWidth: '340px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            ref={inputRef}
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter access code..."
            disabled={submitting}
            style={{
              flex: 1, padding: '14px 18px',
              fontFamily: sFont.mono, fontSize: '1rem', letterSpacing: '0.15em',
              background: sColor.bgDark,
              border: `2px solid ${error ? sColor.red : 'oklch(0.25 0.008 260)'}`,
              borderRadius: '3px', color: 'white', outline: 'none',
              textAlign: 'center', textTransform: 'uppercase',
              transition: 'border-color 0.2s',
              opacity: submitting ? 0.6 : 1,
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            style={{
              padding: '14px 22px',
              background: `${sColor.red}33`, border: `1px solid ${sColor.red}80`,
              borderRadius: '3px', cursor: 'pointer',
              fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.08em',
              color: sColor.red, transition: 'all 0.15s',
              opacity: submitting || !code.trim() ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {submitting ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : 'ENTER'}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <p style={{
            fontFamily: sFont.mono,
            fontSize: '0.75rem',
            color: sColor.red,
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '1rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: sFont.heading,
          fontSize: '0.7rem',
          letterSpacing: '0.12em',
          color: 'oklch(0.40 0.008 260)',
        }}>
          PPEI CUSTOM TUNING · REDEFINING THE LIMITS · PPEI.COM
        </p>
      </div>
    </div>
  );
}
