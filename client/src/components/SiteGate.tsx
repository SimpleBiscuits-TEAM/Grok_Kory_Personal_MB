/**
 * SiteGate — Requires login OR access code to view any page on the site.
 * Wraps the entire app. If the user is authenticated or has entered the
 * correct access code (stored in localStorage), children render normally.
 * Otherwise, a full-screen gate is shown.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { Lock, LogIn, KeyRound, AlertCircle, Loader2 } from 'lucide-react';

const SITE_ACCESS_KEY = 'vop_site_access';
const ACCESS_CODE = 'KingKONG';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

export function SiteGate({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
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

  // If user is authenticated, grant access
  if (loading) {
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

  if (isAuthenticated || hasCodeAccess) {
    return <>{children}</>;
  }

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput === ACCESS_CODE) {
      try {
        localStorage.setItem(SITE_ACCESS_KEY, 'granted');
      } catch { /* ignore */ }
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
          <img
            src={PPEI_LOGO_URL}
            alt="PPEI"
            style={{ width: '56px', height: '56px', margin: '0 auto 1rem', display: 'block' }}
          />
          <h1 style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1.8rem',
            letterSpacing: '0.1em',
            color: 'white',
            margin: '0 0 0.25rem',
          }}>V-OP</h1>
          <p style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.7rem',
            color: 'oklch(0.50 0.010 260)',
            letterSpacing: '0.1em',
            margin: 0,
          }}>VEHICLE OPTIMIZER BY PPEI</p>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem 2rem 2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '1.25rem',
          }}>
            <Lock style={{ width: 16, height: 16, color: 'oklch(0.52 0.22 25)' }} />
            <p style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.9rem',
              color: 'oklch(0.65 0.010 260)',
              margin: 0,
            }}>
              This application requires authorization to access.
            </p>
          </div>

          {/* Login button */}
          <a
            href={getLoginUrl()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 24px',
              background: 'oklch(0.52 0.22 25)',
              color: 'white',
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1.05rem',
              letterSpacing: '0.1em',
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'background 0.15s',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(0.45 0.22 25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'oklch(0.52 0.22 25)')}
          >
            <LogIn style={{ width: 16, height: 16 }} />
            SIGN IN
          </a>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '1.25rem 0',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'oklch(0.22 0.008 260)' }} />
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.65rem',
              color: 'oklch(0.40 0.010 260)',
              letterSpacing: '0.1em',
            }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'oklch(0.22 0.008 260)' }} />
          </div>

          {/* Access code toggle */}
          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 24px',
                background: 'transparent',
                color: 'oklch(0.55 0.010 260)',
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '0.95rem',
                letterSpacing: '0.1em',
                borderRadius: '3px',
                border: '1px solid oklch(0.25 0.008 260)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'oklch(0.35 0.008 260)';
                e.currentTarget.style.color = 'oklch(0.70 0.010 260)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'oklch(0.25 0.008 260)';
                e.currentTarget.style.color = 'oklch(0.55 0.010 260)';
              }}
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
                    flex: 1,
                    padding: '10px 12px',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.85rem',
                    background: 'oklch(0.10 0.005 260)',
                    border: `1px solid ${codeError ? 'oklch(0.52 0.22 25)' : 'oklch(0.28 0.008 260)'}`,
                    borderRadius: '3px',
                    color: 'white',
                    outline: 'none',
                    letterSpacing: '0.08em',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'oklch(0.52 0.22 25)',
                    color: 'white',
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '0.9rem',
                    letterSpacing: '0.08em',
                    borderRadius: '3px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  ENTER
                </button>
              </div>
              {codeError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '8px',
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.8rem',
                  color: 'oklch(0.65 0.18 25)',
                }}>
                  <AlertCircle style={{ width: 12, height: 12 }} />
                  Invalid access code
                </div>
              )}
            </form>
          )}

          {/* Contact info */}
          <p style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.75rem',
            color: 'oklch(0.40 0.010 260)',
            textAlign: 'center',
            marginTop: '1.5rem',
            marginBottom: 0,
          }}>
            Need access? Contact PPEI at{' '}
            <a href="mailto:info@ppei.com" style={{ color: 'oklch(0.52 0.22 25)', textDecoration: 'none' }}>
              info@ppei.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
