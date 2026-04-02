/**
 * AuthGate — Blocks all application content until the user either:
 * 1. Signs in via OAuth
 * 2. Enters a valid access code
 * 3. Arrives via a valid share token (?share_token=xxx) AND has a verified NDA
 *
 * Share token flow: validate token → sign NDA (if needed) → VOP verifies → access granted.
 * NDA is tied to signer email, valid for 180 days. Once verified, works across all tokens.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import { Loader2, Lock, KeyRound, LogIn, ShieldCheck, AlertCircle } from 'lucide-react';
import NdaSigningPage from './NdaSigningPage';
import ScreenGuard from './ScreenGuard';

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

// ── Particle Engine ─────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  type: 'dot' | 'line' | 'hex';
}

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    const maxParticles = 60;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (): Particle => {
      const types: Particle['type'][] = ['dot', 'line', 'hex'];
      const type = types[Math.floor(Math.random() * types.length)];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.3 - 0.1,
        size: type === 'hex' ? Math.random() * 8 + 4 : Math.random() * 2 + 1,
        opacity: Math.random() * 0.3 + 0.05,
        life: 0,
        maxLife: Math.random() * 400 + 200,
        type,
      };
    };

    // Pre-fill
    for (let i = 0; i < maxParticles; i++) {
      const p = spawn();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    const drawHex = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.08 * Math.min(particles[i].opacity, particles[j].opacity) / 0.35;
            ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Fade in/out
        const progress = p.life / p.maxLife;
        const fade = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
        const alpha = p.opacity * fade;

        if (p.type === 'dot') {
          ctx.fillStyle = `rgba(220, 38, 38, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'line') {
          ctx.strokeStyle = `rgba(220, 38, 38, ${alpha * 0.7})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x - p.size * 4, p.y);
          ctx.lineTo(p.x + p.size * 4, p.y);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(220, 38, 38, ${alpha * 0.5})`;
          ctx.lineWidth = 0.5;
          drawHex(p.x, p.y, p.size);
          ctx.stroke();
        }

        // Respawn
        if (p.life >= p.maxLife || p.y < -10 || p.x < -10 || p.x > canvas.width + 10) {
          particles[idx] = spawn();
        }
      });

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

// ── Turbo Spool Ring ────────────────────────────────────────────────────────
function TurboSpoolRing() {
  return (
    <div style={{
      position: 'absolute',
      width: 500,
      height: 500,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 0,
    }}>
      {/* Outer ring — slow rotation */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '1px solid rgba(220, 38, 38, 0.06)',
        animation: 'authTurboSpin 20s linear infinite',
      }} />
      {/* Middle ring — medium rotation */}
      <div style={{
        position: 'absolute',
        inset: 40,
        borderRadius: '50%',
        border: '1px dashed rgba(220, 38, 38, 0.08)',
        animation: 'authTurboSpin 12s linear infinite reverse',
      }} />
      {/* Inner ring — fast rotation with glow */}
      <div style={{
        position: 'absolute',
        inset: 90,
        borderRadius: '50%',
        border: '1px solid rgba(220, 38, 38, 0.04)',
        boxShadow: '0 0 40px rgba(220, 38, 38, 0.03), inset 0 0 40px rgba(220, 38, 38, 0.02)',
        animation: 'authTurboSpin 8s linear infinite',
      }} />
      {/* Tick marks on outer ring */}
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: 1,
          height: i % 3 === 0 ? 12 : 6,
          background: `rgba(220, 38, 38, ${i % 3 === 0 ? 0.15 : 0.06})`,
          top: '50%',
          left: '50%',
          transformOrigin: '0 0',
          transform: `rotate(${i * 15}deg) translateY(-250px)`,
        }} />
      ))}
    </div>
  );
}

// ── Data Stream Effect ──────────────────────────────────────────────────────
function DataStream() {
  const columns = 8;
  const chars = '01ABCDEF0123456789FFFF00AABB';
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
      opacity: 0.03,
    }}>
      {Array.from({ length: columns }).map((_, col) => (
        <div key={col} style={{
          position: 'absolute',
          left: `${(col / columns) * 100}%`,
          top: 0,
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '10px',
          lineHeight: '14px',
          color: '#dc2626',
          whiteSpace: 'pre',
          animation: `authDataFall ${6 + col * 0.8}s linear infinite`,
          animationDelay: `${col * -1.5}s`,
        }}>
          {Array.from({ length: 80 }).map((_, i) => (
            <div key={i}>{chars.slice(Math.floor(Math.random() * chars.length - 4), Math.floor(Math.random() * chars.length - 4) + 4).padEnd(4, '0')}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * ShareLock wraps children and prevents navigation away from the allowed path.
 */
function ShareLock({ allowedPath, children }: { allowedPath: string; children: React.ReactNode }) {
  useEffect(() => {
    if (window.location.pathname !== allowedPath) {
      window.history.replaceState(null, '', allowedPath);
    }
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href) return;
      if (href.startsWith('http') || href.startsWith('//')) return;
      if (href.startsWith('#')) return;
      const targetPath = href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
      const allowed = allowedPath.replace(/\/+$/, '') || '/';
      if (targetPath !== allowed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
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
  const [shakeKey, setShakeKey] = useState(0);

  // Share token state
  const [shareAllowedPath, setShareAllowedPath] = useState<string | null>(null);
  const [shareTokenId, setShareTokenId] = useState<number | null>(null);
  const [shareTokenChecking, setShareTokenChecking] = useState(false);
  const [shareTokenError, setShareTokenError] = useState('');
  const [shareTokenValid, setShareTokenValid] = useState(false);

  // NDA state for share token flow
  const [ndaVerified, setNdaVerified] = useState(false);
  const [shareSignerEmail, setShareSignerEmail] = useState<string>('');

  // Canvas ref for particle engine
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticleCanvas(canvasRef);

  // Entrance animation state
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const verifyMutation = trpc.auth.verifyAccessCode.useMutation();
  const shareTokenMutation = trpc.auth.validateShareToken.useMutation();

  const shareTokenFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share_token');
  }, []);

  useEffect(() => {
    if (!shareTokenFromUrl) return;
    setShareTokenChecking(true);
    shareTokenMutation.mutateAsync({ token: shareTokenFromUrl })
      .then((result) => {
        if (result.success && 'allowedPath' in result) {
          setShareAllowedPath(result.allowedPath);
          setShareTokenId(result.tokenId);
          setShareTokenValid(true);
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

  useEffect(() => {
    if (accessData?.authenticated) {
      setGranted(true);
    }
  }, [accessData]);

  const handleNdaVerified = useCallback((email?: string) => {
    setNdaVerified(true);
    setGranted(true);
    if (email) setShareSignerEmail(email);
  }, []);

  const handleAccessCode = useCallback(async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code');
      setShakeKey(k => k + 1);
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
        setShakeKey(k => k + 1);
      }
    } catch {
      setError('Failed to verify access code. Please try again.');
      setShakeKey(k => k + 1);
    } finally {
      setIsVerifying(false);
    }
  }, [accessCode, verifyMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAccessCode();
  }, [handleAccessCode]);

  // ── Loading state ─────────────────────────────────────────────────────
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

  // ── NDA flow for share tokens ─────────────────────────────────────────
  if (shareTokenValid && !granted && shareTokenId !== null) {
    return (
      <NdaSigningPage
        tokenId={shareTokenId}
        onNdaSigned={handleNdaVerified}
      />
    );
  }


  // ── Authenticated — render app ────────────────────────────────────────
  if (granted) {
    if (shareAllowedPath) {
      return (
        <ShareLock allowedPath={shareAllowedPath}>
          <ScreenGuard active={true} signerEmail={shareSignerEmail} />
          {children}
        </ShareLock>
      );
    }
    return <>{children}</>;
  }

  // ── GATE — Killer animated sign-in ────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: sColor.bg,
      fontFamily: '"Rajdhani", sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animations keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes authTurboSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes authDataFall {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes authLogoGlow {
          0%, 100% {
            filter: drop-shadow(0 0 8px rgba(220, 38, 38, 0));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 24px rgba(220, 38, 38, 0.6)) drop-shadow(0 0 48px rgba(220, 38, 38, 0.2));
            transform: scale(1.02);
          }
        }
        @keyframes authFormSlideUp {
          0% { opacity: 0; transform: translateY(40px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes authInputIgnite {
          0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); border-color: oklch(0.25 0.01 260); }
          100% { box-shadow: 0 0 12px 2px rgba(220, 38, 38, 0.25), 0 0 4px 0 rgba(220, 38, 38, 0.4); border-color: oklch(0.52 0.22 25); }
        }
        @keyframes authPulseRing {
          0% { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes authScanLine {
          0% { top: -2px; opacity: 0.6; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes authRevealLeft {
          0% { width: 0; }
          100% { width: 100%; }
        }
        @keyframes authGlitch {
          0%, 100% { clip-path: inset(0 0 0 0); }
          20% { clip-path: inset(10% 0 80% 0); }
          40% { clip-path: inset(50% 0 30% 0); }
          60% { clip-path: inset(20% 0 60% 0); }
          80% { clip-path: inset(70% 0 10% 0); }
        }
        @keyframes authShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        .auth-input-focus:focus {
          animation: authInputIgnite 0.3s ease forwards;
          outline: none;
        }
        .auth-btn-glow:hover {
          box-shadow: 0 0 20px rgba(220, 38, 38, 0.4), 0 0 40px rgba(220, 38, 38, 0.1);
        }
      `}</style>

      {/* Canvas particle background */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Turbo spool rings */}
      <TurboSpoolRing />

      {/* Data stream columns */}
      <DataStream />

      {/* Radial gradient overlay — focuses attention on center */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 20%, #0a0a0a 70%)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* Scan line sweeping across the card */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.3), transparent)',
        animation: 'authScanLine 3s linear infinite',
        zIndex: 2,
        pointerEvents: 'none',
      }} />

      {/* Main content */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        padding: '0 24px',
        position: 'relative',
        zIndex: 10,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.96)',
        transition: 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        {/* Logo & Title */}
        <div style={{
          textAlign: 'center',
          marginBottom: 40,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.15s',
        }}>
          {/* Logo with glow pulse */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={PPEI_LOGO_URL}
              alt="PPEI"
              style={{
                width: 90,
                height: 90,
                margin: '0 auto 16px',
                display: 'block',
                animation: 'authLogoGlow 3s ease-in-out infinite',
              }}
            />
            {/* Pulse ring behind logo */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 90,
              height: 90,
              marginTop: -53,
              marginLeft: -45,
              borderRadius: '50%',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              animation: 'authPulseRing 3s ease-out infinite',
              pointerEvents: 'none',
            }} />
          </div>
          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '2.8rem',
            color: sColor.text,
            letterSpacing: '0.12em',
            margin: 0,
            lineHeight: 1,
            textShadow: '0 0 30px rgba(220, 38, 38, 0.15)',
          }}>
            V-OP
          </h1>
          <p style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.7rem',
            color: sColor.textDim,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginTop: 6,
          }}>
            VEHICLE OPTIMIZER BY PPEI
          </p>
          {/* Animated accent line under title */}
          <div style={{
            width: mounted ? 120 : 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, #dc2626, transparent)',
            margin: '12px auto 0',
            transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1) 0.5s',
          }} />
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
            animation: 'authFormSlideUp 0.4s ease both',
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
          background: 'rgba(17, 17, 17, 0.85)',
          backdropFilter: 'blur(12px)',
          border: `1px solid rgba(220, 38, 38, 0.12)`,
          padding: 32,
          position: 'relative',
          overflow: 'hidden',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s',
        }}>
          {/* Card scan line */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.4), transparent)',
            animation: 'authScanLine 4s linear infinite',
            animationDelay: '1s',
          }} />

          {/* Red accent line at top of card */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 2,
            background: '#dc2626',
            animation: mounted ? 'authRevealLeft 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.8s both' : 'none',
          }} />

          {/* Lock Icon Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: 24,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'scale(1)' : 'scale(0.8)',
            transition: 'all 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.5s',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'oklch(0.52 0.22 25 / 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 0 20px rgba(220, 38, 38, 0.15)',
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
              Enter your access code to continue
            </p>
          </div>



          {/* Access Code Input — with shake on error */}
          <div
            key={shakeKey}
            style={{
              display: 'flex',
              gap: 8,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(15px)',
              transition: 'all 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.8s',
              animation: shakeKey > 0 ? 'authShake 0.4s ease-in-out' : 'none',
            }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <KeyRound style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                color: sColor.textDim,
                zIndex: 1,
              }} />
              <input
                type="text"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="Access code"
                className="auth-input-focus"
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  background: 'rgba(10, 10, 10, 0.8)',
                  border: `1px solid ${error ? 'rgba(220, 38, 38, 0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: sColor.text,
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.85rem',
                  letterSpacing: '0.1em',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              />
            </div>
            <button
              onClick={handleAccessCode}
              disabled={isVerifying}
              className="auth-btn-glow"
              style={{
                padding: '12px 18px',
                background: 'transparent',
                border: `1px solid rgba(255, 255, 255, 0.08)`,
                color: sColor.textMuted,
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '0.95rem',
                letterSpacing: '0.08em',
                cursor: isVerifying ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.5)';
                e.currentTarget.style.color = sColor.text;
                e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = sColor.textMuted;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {isVerifying ? (
                <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
              ) : (
                <ShieldCheck style={{ width: 16, height: 16 }} />
              )}
              VERIFY
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              color: sColor.red,
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              animation: 'authFormSlideUp 0.3s ease both',
            }}>
              <AlertCircle style={{ width: 14, height: 14 }} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.6rem',
          color: 'rgba(255, 255, 255, 0.15)',
          letterSpacing: '0.15em',
          marginTop: 28,
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1s ease 1s',
        }}>
          ALL ACCESS IS MONITORED AND LOGGED
        </p>
      </div>
    </div>
  );
}
