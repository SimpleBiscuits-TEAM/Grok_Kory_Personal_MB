/**
 * PPEI Support Admin Panel
 * Super-admin only panel for managing customer feedback, support sessions,
 * and staff-customer messaging.
 */
import React, { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { SpeechToTextButton } from '@/components/SpeechToTextButton';
import {
  MessageSquare, Inbox, Users, BarChart3, Search, Send,
  ChevronRight, Clock, Star, AlertCircle, CheckCircle,
  XCircle, Filter, RefreshCw, Plus, ArrowLeft, Loader2,
  Mail, Phone, User, Calendar, Hash, ExternalLink
} from 'lucide-react';

// ── Styling constants (matches Advanced.tsx PPEI theme) ──────────────────
const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: '#0a0a0a',
  panel: 'oklch(0.32 0.005 260)',
  panelBorder: 'oklch(0.20 0.008 260)',
  borderLight: 'oklch(0.22 0.008 260)',
  textPrimary: 'oklch(0.92 0.005 260)',
  textSecondary: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.55 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  yellow: 'oklch(0.78 0.18 85)',
  blue: 'oklch(0.60 0.18 250)',
};

const sFont = {
  heading: "'Bebas Neue', sans-serif",
  body: "'Rajdhani', sans-serif",
  mono: "'Share Tech Mono', monospace",
};

// ── Sub-panel type ───────────────────────────────────────────────────────
type SubPanel = 'dashboard' | 'feedback' | 'sessions' | 'conversations' | 'users';

// ── Main Component ───────────────────────────────────────────────────────
export default function SupportAdminPanel() {
  const [activePanel, setActivePanel] = useState<SubPanel>('dashboard');

  const navItems: { id: SubPanel; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: <BarChart3 size={16} /> },
    { id: 'feedback', label: 'FEEDBACK', icon: <Inbox size={16} /> },
    { id: 'sessions', label: 'SESSIONS', icon: <Users size={16} /> },
    { id: 'conversations', label: 'MESSAGES', icon: <MessageSquare size={16} /> },
    { id: 'users', label: 'USERS', icon: <User size={16} /> },
  ];

  return (
    <div style={{ display: 'flex', gap: '1rem', minHeight: 'calc(100vh - 280px)' }}>
      {/* Sidebar Nav */}
      <nav style={{
        width: '180px',
        flexShrink: 0,
        background: sColor.panel,
        border: `1px solid ${sColor.panelBorder}`,
        borderRadius: '4px',
        padding: '0.5rem',
      }}>
        <div style={{
          fontFamily: sFont.heading,
          fontSize: '1rem',
          letterSpacing: '0.1em',
          color: sColor.red,
          padding: '0.75rem 0.5rem',
          borderBottom: `1px solid ${sColor.borderLight}`,
          marginBottom: '0.5rem',
        }}>
          SUPPORT ADMIN
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.6rem 0.75rem',
              background: activePanel === item.id ? 'oklch(0.18 0.010 260)' : 'transparent',
              border: 'none',
              borderLeft: activePanel === item.id ? `2px solid ${sColor.red}` : '2px solid transparent',
              color: activePanel === item.id ? 'white' : sColor.textSecondary,
              fontFamily: sFont.body,
              fontSize: '0.8rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {activePanel === 'dashboard' && <DashboardPanel />}
        {activePanel === 'feedback' && <FeedbackPanel />}
        {activePanel === 'sessions' && <SessionsPanel />}
        {activePanel === 'conversations' && <ConversationsPanel />}
        {activePanel === 'users' && <UsersPanel />}
      </div>
    </div>
  );
}

// ── Dashboard Panel ──────────────────────────────────────────────────────
function DashboardPanel() {
  const stats = trpc.supportAdmin.getDashboardStats.useQuery();

  const statCards = [
    { label: 'TOTAL FEEDBACK', value: stats.data?.totalFeedback ?? '-', icon: <Inbox size={20} />, color: sColor.yellow },
    { label: 'ACTIVE SESSIONS', value: stats.data?.activeSessions ?? '-', icon: <Users size={20} />, color: sColor.green },
    { label: 'TOTAL SESSIONS', value: stats.data?.totalSessions ?? '-', icon: <Clock size={20} />, color: sColor.blue },
    { label: 'CONVERSATIONS', value: stats.data?.totalConversations ?? '-', icon: <MessageSquare size={20} />, color: sColor.red },
    { label: 'UNREAD', value: stats.data?.unreadConversations ?? '-', icon: <Mail size={20} />, color: sColor.yellow },
    { label: 'TOTAL USERS', value: stats.data?.totalUsers ?? '-', icon: <User size={20} />, color: sColor.green },
  ];

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '1.5rem',
        borderBottom: `1px solid ${sColor.borderLight}`,
        paddingBottom: '0.75rem',
      }}>
        SUPPORT DASHBOARD
      </div>

      {stats.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
          <Loader2 size={16} className="animate-spin" /> Loading stats...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {statCards.map((card) => (
            <div key={card.label} style={{
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderLeft: `3px solid ${card.color}`,
              borderRadius: '4px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', letterSpacing: '0.1em', color: sColor.textSecondary }}>
                  {card.label}
                </span>
                <span style={{ color: card.color }}>{card.icon}</span>
              </div>
              <div style={{ fontFamily: sFont.mono, fontSize: '2rem', color: 'white', lineHeight: 1 }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feedback Panel ───────────────────────────────────────────────────────
function FeedbackPanel() {
  const [typeFilter, setTypeFilter] = useState<'feedback' | 'error' | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  const feedbackQuery = trpc.supportAdmin.listFeedback.useQuery({
    type: typeFilter,
    search: searchTerm || undefined,
    limit: 50,
  });

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '1rem',
      }}>
        FEEDBACK INBOX
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search feedback..."
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>
        {(['all', 'feedback', 'error'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t === 'all' ? undefined : t)}
            style={{
              padding: '0.4rem 0.75rem',
              background: (t === 'all' && !typeFilter) || typeFilter === t ? sColor.red : sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => feedbackQuery.refetch()}
          style={{
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '4px',
            color: sColor.textSecondary,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Count */}
      <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textMuted, marginBottom: '0.75rem' }}>
        {feedbackQuery.data?.total ?? 0} total submissions
      </div>

      {/* List */}
      {feedbackQuery.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : feedbackQuery.data?.items.length === 0 ? (
        <div style={{ color: sColor.textMuted, fontFamily: sFont.body, padding: '2rem', textAlign: 'center' }}>
          No feedback submissions yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {feedbackQuery.data?.items.map((item: any) => (
            <div key={item.id} style={{
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderLeft: `3px solid ${item.type === 'error' ? sColor.red : sColor.yellow}`,
              borderRadius: '4px',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {item.type === 'error' ? (
                    <AlertCircle size={14} style={{ color: sColor.red }} />
                  ) : (
                    <Star size={14} style={{ color: sColor.yellow }} />
                  )}
                  <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: 'white', fontWeight: 600 }}>
                    {item.name || 'Anonymous'}
                  </span>
                  {item.email && (
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>
                      {item.email}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {item.rating && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={12} fill={s <= item.rating ? sColor.yellow : 'transparent'} style={{ color: s <= item.rating ? sColor.yellow : sColor.textMuted }} />
                      ))}
                    </div>
                  )}
                  <span style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.textMuted,
                    padding: '0.15rem 0.5rem',
                    background: 'oklch(0.15 0.005 260)',
                    borderRadius: '2px',
                    textTransform: 'uppercase',
                  }}>
                    {item.type}
                  </span>
                </div>
              </div>

              <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textPrimary, lineHeight: 1.5, margin: '0.5rem 0' }}>
                {item.message}
              </p>

              {item.errorType && (
                <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.red, marginTop: '0.25rem' }}>
                  Error Type: {item.errorType}
                </div>
              )}
              {item.stepsToReproduce && (
                <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textSecondary, marginTop: '0.25rem' }}>
                  Steps: {item.stepsToReproduce}
                </div>
              )}
              {item.context && (
                <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginTop: '0.25rem' }}>
                  Context: {item.context}
                </div>
              )}

              <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginTop: '0.5rem' }}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sessions Panel ───────────────────────────────────────────────────────
function SessionsPanel() {
  const [statusFilter, setStatusFilter] = useState<'active' | 'ended' | 'expired' | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  const sessionsQuery = trpc.supportAdmin.listSessions.useQuery({
    status: statusFilter,
    search: searchTerm || undefined,
    limit: 50,
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return sColor.green;
      case 'ended': return sColor.textMuted;
      case 'expired': return sColor.red;
      default: return sColor.textSecondary;
    }
  };

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '1rem',
      }}>
        SUPPORT SESSIONS
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name..."
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>
        {(['all', 'active', 'ended', 'expired'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === 'all' ? undefined : s)}
            style={{
              padding: '0.4rem 0.75rem',
              background: (s === 'all' && !statusFilter) || statusFilter === s ? sColor.red : sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => sessionsQuery.refetch()}
          style={{
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '4px',
            color: sColor.textSecondary,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textMuted, marginBottom: '0.75rem' }}>
        {sessionsQuery.data?.total ?? 0} total sessions
      </div>

      {sessionsQuery.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : sessionsQuery.data?.items.length === 0 ? (
        <div style={{ color: sColor.textMuted, fontFamily: sFont.body, padding: '2rem', textAlign: 'center' }}>
          No support sessions found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sessionsQuery.data?.items.map((session: any) => (
            <div key={session.id} style={{
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderLeft: `3px solid ${statusColor(session.status)}`,
              borderRadius: '4px',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <User size={14} style={{ color: sColor.textSecondary }} />
                  <span style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                    {session.customerName}
                  </span>
                  {session.customerEmail && (
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>
                      {session.customerEmail}
                    </span>
                  )}
                </div>
                <span style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.65rem',
                  color: statusColor(session.status),
                  padding: '0.15rem 0.5rem',
                  background: 'oklch(0.15 0.005 260)',
                  borderRadius: '2px',
                  textTransform: 'uppercase',
                  border: `1px solid ${statusColor(session.status)}33`,
                }}>
                  {session.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>
                <span>ID: {session.id.slice(0, 8)}...</span>
                <span>Invite: {session.inviteLink}</span>
                <span>Created: {session.createdAt ? new Date(session.createdAt).toLocaleString() : 'N/A'}</span>
                <span>Expires: {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'N/A'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Conversations Panel ──────────────────────────────────────────────────
function ConversationsPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState('');

  const conversationsQuery = trpc.supportAdmin.listConversations.useQuery({
    search: searchTerm || undefined,
    limit: 50,
  });

  const messagesQuery = trpc.supportAdmin.getConversationMessages.useQuery(
    { conversationId: selectedConversation! },
    { enabled: !!selectedConversation, refetchInterval: 5000 }
  );

  const sendMutation = trpc.supportAdmin.sendMessage.useMutation({
    onSuccess: () => {
      setNewMessage('');
      messagesQuery.refetch();
    },
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data]);

  if (selectedConversation) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
        {/* Chat Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: sColor.panel,
          border: `1px solid ${sColor.panelBorder}`,
          borderRadius: '4px 4px 0 0',
        }}>
          <button
            onClick={() => setSelectedConversation(null)}
            style={{ background: 'none', border: 'none', color: sColor.textSecondary, cursor: 'pointer', padding: '0.25rem' }}
          >
            <ArrowLeft size={16} />
          </button>
          <MessageSquare size={16} style={{ color: sColor.red }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'white' }}>
            Conversation #{selectedConversation}
          </span>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          background: 'oklch(0.08 0.003 260)',
          border: `1px solid ${sColor.panelBorder}`,
          borderTop: 'none',
          borderBottom: 'none',
        }}>
          {messagesQuery.isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
              <Loader2 size={16} className="animate-spin" /> Loading messages...
            </div>
          ) : messagesQuery.data?.messages.length === 0 ? (
            <div style={{ color: sColor.textMuted, fontFamily: sFont.body, textAlign: 'center', padding: '2rem' }}>
              No messages yet. Start the conversation below.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {messagesQuery.data?.messages.map((msg: any) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.senderType === 'admin' ? 'flex-end' : 'flex-start',
                    maxWidth: '70%',
                  }}
                >
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: msg.senderType === 'admin' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.senderType === 'admin' ? 'oklch(0.25 0.08 25)' : sColor.panel,
                    border: `1px solid ${msg.senderType === 'admin' ? 'oklch(0.35 0.12 25)' : sColor.panelBorder}`,
                  }}>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginBottom: '0.25rem' }}>
                      {msg.senderType === 'admin' ? 'PPEI STAFF' : 'CUSTOMER'} - {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                    </div>
                    <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textPrimary, margin: 0, lineHeight: 1.5 }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          background: sColor.panel,
          border: `1px solid ${sColor.panelBorder}`,
          borderRadius: '0 0 4px 4px',
        }}>
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                e.preventDefault();
                sendMutation.mutate({ conversationId: selectedConversation, content: newMessage.trim() });
              }
            }}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              background: 'oklch(0.08 0.003 260)',
              border: `1px solid ${sColor.borderLight}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
          <SpeechToTextButton
            onTranscript={(text) => setNewMessage(prev => prev ? prev + ' ' + text : text)}
            variant="dark"
            size="sm"
          />
          <button
            onClick={() => {
              if (newMessage.trim()) {
                sendMutation.mutate({ conversationId: selectedConversation, content: newMessage.trim() });
              }
            }}
            disabled={!newMessage.trim() || sendMutation.isPending}
            style={{
              padding: '0.5rem 1rem',
              background: sColor.red,
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.8rem',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              opacity: newMessage.trim() ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Send size={14} />
            SEND
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '1rem',
      }}>
        CONVERSATIONS
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => conversationsQuery.refetch()}
          style={{
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '4px',
            color: sColor.textSecondary,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textMuted, marginBottom: '0.75rem' }}>
        {conversationsQuery.data?.total ?? 0} conversations
      </div>

      {conversationsQuery.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : conversationsQuery.data?.conversations.length === 0 ? (
        <div style={{ color: sColor.textMuted, fontFamily: sFont.body, padding: '2rem', textAlign: 'center' }}>
          No conversations yet. Start one from the Users panel.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {conversationsQuery.data?.conversations.map((conv: any) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                padding: '1rem',
                background: sColor.panel,
                border: `1px solid ${sColor.panelBorder}`,
                borderLeft: `3px solid ${conv.isRead ? sColor.panelBorder : sColor.red}`,
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: conv.isRead ? sColor.textPrimary : 'white', fontWeight: conv.isRead ? 400 : 600 }}>
                  {conv.subject}
                </div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginTop: '0.25rem' }}>
                  User #{conv.userId} - Last message: {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : 'N/A'}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: sColor.textMuted }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Users Panel ──────────────────────────────────────────────────────────
function UsersPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewConvo, setShowNewConvo] = useState<number | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newInitialMsg, setNewInitialMsg] = useState('');

  const usersQuery = trpc.supportAdmin.listUsers.useQuery({
    search: searchTerm || undefined,
    limit: 50,
  });

  const startConvoMutation = trpc.supportAdmin.startConversation.useMutation({
    onSuccess: () => {
      setShowNewConvo(null);
      setNewSubject('');
      setNewInitialMsg('');
    },
  });

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '1rem',
      }}>
        USERS
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => usersQuery.refetch()}
          style={{
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '4px',
            color: sColor.textSecondary,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {usersQuery.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: sColor.textSecondary, fontFamily: sFont.body }}>
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {usersQuery.data?.users.map((u: any) => (
            <div key={u.id} style={{
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <User size={16} style={{ color: sColor.textSecondary }} />
                  <div>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                      {u.name || 'Unnamed User'}
                    </div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>
                      {u.email || 'No email'} - Role: {u.role} - ID: {u.id}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewConvo(showNewConvo === u.id ? null : u.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: showNewConvo === u.id ? sColor.red : 'transparent',
                    border: `1px solid ${sColor.red}`,
                    borderRadius: '4px',
                    color: 'white',
                    fontFamily: sFont.body,
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <MessageSquare size={12} />
                  MESSAGE
                </button>
              </div>

              {/* New Conversation Form */}
              {showNewConvo === u.id && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'oklch(0.10 0.003 260)',
                  borderRadius: '4px',
                  border: `1px solid ${sColor.borderLight}`,
                }}>
                  <input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Subject..."
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      marginBottom: '0.5rem',
                      background: sColor.panel,
                      border: `1px solid ${sColor.panelBorder}`,
                      borderRadius: '4px',
                      color: 'white',
                      fontFamily: sFont.body,
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  />
                  <textarea
                    value={newInitialMsg}
                    onChange={(e) => setNewInitialMsg(e.target.value)}
                    placeholder="Initial message (optional)..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      marginBottom: '0.5rem',
                      background: sColor.panel,
                      border: `1px solid ${sColor.panelBorder}`,
                      borderRadius: '4px',
                      color: 'white',
                      fontFamily: sFont.body,
                      fontSize: '0.85rem',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newSubject.trim()) {
                        startConvoMutation.mutate({
                          userId: u.id,
                          subject: newSubject.trim(),
                          initialMessage: newInitialMsg.trim() || undefined,
                        });
                      }
                    }}
                    disabled={!newSubject.trim() || startConvoMutation.isPending}
                    style={{
                      padding: '0.4rem 1rem',
                      background: sColor.red,
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      fontFamily: sFont.body,
                      fontSize: '0.8rem',
                      cursor: newSubject.trim() ? 'pointer' : 'not-allowed',
                      opacity: newSubject.trim() ? 1 : 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {startConvoMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    START CONVERSATION
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
