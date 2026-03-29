/**
 * SignInPrompt — Optional sign-in modal + persistent subtle banner
 *
 * Shows once on first visit. User can dismiss and continue as guest.
 * A subtle banner persists for unsigned users with a gentle nudge.
 * No feature details — just a clean prompt.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { X, LogIn, User } from 'lucide-react';

const DISMISS_KEY = 'vop-signin-dismissed';
const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

/** Full-screen sign-in modal shown on first visit */
export function SignInModal() {
  const { isAuthenticated, loading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, loading]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShow(false);
  }, []);

  const handleSignIn = useCallback(() => {
    window.location.href = getLoginUrl();
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="relative w-full max-w-md mx-4"
        style={{
          background: 'oklch(0.12 0.006 260)',
          border: '1px solid oklch(0.25 0.010 260)',
          borderRadius: '4px',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Logo */}
          <img
            src={PPEI_LOGO_URL}
            alt="V-OP by PPEI"
            className="mx-auto mb-6"
            style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
          />

          {/* Heading */}
          <h2
            style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1.8rem',
              letterSpacing: '0.06em',
              color: 'white',
              marginBottom: '0.75rem',
            }}
          >
            SIGN IN TO V-OP
          </h2>

          {/* Simple message — no feature list */}
          <p
            style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.95rem',
              color: 'oklch(0.60 0.010 260)',
              lineHeight: 1.6,
              marginBottom: '2rem',
            }}
          >
            Get the most out of your experience.
            <br />
            Some features require an account.
          </p>

          {/* Sign In button */}
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 transition-all"
            style={{
              background: 'oklch(0.52 0.22 25)',
              color: 'white',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '1.1rem',
              letterSpacing: '0.08em',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.background = 'oklch(0.58 0.22 25)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.background = 'oklch(0.52 0.22 25)';
            }}
          >
            <LogIn className="w-4 h-4" />
            SIGN IN
          </button>

          {/* Continue as guest */}
          <button
            onClick={handleDismiss}
            className="mt-3 w-full py-2.5 px-6 transition-all"
            style={{
              background: 'transparent',
              color: 'oklch(0.50 0.010 260)',
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              letterSpacing: '0.03em',
              border: '1px solid oklch(0.22 0.006 260)',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.borderColor = 'oklch(0.35 0.010 260)';
              (e.target as HTMLElement).style.color = 'oklch(0.65 0.010 260)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.borderColor = 'oklch(0.22 0.006 260)';
              (e.target as HTMLElement).style.color = 'oklch(0.50 0.010 260)';
            }}
          >
            Continue without signing in
          </button>
        </div>
      </div>
    </div>
  );
}

/** Subtle persistent banner for unsigned users */
export function SignInBanner() {
  const { isAuthenticated, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (loading || isAuthenticated || dismissed) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 py-1.5 px-4"
      style={{
        background: 'oklch(0.14 0.015 25)',
        borderBottom: '1px solid oklch(0.25 0.030 25)',
      }}
    >
      <User className="w-3 h-3 shrink-0" style={{ color: 'oklch(0.52 0.22 25)' }} />
      <span
        style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.75rem',
          color: 'oklch(0.60 0.015 25)',
          letterSpacing: '0.02em',
        }}
      >
        You're using V-OP as a guest — some features are unavailable.
      </span>
      <button
        onClick={() => { window.location.href = getLoginUrl(); }}
        style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '0.7rem',
          letterSpacing: '0.06em',
          color: 'oklch(0.52 0.22 25)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
        }}
      >
        SIGN IN
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
