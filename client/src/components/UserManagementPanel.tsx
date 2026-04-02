/**
 * User Management Panel — Admin Panel for V-OP Pro
 * 
 * Allows admins to:
 * - View all registered users with access status
 * - Approve/revoke Advanced (V-OP Pro) access
 * - Set access levels (1-3) for approved users
 * - Super admins can promote/demote users to admin role
 * - Filter by status: all, pending, approved, revoked, admin
 * - Search by name or email
 */

import { useState, useMemo } from 'react';
import {
  Users, Shield, ShieldCheck, ShieldX, UserCheck, UserX, Search,
  ChevronDown, ChevronUp, Clock, AlertCircle, Crown, Star,
  Check, X, Filter,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  bgHover: 'oklch(0.36 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.60 0.20 300)',
  orange: 'oklch(0.70 0.18 50)',
};

type FilterType = 'all' | 'pending' | 'approved' | 'revoked' | 'admin' | 'none';

function getRoleBadge(role: string) {
  switch (role) {
    case 'super_admin':
      return { label: 'OWNER', color: sColor.red, icon: <Crown style={{ width: 10, height: 10 }} /> };
    case 'admin':
      return { label: 'ADMIN', color: sColor.purple, icon: <Shield style={{ width: 10, height: 10 }} /> };
    default:
      return { label: 'USER', color: sColor.textMuted, icon: <Users style={{ width: 10, height: 10 }} /> };
  }
}

function getAccessBadge(access: string) {
  switch (access) {
    case 'approved':
      return { label: 'APPROVED', color: sColor.green, icon: <ShieldCheck style={{ width: 10, height: 10 }} /> };
    case 'pending':
      return { label: 'PENDING', color: sColor.yellow, icon: <Clock style={{ width: 10, height: 10 }} /> };
    case 'revoked':
      return { label: 'REVOKED', color: sColor.red, icon: <ShieldX style={{ width: 10, height: 10 }} /> };
    default:
      return { label: 'NO ACCESS', color: sColor.textMuted, icon: <X style={{ width: 10, height: 10 }} /> };
  }
}

function Badge({ label, color, icon }: { label: string; color: string; icon: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 8px', borderRadius: '3px',
      background: `${color}20`, border: `1px solid ${color}40`,
      color, fontFamily: sFont.mono, fontSize: '0.55rem',
      letterSpacing: '0.05em', lineHeight: 1,
    }}>
      {icon} {label}
    </span>
  );
}

function LevelIndicator({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[1, 2, 3].map(l => (
        <div key={l} style={{
          width: '6px', height: '6px', borderRadius: '1px',
          background: l <= level ? sColor.blue : `${sColor.textMuted}30`,
          transition: 'background 0.2s ease',
        }} />
      ))}
      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginLeft: '4px' }}>
        L{level}
      </span>
    </div>
  );
}

// ── User Row ────────────────────────────────────────────────────────────────

function UserRow({ user, isSuperAdmin, onRefresh }: {
  user: any;
  isSuperAdmin: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [levelInput, setLevelInput] = useState(user.accessLevel);

  const approveAccess = trpc.access.approveAccess.useMutation({
    onSuccess: (data) => { toast.success(`Approved access for ${data.userName || 'user'}`); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const revokeAccess = trpc.access.revokeAccess.useMutation({
    onSuccess: (data) => { toast.success(`Revoked access for ${data.userName || 'user'}`); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const setAccessLevel = trpc.access.setAccessLevel.useMutation({
    onSuccess: () => { toast.success('Access level updated'); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const setRole = trpc.access.setRole.useMutation({
    onSuccess: (data) => { toast.success(`${data.userName} is now ${data.newRole}`); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const roleBadge = getRoleBadge(user.role);
  const accessBadge = getAccessBadge(user.advancedAccess);
  const isOwner = user.role === 'super_admin';
  const isPending = user.advancedAccess === 'pending';

  return (
    <div style={{
      background: isPending ? `${sColor.yellow}08` : sColor.bgCard,
      border: `1px solid ${isPending ? `${sColor.yellow}30` : sColor.border}`,
      borderLeft: isPending ? `3px solid ${sColor.yellow}` : `1px solid ${sColor.border}`,
      borderRadius: '4px',
      marginBottom: '4px',
      transition: 'all 0.2s ease',
    }}>
      {/* Main row */}
      <div
        onClick={() => !isOwner && setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', padding: '10px 12px',
          cursor: isOwner ? 'default' : 'pointer', gap: '12px',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '4px',
          background: `${roleBadge.color}20`, border: `1px solid ${roleBadge.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: roleBadge.color, fontSize: '0.7rem', fontFamily: sFont.heading,
          flexShrink: 0,
        }}>
          {(user.name || '?')[0].toUpperCase()}
        </div>

        {/* Name & email */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.text,
            fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.name || 'Unnamed User'}
          </div>
          <div style={{
            fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.email || 'No email'}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          <Badge {...roleBadge} />
          {user.role !== 'super_admin' && <Badge {...accessBadge} />}
          {user.advancedAccess === 'approved' && <LevelIndicator level={user.accessLevel} />}
        </div>

        {/* Quick actions for pending */}
        {isPending && !isOwner && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => approveAccess.mutate({ userId: user.id, accessLevel: 1 })}
              disabled={approveAccess.isPending}
              style={{
                background: `${sColor.green}20`, border: `1px solid ${sColor.green}40`,
                borderRadius: '3px', padding: '4px 8px', cursor: 'pointer',
                color: sColor.green, fontFamily: sFont.mono, fontSize: '0.55rem',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}
            >
              <Check style={{ width: 10, height: 10 }} /> APPROVE
            </button>
            <button
              onClick={() => revokeAccess.mutate({ userId: user.id })}
              disabled={revokeAccess.isPending}
              style={{
                background: `${sColor.red}20`, border: `1px solid ${sColor.red}40`,
                borderRadius: '3px', padding: '4px 8px', cursor: 'pointer',
                color: sColor.red, fontFamily: sFont.mono, fontSize: '0.55rem',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}
            >
              <X style={{ width: 10, height: 10 }} /> DENY
            </button>
          </div>
        )}

        {/* Expand arrow */}
        {!isOwner && (
          <div style={{ color: sColor.textMuted, flexShrink: 0 }}>
            {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
          </div>
        )}
      </div>

      {/* Expanded actions */}
      {expanded && !isOwner && (
        <div style={{
          borderTop: `1px solid ${sColor.border}`,
          padding: '12px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          {/* Access control */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, width: '80px' }}>
              V-OP PRO:
            </span>
            {user.advancedAccess !== 'approved' ? (
              <button
                onClick={() => approveAccess.mutate({ userId: user.id, accessLevel: 1 })}
                disabled={approveAccess.isPending}
                style={{
                  background: `${sColor.green}15`, border: `1px solid ${sColor.green}40`,
                  borderRadius: '3px', padding: '4px 12px', cursor: 'pointer',
                  color: sColor.green, fontFamily: sFont.mono, fontSize: '0.6rem',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <UserCheck style={{ width: 12, height: 12 }} /> GRANT ACCESS
              </button>
            ) : (
              <button
                onClick={() => revokeAccess.mutate({ userId: user.id })}
                disabled={revokeAccess.isPending}
                style={{
                  background: `${sColor.red}15`, border: `1px solid ${sColor.red}40`,
                  borderRadius: '3px', padding: '4px 12px', cursor: 'pointer',
                  color: sColor.red, fontFamily: sFont.mono, fontSize: '0.6rem',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <UserX style={{ width: 12, height: 12 }} /> REVOKE ACCESS
              </button>
            )}
          </div>

          {/* Access level */}
          {user.advancedAccess === 'approved' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, width: '80px' }}>
                LEVEL:
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3].map(l => (
                  <button
                    key={l}
                    onClick={() => { setLevelInput(l); setAccessLevel.mutate({ userId: user.id, accessLevel: l }); }}
                    style={{
                      width: '28px', height: '28px', borderRadius: '3px',
                      background: (levelInput === l || user.accessLevel === l) ? `${sColor.blue}30` : sColor.bg,
                      border: `1px solid ${(levelInput === l || user.accessLevel === l) ? sColor.blue : sColor.border}`,
                      color: (levelInput === l || user.accessLevel === l) ? sColor.blue : sColor.textMuted,
                      fontFamily: sFont.mono, fontSize: '0.65rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Role management (super_admin only) */}
          {isSuperAdmin && user.role !== 'super_admin' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, width: '80px' }}>
                ROLE:
              </span>
              {user.role === 'admin' ? (
                <button
                  onClick={() => setRole.mutate({ userId: user.id, role: 'user' })}
                  disabled={setRole.isPending}
                  style={{
                    background: `${sColor.orange}15`, border: `1px solid ${sColor.orange}40`,
                    borderRadius: '3px', padding: '4px 12px', cursor: 'pointer',
                    color: sColor.orange, fontFamily: sFont.mono, fontSize: '0.6rem',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <ShieldX style={{ width: 12, height: 12 }} /> DEMOTE TO USER
                </button>
              ) : (
                <button
                  onClick={() => setRole.mutate({ userId: user.id, role: 'admin' })}
                  disabled={setRole.isPending}
                  style={{
                    background: `${sColor.purple}15`, border: `1px solid ${sColor.purple}40`,
                    borderRadius: '3px', padding: '4px 12px', cursor: 'pointer',
                    color: sColor.purple, fontFamily: sFont.mono, fontSize: '0.6rem',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <Shield style={{ width: 12, height: 12 }} /> PROMOTE TO ADMIN
                </button>
              )}
            </div>
          )}

          {/* Meta info */}
          <div style={{
            fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted,
            display: 'flex', gap: '16px', paddingTop: '4px', borderTop: `1px solid ${sColor.border}`,
          }}>
            <span>JOINED: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
            <span>LAST SEEN: {user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString() : 'N/A'}</span>
            {user.accessApprovedAt && <span>ACCESS UPDATED: {new Date(user.accessApprovedAt).toLocaleDateString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

export default function UserManagementPanel() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: stats } = trpc.access.stats.useQuery();
  const { data, refetch } = trpc.access.listUsers.useQuery(
    { search: search || undefined, filter, limit: 50 },
    { refetchOnWindowFocus: false }
  );

  const filters: { id: FilterType; label: string; count?: number }[] = [
    { id: 'all', label: 'ALL', count: stats?.totalUsers },
    { id: 'pending', label: 'PENDING', count: stats?.pendingRequests },
    { id: 'approved', label: 'APPROVED', count: stats?.approvedUsers },
    { id: 'admin', label: 'ADMINS', count: stats?.adminCount },
    { id: 'revoked', label: 'REVOKED' },
    { id: 'none', label: 'NO ACCESS' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${sColor.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h2 style={{
            fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text,
            letterSpacing: '0.1em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Users style={{ width: 18, height: 18, color: sColor.red }} />
            USER MANAGEMENT
          </h2>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, margin: '4px 0 0' }}>
            {stats?.totalUsers ?? '—'} USERS · {stats?.pendingRequests ?? 0} PENDING · {stats?.approvedUsers ?? 0} WITH ACCESS
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${sColor.border}` }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: sColor.bg, border: `1px solid ${sColor.border}`,
          borderRadius: '4px', padding: '6px 10px', marginBottom: '10px',
        }}>
          <Search style={{ width: 14, height: 14, color: sColor.textMuted, flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: sColor.text, fontFamily: sFont.body, fontSize: '0.75rem',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: sColor.textMuted, cursor: 'pointer', padding: 0 }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: filter === f.id ? `${sColor.red}20` : 'transparent',
                border: `1px solid ${filter === f.id ? sColor.red : sColor.border}`,
                borderRadius: '3px', padding: '4px 10px', cursor: 'pointer',
                color: filter === f.id ? sColor.red : sColor.textMuted,
                fontFamily: sFont.mono, fontSize: '0.55rem',
                display: 'flex', alignItems: 'center', gap: '4px',
                transition: 'all 0.2s ease',
              }}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span style={{
                  background: f.id === 'pending' && f.count > 0 ? sColor.yellow : `${sColor.textMuted}30`,
                  color: f.id === 'pending' && f.count > 0 ? '#000' : sColor.textDim,
                  padding: '0 4px', borderRadius: '2px', fontSize: '0.5rem',
                }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {!data?.users?.length ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textMuted,
          }}>
            {search ? 'No users match your search' : 'No users found'}
          </div>
        ) : (
          data.users.map((user: any) => (
            <UserRow
              key={user.id}
              user={user}
              isSuperAdmin={isSuperAdmin}
              onRefresh={refetch}
            />
          ))
        )}
      </div>
    </div>
  );
}
