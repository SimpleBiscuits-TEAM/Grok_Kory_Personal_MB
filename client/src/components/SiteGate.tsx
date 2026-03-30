/**
 * SiteGate — Site-wide access control.
 * Three paths to enter:
 * 1. Logged in + admin/super_admin role → always pass through
 * 2. Logged in + advancedAccess === 'approved' → pass through
 * 3. Access code "KingKONG" entered → pass through (stored in localStorage)
 * 
 * Blocked:
 * - Logged in but not approved → shows pending/request screen
 * - Not logged in and no code → shows login + code gate
 * 
 * Background: Blurred fake V-OP Pro interface teasing what's behind the gate
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import { Lock, LogIn, KeyRound, AlertCircle, Loader2, Clock, ShieldX, Send, BarChart3, Gauge, Brain, FileCode2, Radio, Zap, Database, Users, ArrowLeft } from 'lucide-react';

const SITE_ACCESS_KEY = 'vop_site_access';
const ACCESS_CODE = 'KingKONG';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgDark: 'oklch(0.08 0.004 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
};

/** Fake V-OP Pro background that shows behind the blurred overlay */
function FakeProBackground() {
  const fakeTabs = [
    { label: 'ANALYZER', icon: <BarChart3 style={{ width: 14, height: 14 }} />, active: true },
    { label: 'DATALOGGER', icon: <Gauge style={{ width: 14, height: 14 }} /> },
    { label: 'AI CHAT', icon: <Brain style={{ width: 14, height: 14 }} /> },
    { label: 'EDITOR', icon: <FileCode2 style={{ width: 14, height: 14, color: sColor.red }} /> },
    { label: 'INTELLISPY', icon: <Radio style={{ width: 14, height: 14, color: sColor.green }} /> },
    { label: 'FLASH', icon: <Zap style={{ width: 14, height: 14, color: sColor.yellow }} /> },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: sColor.bg, color: sColor.text,
    }}>
      {/* Fake header */}
      <div style={{
        background: sColor.bgDark,
        borderBottom: `1px solid oklch(0.20 0.008 260)`,
      }}>
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${sColor.red}, oklch(0.65 0.22 30), ${sColor.red})` }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src={PPEI_LOGO_URL} alt="" style={{ height: '48px', width: 'auto' }} />
            <div style={{ borderLeft: `3px solid ${sColor.red}`, paddingLeft: '12px' }}>
              <h1 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.08em', color: 'white', lineHeight: 1.1, margin: 0 }}>V-OP PRO</h1>
              <p style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textDim, letterSpacing: '0.04em', margin: 0 }}>VEHICLE OPTIMIZER BY PPEI · AI DIAGNOSTICS</p>
            </div>
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.6rem', color: 'oklch(0.45 0.010 260)',
              padding: '2px 8px', border: '1px solid oklch(0.22 0.006 260)', borderRadius: '2px',
              background: 'oklch(0.12 0.004 260)',
            }}>v0.03</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: `${sColor.green}1f`, border: `1px solid ${sColor.green}4d`, borderRadius: '2px' }}>
              <Database style={{ width: 12, height: 12, color: sColor.green }} />
              <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green }}>261 DOCS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'oklch(0.18 0.006 260)', border: `1px solid oklch(0.25 0.008 260)`, borderRadius: '2px', color: 'oklch(0.70 0.010 260)', fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.08em' }}>
              <Users style={{ width: 14, height: 14 }} /> USER MGMT
            </div>
          </div>
        </div>
      </div>

      {/* Fake tabs */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid oklch(0.20 0.008 260)`, marginBottom: '20px' }}>
          {fakeTabs.map(tab => (
            <div key={tab.label} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px',
              fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em',
              color: tab.active ? 'white' : 'oklch(0.50 0.010 260)',
              background: tab.active ? 'oklch(0.16 0.008 260)' : 'transparent',
              borderBottom: tab.active ? `2px solid ${sColor.red}` : '2px solid transparent',
            }}>
              {tab.icon} {tab.label}
            </div>
          ))}
        </div>

        {/* Fake analyzer content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {['RPM', 'BOOST PSI', 'RAIL PRESSURE', 'EGT °F'].map(label => (
            <div key={label} style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px',
              padding: '16px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginBottom: '4px' }}>{label}</div>
              <div style={{ fontFamily: sFont.heading, fontSize: '1.8rem', color: 'white' }}>
                {label === 'RPM' ? '3,247' : label === 'BOOST PSI' ? '38.2' : label === 'RAIL PRESSURE' ? '26,450' : '1,187'}
              </div>
            </div>
          ))}
        </div>

        {/* Fake chart area */}
        <div style={{
          background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px',
          padding: '24px', height: '300px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white', marginBottom: '16px', letterSpacing: '0.06em' }}>
            DYNO ESTIMATED HP/TQ
          </div>
          {/* Fake chart lines */}
          <svg width="100%" height="220" viewBox="0 0 800 220" preserveAspectRatio="none" style={{ opacity: 0.6 }}>
            <path d="M0,200 C100,190 200,160 300,120 C400,80 500,40 600,30 C700,25 800,35 800,40" fill="none" stroke={sColor.red} strokeWidth="2.5" />
            <path d="M0,180 C100,170 200,140 300,110 C400,90 500,70 600,60 C700,55 800,50 800,55" fill="none" stroke={sColor.blue} strokeWidth="2.5" />
            <path d="M0,210 C100,205 200,195 300,180 C400,160 500,130 600,100 C700,80 800,70 800,75" fill="none" stroke={sColor.green} strokeWidth="1.5" strokeDasharray="4,4" />
          </svg>
          <div style={{ position: 'absolute', bottom: '16px', right: '20px', display: 'flex', gap: '16px' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>● HP</span>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.blue }}>● TQ</span>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.green }}>● MPH</span>
          </div>
        </div>

        {/* Fake diagnostic cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.green}`, borderRadius: '3px', padding: '16px' }}>
            <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>FUEL SYSTEM</div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green }}>ALL CLEAR — NO FAULTS DETECTED</div>
          </div>
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.yellow}`, borderRadius: '3px', padding: '16px' }}>
            <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>BOOST SYSTEM</div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.yellow }}>MONITORING — 2 AREAS OF INTEREST</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The blurred overlay + gate card */
function GateOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      {/* Fake Pro background */}
      <FakeProBackground />

      {/* Blur overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        background: 'oklch(0.05 0.005 260 / 0.55)',
      }} />

      {/* Gate content centered on top */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
        {children}
      </div>
    </div>
  );
}

export function SiteGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [hasCodeAccess, setHasCodeAccess] = useState(() => {
    try {
      return localStorage.getItem(SITE_ACCESS_KEY) === 'granted';
    } catch {
      return false;
    }
  });
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Query access status for logged-in users
  const accessQuery = trpc.access.myAccess.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const requestAccess = trpc.access.requestAccess.useMutation({
    onSuccess: () => accessQuery.refetch(),
  });

  // Loading state
  if (authLoading || (isAuthenticated && accessQuery.isLoading)) {
    return (
      <GateOverlay>
        <Loader2 style={{ width: 32, height: 32, color: sColor.red, animation: 'spin 1s linear infinite' }} />
      </GateOverlay>
    );
  }

  // ── Access code bypass → always let through ──
  if (hasCodeAccess) {
    return <>{children}</>;
  }

  // ── Logged in checks ──
  if (isAuthenticated && accessQuery.data) {
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    
    // Admins always pass
    if (isAdmin) {
      return <>{children}</>;
    }

    // Approved users pass
    if (accessQuery.data.canAccessAdvanced) {
      return <>{children}</>;
    }

    // Logged in but NOT approved → show request/pending/revoked screen
    const isPending = accessQuery.data.advancedAccess === 'pending';
    const isRevoked = accessQuery.data.advancedAccess === 'revoked';

    return (
      <GateOverlay>
        <div style={{
          width: 'min(460px, 95vw)',
          background: 'oklch(0.09 0.005 260 / 0.92)',
          border: '1px solid oklch(0.25 0.008 260)',
          borderTop: `3px solid ${sColor.red}`,
          borderRadius: '6px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 25px 60px oklch(0 0 0 / 0.6)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '2rem 2rem 1.5rem',
            textAlign: 'center',
            borderBottom: '1px solid oklch(0.18 0.008 260)',
          }}>
            <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '56px', height: '56px', margin: '0 auto 1rem', display: 'block' }} />
            <h1 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.1em', color: 'white', margin: '0 0 0.25rem' }}>V-OP</h1>
            <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.50 0.010 260)', letterSpacing: '0.1em', margin: 0 }}>VEHICLE OPTIMIZER BY PPEI</p>
          </div>

          {/* Status */}
          <div style={{ padding: '1.5rem 2rem 2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.55 0.010 260)', marginBottom: '1rem' }}>
              Signed in as <strong style={{ color: 'white' }}>{user?.name || user?.email}</strong>
            </p>

            {isPending ? (
              <>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', background: 'oklch(0.75 0.18 60 / 0.12)', border: '1px solid oklch(0.75 0.18 60 / 0.3)',
                  borderRadius: '4px', marginBottom: '1.25rem',
                }}>
                  <Clock style={{ width: 16, height: 16, color: 'oklch(0.75 0.18 60)' }} />
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: 'oklch(0.75 0.18 60)' }}>YOU'RE IN LINE</span>
                </div>
                <p style={{ fontFamily: sFont.body, fontSize: '0.95rem', color: 'oklch(0.70 0.010 260)', lineHeight: 1.6 }}>
                  We see you. Hang tight — the PPEI team is reviewing your request.
                </p>
                <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.45 0.010 260)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                  See you soon.
                </p>
              </>
            ) : isRevoked ? (
              <>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', background: 'oklch(0.52 0.22 25 / 0.12)', border: '1px solid oklch(0.52 0.22 25 / 0.3)',
                  borderRadius: '4px', marginBottom: '1.25rem',
                }}>
                  <ShieldX style={{ width: 16, height: 16, color: 'oklch(0.52 0.22 25)' }} />
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: 'oklch(0.52 0.22 25)' }}>ACCESS REVOKED</span>
                </div>
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', lineHeight: 1.6 }}>
                  Your access has been revoked. Contact PPEI for more information.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontFamily: sFont.heading, fontSize: '1.4rem', color: 'white', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  GET IN LINE
                </p>
                <p style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'oklch(0.55 0.010 260)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                  V-OP is invite-only right now. Drop your request and we'll let you know.
                </p>
                <button
                  onClick={() => requestAccess.mutate()}
                  disabled={requestAccess.isPending}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: sColor.red, color: 'white', fontFamily: sFont.heading,
                    fontSize: '1rem', letterSpacing: '0.1em', padding: '12px 32px',
                    borderRadius: '3px', border: 'none', cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {requestAccess.isPending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Send style={{ width: 16, height: 16 }} />}
                  REQUEST ACCESS
                </button>
                <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.45 0.010 260)', marginTop: '1rem' }}>
                  See you soon.
                </p>
              </>
            )}

            <p style={{
              fontFamily: sFont.body, fontSize: '0.75rem', color: 'oklch(0.40 0.010 260)',
              textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
            }}>
              Questions? Hit us at{' '}
              <a href="mailto:info@ppei.com" style={{ color: sColor.red, textDecoration: 'none' }}>info@ppei.com</a>
            </p>
          </div>
        </div>
      </GateOverlay>
    );
  }

  // ── Not logged in → show login + code gate ──
  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput === ACCESS_CODE) {
      try { localStorage.setItem(SITE_ACCESS_KEY, 'granted'); } catch { /* ignore */ }
      setHasCodeAccess(true);
      setCodeError(false);
    } else {
      setCodeError(true);
      setCodeInput('');
    }
  };

  return (
    <GateOverlay>
      <div style={{
        width: 'min(460px, 95vw)',
        background: 'oklch(0.09 0.005 260 / 0.92)',
        border: '1px solid oklch(0.25 0.008 260)',
        borderTop: `3px solid ${sColor.red}`,
        borderRadius: '6px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 25px 60px oklch(0 0 0 / 0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '2rem 2rem 1.5rem',
          textAlign: 'center',
          borderBottom: '1px solid oklch(0.18 0.008 260)',
        }}>
          <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '56px', height: '56px', margin: '0 auto 1rem', display: 'block' }} />
          <h1 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.1em', color: 'white', margin: '0 0 0.25rem' }}>V-OP</h1>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.50 0.010 260)', letterSpacing: '0.1em', margin: 0 }}>VEHICLE OPTIMIZER BY PPEI</p>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem 2rem 2rem', textAlign: 'center' }}>
          <p style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
            GET IN LINE
          </p>
          <p style={{ fontFamily: sFont.body, fontSize: '0.88rem', color: 'oklch(0.55 0.010 260)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Sign in with your email to request access. We'll be in touch.
          </p>

          {/* Login button */}
          <a
            href={getLoginUrl()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', padding: '12px 24px', background: sColor.red, color: 'white',
              fontFamily: sFont.heading, fontSize: '1.05rem', letterSpacing: '0.1em',
              borderRadius: '3px', border: 'none', cursor: 'pointer', textDecoration: 'none',
              transition: 'background 0.15s', boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(0.45 0.22 25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'oklch(0.52 0.22 25)')}
          >
            <LogIn style={{ width: 16, height: 16 }} />
            SIGN IN
          </a>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '1.25rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'oklch(0.22 0.008 260)' }} />
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: 'oklch(0.40 0.010 260)', letterSpacing: '0.1em' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'oklch(0.22 0.008 260)' }} />
          </div>

          {/* Access code */}
          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '10px 24px', background: 'transparent',
                color: 'oklch(0.55 0.010 260)', fontFamily: sFont.heading, fontSize: '0.95rem',
                letterSpacing: '0.1em', borderRadius: '3px', border: '1px solid oklch(0.25 0.008 260)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'oklch(0.35 0.008 260)'; e.currentTarget.style.color = 'oklch(0.70 0.010 260)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'oklch(0.25 0.008 260)'; e.currentTarget.style.color = 'oklch(0.55 0.010 260)'; }}
            >
              <KeyRound style={{ width: 14, height: 14 }} />
              ENTER ACCESS CODE
            </button>
          ) : (
            <form onSubmit={handleCodeSubmit}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={codeInput}
                  onChange={e => { setCodeInput(e.target.value); setCodeError(false); }}
                  placeholder="Access code"
                  autoFocus
                  style={{
                    flex: 1, padding: '10px 12px', fontFamily: sFont.mono, fontSize: '0.85rem',
                    background: 'oklch(0.10 0.005 260)',
                    border: `1px solid ${codeError ? sColor.red : 'oklch(0.28 0.008 260)'}`,
                    borderRadius: '3px', color: 'white', outline: 'none', letterSpacing: '0.08em',
                  }}
                />
                <button type="submit" style={{
                  padding: '10px 20px', background: sColor.red, color: 'white',
                  fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.08em',
                  borderRadius: '3px', border: 'none', cursor: 'pointer',
                }}>ENTER</button>
              </div>
              {codeError && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px', fontFamily: sFont.body, fontSize: '0.8rem', color: 'oklch(0.65 0.18 25)' }}>
                  <AlertCircle style={{ width: 12, height: 12 }} />
                  Invalid access code
                </div>
              )}
            </form>
          )}

          <p style={{
            fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.45 0.010 260)',
            textAlign: 'center', marginTop: '1.25rem', marginBottom: '0.25rem',
          }}>
            See you soon.
          </p>
          <p style={{
            fontFamily: sFont.body, fontSize: '0.72rem', color: 'oklch(0.35 0.010 260)',
            textAlign: 'center', marginTop: '0', marginBottom: 0,
          }}>
            <a href="mailto:info@ppei.com" style={{ color: sColor.red, textDecoration: 'none' }}>info@ppei.com</a>
          </p>
        </div>
      </div>
    </GateOverlay>
  );
}
