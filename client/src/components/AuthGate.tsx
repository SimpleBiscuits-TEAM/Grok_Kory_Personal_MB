/**
 * AuthGate — Blocks all application content until the user either:
 * 1. Signs in via OAuth
 * 2. Enters a valid access code
 * 3. Arrives via a valid share token (?share_token=xxx)
 *
 * Share tokens grant single-session, single-page access.
 * The viewer is locked to the allowed path and cannot navigate elsewhere.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import { Loader2, Lock, KeyRound, LogIn, ShieldCheck, AlertCircle } from 'lucide-react';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

// PPEI brand colors
const sColor = {
  bg: '#0a0a0a',
  surface: '#111111',
  border: 'oklch(0.25 0.01 260)',
  red: 'oklch(0.52 0.22 25)',
  redBright: 'oklch(0.58 0.22 25)',
  text: '#ffffff',
  textMuted: 'oklch(0.65 0.01 260)',
  textDim: 'oklch(0.45 0.01 260)',
};

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * ShareLock wraps children and prevents navigation away from the allowed path.
 * It intercepts clicks on <a> tags and blocks wouter navigation.
 */
function ShareLock({ allowedPath, children }: { allowedPath: string; children: React.ReactNode }) {
  useEffect(() => {
    // Force navigate to the allowed path on mount
    if (window.location.pathname !== allowedPath) {
      window.history.replaceState(null, '', allowedPath);
    }

    // Intercept all click events on links
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href) return;
      // Allow external links (open in new tab)
      if (href.startsWith('http') || href.startsWith('//')) return;
      // Allow same-page anchors
      if (href.startsWith('#')) return;
      // Block navigation to any other internal page
      const targetPath = href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
      const allowed = allowedPath.replace(/\/+$/, '') || '/';
      if (targetPath !== allowed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Intercept popstate (back/forward)
    const handlePopState = () => {
      if (window.location.pathname !== allowedPath) {
        window.history.replaceState(null, '', allowedPath);
      }
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [allowedPath]);

  return <>{children}</>;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { data: accessData, isLoading } = trpc.auth.checkAccess.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [granted, setGranted] = useState(false);

  // Share token state
  const [shareAllowedPath, setShareAllowedPath] = useState<string | null>(null);
  const [shareTokenChecking, setShareTokenChecking] = useState(false);
  const [shareTokenError, setShareTokenError] = useState('');

  const verifyMutation = trpc.auth.verifyAccessCode.useMutation();
  const shareTokenMutation = trpc.auth.validateShareToken.useMutation();

  // Extract share_token from URL on mount
  const shareTokenFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share_token');
  }, []);

  // Auto-validate share token on mount
  useEffect(() => {
    if (!shareTokenFromUrl) return;
    setShareTokenChecking(true);
    shareTokenMutation.mutateAsync({ token: shareTokenFromUrl })
      .then((result) => {
        if (result.success && 'allowedPath' in result) {
          setShareAllowedPath(result.allowedPath);
          setGranted(true);
          // Clean the token from the URL so it can't be reused
          const url = new URL(window.location.href);
          url.searchParams.delete('share_token');
          window.history.replaceState(null, '', result.allowedPath);
        } else {
          setShareTokenError(('message' in result ? result.message : null) || 'Invalid share link');
        }
      })
      .catch(() => {
        setShareTokenError('Failed to validate share link');
      })
      .finally(() => {
        setShareTokenChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareTokenFromUrl]);

  // If already authenticated via OAuth/access code
  useEffect(() => {
    if (accessData?.authenticated) {
      setGranted(true);
    }
  }, [accessData]);

  const handleAccessCode = useCallback(async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code');
      return;
    }
    setIsVerifying(true);
    setError('');
    try {
      const result = await verifyMutation.mutateAsync({ code: accessCode.trim() });
      if (result.success) {
        setGranted(true);
      } else {
        setError(result.message || 'Invalid access code');
      }
    } catch {
      setError('Failed to verify access code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }, [accessCode, verifyMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAccessCode();
  }, [handleAccessCode]);

  // Loading state (either checking access or validating share token)
  if (isLoading || shareTokenChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: sColor.bg,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Loader2 style={{ width: 40, height: 40, color: sColor.red, animation: 'spin 1s linear infinite' }} />
          <span style={{
            fontFamily: '"Share Tech Mono", monospace',
            color: sColor.textMuted,
            fontSize: '0.8rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            {shareTokenChecking ? 'VALIDATING SHARE LINK...' : 'VERIFYING ACCESS...'}
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Authenticated — render app (with optional page lock for share tokens)
  if (granted) {
    if (shareAllowedPath) {
      return <ShareLock allowedPath={shareAllowedPath}>{children}</ShareLock>;
    }
    return <>{children}</>;
  }

  // Gate — show login / access code form (with share token error if applicable)
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: sColor.bg,
      fontFamily: '"Rajdhani", sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        padding: '0 24px',
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
            src={PPEI_LOGO_URL}
            alt="PPEI"
            style={{ width: 80, height: 80, margin: '0 auto 16px', display: 'block' }}
          />
          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '2.4rem',
            color: sColor.text,
            letterSpacing: '0.08em',
            margin: 0,
            lineHeight: 1,
          }}>
            V-OP
          </h1>
          <p style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.7rem',
            color: sColor.textDim,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginTop: 4,
          }}>
            VEHICLE OPTIMIZER BY PPEI
          </p>
        </div>

        {/* Share Token Error Banner */}
        {shareTokenError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            background: 'oklch(0.52 0.22 25 / 0.1)',
            border: '1px solid oklch(0.52 0.22 25 / 0.3)',
            marginBottom: 20,
          }}>
            <AlertCircle style={{ width: 16, height: 16, color: sColor.red, flexShrink: 0 }} />
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.75rem',
              color: sColor.red,
              letterSpacing: '0.05em',
            }}>
              {shareTokenError}
            </span>
          </div>
        )}

        {/* Gate Card */}
        <div style={{
          background: sColor.surface,
          border: `1px solid ${sColor.border}`,
          padding: 32,
        }}>
          {/* Lock Icon Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'oklch(0.52 0.22 25 / 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <Lock style={{ width: 28, height: 28, color: sColor.red }} />
            </div>
            <h2 style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '1.4rem',
              color: sColor.text,
              letterSpacing: '0.06em',
              margin: 0,
            }}>
              RESTRICTED ACCESS
            </h2>
            <p style={{
              fontSize: '0.85rem',
              color: sColor.textMuted,
              marginTop: 6,
            }}>
              Sign in or enter your access code to continue
            </p>
          </div>

          {/* Sign In Button */}
          <a
            href={getLoginUrl()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '12px 0',
              background: sColor.red,
              color: '#fff',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '1.1rem',
              letterSpacing: '0.1em',
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = sColor.redBright)}
            onMouseLeave={(e) => (e.currentTarget.style.background = sColor.red)}
          >
            <LogIn style={{ width: 18, height: 18 }} />
            SIGN IN, HUMAN :-)
          </a>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '20px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: sColor.border }} />
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.65rem',
              color: sColor.textDim,
              letterSpacing: '0.15em',
            }}>
              OR
            </span>
            <div style={{ flex: 1, height: 1, background: sColor.border }} />
          </div>

          {/* Access Code Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.7rem',
              color: sColor.textMuted,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              <KeyRound style={{ width: 14, height: 14 }} />
              ACCESS CODE
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="ENTER CODE"
                autoComplete="off"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: sColor.bg,
                  border: `1px solid ${error ? 'oklch(0.55 0.20 25)' : sColor.border}`,
                  color: sColor.text,
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.9rem',
                  letterSpacing: '0.15em',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAccessCode}
                disabled={isVerifying || !accessCode.trim()}
                style={{
                  padding: '10px 20px',
                  background: isVerifying ? sColor.border : sColor.bg,
                  border: `1px solid ${sColor.border}`,
                  color: isVerifying ? sColor.textDim : sColor.text,
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '0.95rem',
                  letterSpacing: '0.1em',
                  cursor: isVerifying ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { if (!isVerifying) e.currentTarget.style.borderColor = sColor.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = sColor.border; }}
              >
                {isVerifying ? (
                  <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <ShieldCheck style={{ width: 16, height: 16 }} />
                )}
                VERIFY
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                background: 'oklch(0.52 0.22 25 / 0.08)',
                border: '1px solid oklch(0.52 0.22 25 / 0.25)',
              }}>
                <AlertCircle style={{ width: 14, height: 14, color: sColor.red, flexShrink: 0 }} />
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.7rem',
                  color: sColor.red,
                  letterSpacing: '0.05em',
                }}>
                  {error}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.6rem',
          color: sColor.textDim,
          letterSpacing: '0.1em',
          marginTop: 20,
        }}>
          PPEI PERFORMANCE &middot; VEHICLE OPTIMIZER PLATFORM
        </p>
      </div>
    </div>
  );
}
