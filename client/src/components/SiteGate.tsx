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
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import { Lock, LogIn, KeyRound, AlertCircle, Loader2, Clock, ShieldX, Send } from 'lucide-react';

const SITE_ACCESS_KEY = 'vop_site_access';
const ACCESS_CODE = 'KingKONG';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

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
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Loader2 style={{ width: 32, height: 32, color: 'oklch(0.52 0.22 25)', animation: 'spin 1s linear infinite' }} />
      </div>
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
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}>
        <div style={{
          width: 'min(440px, 95vw)',
          background: 'oklch(0.11 0.005 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderTop: '3px solid oklch(0.52 0.22 25)',
          borderRadius: '4px',
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
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: 'oklch(0.75 0.18 60)' }}>ACCESS REQUEST PENDING</span>
                </div>
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', lineHeight: 1.6 }}>
                  Your request is being reviewed by the PPEI team. You'll receive access once approved.
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
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                  V-OP requires approval from PPEI to access. Request access below.
                </p>
                <button
                  onClick={() => requestAccess.mutate()}
                  disabled={requestAccess.isPending}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'oklch(0.52 0.22 25)', color: 'white', fontFamily: sFont.heading,
                    fontSize: '1rem', letterSpacing: '0.1em', padding: '12px 32px',
                    borderRadius: '3px', border: 'none', cursor: 'pointer',
                  }}
                >
                  {requestAccess.isPending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Send style={{ width: 16, height: 16 }} />}
                  REQUEST ACCESS
                </button>
              </>
            )}

            <p style={{
              fontFamily: sFont.body, fontSize: '0.75rem', color: 'oklch(0.40 0.010 260)',
              textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
            }}>
              Contact PPEI at{' '}
              <a href="mailto:info@ppei.com" style={{ color: 'oklch(0.52 0.22 25)', textDecoration: 'none' }}>info@ppei.com</a>
            </p>
          </div>
        </div>
      </div>
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
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: 'min(440px, 95vw)',
        background: 'oklch(0.11 0.005 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderTop: '3px solid oklch(0.52 0.22 25)',
        borderRadius: '4px',
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
        <div style={{ padding: '1.5rem 2rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
            <Lock style={{ width: 16, height: 16, color: 'oklch(0.52 0.22 25)' }} />
            <p style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'oklch(0.65 0.010 260)', margin: 0 }}>
              This application requires authorization to access.
            </p>
          </div>

          {/* Login button */}
          <a
            href={getLoginUrl()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', padding: '12px 24px', background: 'oklch(0.52 0.22 25)', color: 'white',
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
                    border: `1px solid ${codeError ? 'oklch(0.52 0.22 25)' : 'oklch(0.28 0.008 260)'}`,
                    borderRadius: '3px', color: 'white', outline: 'none', letterSpacing: '0.08em',
                  }}
                />
                <button type="submit" style={{
                  padding: '10px 20px', background: 'oklch(0.52 0.22 25)', color: 'white',
                  fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.08em',
                  borderRadius: '3px', border: 'none', cursor: 'pointer',
                }}>ENTER</button>
              </div>
              {codeError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontFamily: sFont.body, fontSize: '0.8rem', color: 'oklch(0.65 0.18 25)' }}>
                  <AlertCircle style={{ width: 12, height: 12 }} />
                  Invalid access code
                </div>
              )}
            </form>
          )}

          <p style={{
            fontFamily: sFont.body, fontSize: '0.75rem', color: 'oklch(0.40 0.010 260)',
            textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
          }}>
            Need access? Contact PPEI at{' '}
            <a href="mailto:info@ppei.com" style={{ color: 'oklch(0.52 0.22 25)', textDecoration: 'none' }}>info@ppei.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
