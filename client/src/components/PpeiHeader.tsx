/**
 * PpeiHeader — Shared navigation header for all V-OP pages
 * Ensures consistent branding and navigation across Home, Advanced, Fleet, Drag, Community
 * Includes user menu with logout for authenticated users, sign-in for guests
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
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
  textMuted: 'oklch(0.58 0.010 260)',
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
  /** If true, only show for admin/super_admin users */
  admin?: boolean;
  /** If set, opens an external URL instead of navigating internally */
  external?: string;
}

const navItems: NavItem[] = [
  { label: 'ANALYZE', path: '/' },
  { label: 'ADVANCED', path: '/advanced' },
  { label: 'SHOP', path: '/shop', external: 'https://ppei.com/' },
  { label: 'SUPPORT', path: '/support', external: 'https://ppei.com/' },
  { label: 'COMMUNITY', path: '/community' },
];

export default function PpeiHeader() {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const visibleItems = navItems.filter(item => {
    if (item.admin && !isAdmin) return false;
    if (item.auth && !isAuthenticated) return false;
    return true;
  });

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    window.location.href = '/';
  };

  // Get user initials for avatar
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

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
              const navStyle = {
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
                textDecoration: 'none' as const,
              };
              if (item.external) {
                return (
                  <a
                    key={item.path}
                    href={item.external}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ppei-btn-hover"
                    style={navStyle}
                  >
                    {item.label}
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                      <path d="M4 1h7v7" /><path d="M11 1L1 11" />
                    </svg>
                  </a>
                );
              }
              return (
                <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
                  <div className="ppei-btn-hover" style={navStyle}>
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Right: Tier Badge + Version + Notifications + User/Auth */}
          <div className="flex items-center gap-3">
            {/* V-OP Lite / Pro tier badge */}
            {(() => {
              const isAdvanced = location.startsWith('/advanced');
              const tierLabel = isAdvanced ? 'V-OP PRO' : 'V-OP LITE';
              const tierColor = isAdvanced ? 'oklch(0.78 0.15 80)' : 'oklch(0.65 0.20 145)';
              const tierBg = isAdvanced ? 'rgba(255,200,0,0.10)' : 'rgba(0,200,100,0.10)';
              const tierBorder = isAdvanced ? 'rgba(255,200,0,0.35)' : 'rgba(0,200,100,0.35)';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.55rem',
                    fontWeight: 'bold',
                    letterSpacing: '0.08em',
                    color: tierColor,
                    background: tierBg,
                    border: `1px solid ${tierBorder}`,
                    borderRadius: '3px',
                    padding: '2px 8px',
                    lineHeight: 1.4,
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}>{tierLabel}</span>
                  {/* Upgrade prompt for non-admin users on Advanced */}
                  {isAdvanced && !isAdmin && (
                    <span
                      style={{
                        fontFamily: sFont.mono,
                        fontSize: '0.5rem',
                        letterSpacing: '0.06em',
                        color: 'oklch(0.78 0.15 80)',
                        background: 'rgba(255,200,0,0.08)',
                        border: '1px solid rgba(255,200,0,0.25)',
                        borderRadius: '3px',
                        padding: '2px 8px',
                        lineHeight: 1.4,
                        cursor: 'default',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Upgrade to V-OP Pro for full access to Advanced tools and features"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'oklch(0.78 0.15 80)' }}>
                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                      </svg>
                      UPGRADE TO PRO
                    </span>
                  )}
                </div>
              );
            })()}
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: 'oklch(0.65 0.010 260)',
              letterSpacing: '0.06em',
              padding: '2px 8px',
              border: `1px solid oklch(0.30 0.008 260)`,
              borderRadius: '2px',
              background: 'oklch(0.14 0.006 260)',
              userSelect: 'none',
            }}>{APP_VERSION}</span>
            {isAuthenticated && <NotificationBell />}

            {/* User menu or Sign In */}
            {isAuthenticated ? (
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: showUserMenu ? 'oklch(0.16 0.008 260)' : 'transparent',
                    border: `1px solid ${showUserMenu ? sColor.border : 'transparent'}`,
                    borderRadius: '3px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Avatar circle */}
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: `${sColor.red}30`,
                    border: `1px solid ${sColor.red}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: sFont.heading,
                    fontSize: '0.65rem',
                    letterSpacing: '0.04em',
                    color: sColor.red,
                  }}>
                    {initials}
                  </div>
                  {/* Chevron */}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color: sColor.textMuted }}>
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                {showUserMenu && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: '200px',
                    background: 'oklch(0.12 0.006 260)',
                    border: `1px solid ${sColor.border}`,
                    borderRadius: '4px',
                    boxShadow: '0 8px 32px oklch(0 0 0 / 0.6)',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}>
                    {/* User info */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${sColor.border}`,
                    }}>
                      <p style={{
                        fontFamily: sFont.body,
                        fontSize: '0.85rem',
                        color: 'white',
                        margin: 0,
                        fontWeight: 600,
                      }}>
                        {user?.name || 'User'}
                      </p>
                      {user?.email && (
                        <p style={{
                          fontFamily: sFont.mono,
                          fontSize: '0.65rem',
                          color: sColor.textMuted,
                          margin: '2px 0 0 0',
                        }}>
                          {user.email}
                        </p>
                      )}
                    </div>

                    {/* Logout button */}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '10px 16px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: sFont.heading,
                        fontSize: '0.78rem',
                        letterSpacing: '0.06em',
                        color: sColor.red,
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `${sColor.red}15`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      SIGN OUT
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <a
                href={getLoginUrl()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 14px',
                  background: `${sColor.red}1f`,
                  border: `1px solid ${sColor.red}4d`,
                  borderRadius: '2px',
                  fontFamily: sFont.heading,
                  fontSize: '0.78rem',
                  letterSpacing: '0.08em',
                  color: sColor.red,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                SIGN IN
              </a>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto pb-1">
          {visibleItems.map(item => {
            const isActive = location === item.path || 
              (item.path !== '/' && location.startsWith(item.path));
            const mobileNavStyle = {
              background: isActive ? sColor.navActiveBg : 'transparent',
              border: isActive ? `1px solid ${sColor.navActive}` : `1px solid transparent`,
              color: isActive ? sColor.navActive : sColor.navText,
              padding: '4px 10px',
              borderRadius: '2px',
              fontFamily: sFont.heading,
              fontSize: '0.7rem',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap' as const,
              textDecoration: 'none' as const,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            };
            if (item.external) {
              return (
                <a
                  key={item.path}
                  href={item.external}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={mobileNavStyle}
                >
                  {item.label}
                  <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                    <path d="M4 1h7v7" /><path d="M11 1L1 11" />
                  </svg>
                </a>
              );
            }
            return (
              <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
                <div style={mobileNavStyle}>
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
