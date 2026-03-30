/**
 * PpeiHeader — Shared navigation header for all V-OP pages
 * Ensures consistent branding and navigation across Home, Advanced, Fleet, Drag, Community
 */
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { NotificationBell } from '@/components/AdminNotificationPanel';
import { APP_VERSION } from '@/lib/version';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

const sFont = {
  heading: '"Bebas Neue", "Impact", "Arial Black", sans-serif',
  body: '"Rajdhani", "Segoe UI", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: 'oklch(0.08 0.004 260)',
  border: 'oklch(0.20 0.008 260)',
  textDim: 'oklch(0.60 0.010 260)',
  textMuted: 'oklch(0.45 0.010 260)',
  navBg: 'oklch(0.16 0.008 260)',
  navBorder: 'oklch(0.28 0.008 260)',
  navText: 'oklch(0.65 0.010 260)',
  navActive: 'oklch(0.52 0.22 25)',
  navActiveBg: 'oklch(0.18 0.02 25)',
};

interface NavItem {
  label: string;
  path: string;
  /** If true, only show when authenticated */
  auth?: boolean;
}

const navItems: NavItem[] = [
  { label: 'ANALYZE', path: '/' },
  { label: 'ADVANCED', path: '/advanced' },
  { label: 'FLEET', path: '/fleet', auth: true },
  { label: 'DRAG', path: '/drag' },
  { label: 'COMMUNITY', path: '/community' },
];

export default function PpeiHeader() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  const visibleItems = navItems.filter(item => !item.auth || isAuthenticated);

  return (
    <header style={{
      background: sColor.bg,
      borderBottom: `1px solid ${sColor.border}`,
      boxShadow: '0 2px 20px oklch(0 0 0 / 0.5)',
    }}>
      {/* Top accent bar */}
      <div className="ppei-accent-animated" style={{ height: '3px' }} />
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Title */}
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div className="flex items-center gap-4 cursor-pointer">
              <img
                src={PPEI_LOGO_URL}
                alt="V-OP by PPEI"
                className="ppei-logo"
                style={{ height: '52px', width: 'auto', objectFit: 'contain' }}
              />
              <div style={{ borderLeft: `3px solid ${sColor.red}`, paddingLeft: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{
                    fontFamily: sFont.heading,
                    fontSize: '1.4rem',
                    letterSpacing: '0.08em',
                    color: 'white',
                    lineHeight: 1.1,
                    margin: 0,
                  }}>V-OP</h1>
                  <span style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.5rem',
                    fontWeight: 'bold',
                    letterSpacing: '0.08em',
                    color: sColor.red,
                    background: 'rgba(255,77,0,0.12)',
                    border: '1px solid rgba(255,77,0,0.3)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    lineHeight: 1.4,
                  }}>BETA</span>
                </div>
                <p style={{
                  fontFamily: sFont.body,
                  fontSize: '0.7rem',
                  color: sColor.textDim,
                  letterSpacing: '0.05em',
                  margin: 0,
                  marginTop: '1px',
                }}>VEHICLE OPTIMIZER BY PPEI</p>
              </div>
            </div>
          </Link>

          {/* Center: Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleItems.map(item => {
              const isActive = location === item.path || 
                (item.path !== '/' && location.startsWith(item.path));
              return (
                <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
                  <div className="ppei-btn-hover" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isActive ? sColor.navActiveBg : 'transparent',
                    border: isActive ? `1px solid ${sColor.navActive}` : `1px solid transparent`,
                    color: isActive ? sColor.navActive : sColor.navText,
                    padding: '5px 14px',
                    borderRadius: '2px',
                    fontFamily: sFont.heading,
                    fontSize: '0.78rem',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Right: Version + Notifications */}
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: sColor.textMuted,
              letterSpacing: '0.06em',
              padding: '2px 8px',
              border: `1px solid oklch(0.22 0.006 260)`,
              borderRadius: '2px',
              background: 'oklch(0.12 0.004 260)',
              userSelect: 'none',
            }}>{APP_VERSION}</span>
            {isAuthenticated && <NotificationBell />}
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto pb-1">
          {visibleItems.map(item => {
            const isActive = location === item.path || 
              (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: isActive ? sColor.navActiveBg : 'transparent',
                  border: isActive ? `1px solid ${sColor.navActive}` : `1px solid transparent`,
                  color: isActive ? sColor.navActive : sColor.navText,
                  padding: '4px 10px',
                  borderRadius: '2px',
                  fontFamily: sFont.heading,
                  fontSize: '0.7rem',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
