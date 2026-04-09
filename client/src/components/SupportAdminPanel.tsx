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
  Mail, Phone, User, Calendar, Hash, ExternalLink,
  Link2, Copy, Check, Trash2, FileText, Shield, Eye
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
type SubPanel = 'dashboard' | 'feedback' | 'strat-feedback' | 'sessions' | 'conversations' | 'users' | 'sharelinks' | 'ndas';

// ── Main Component ───────────────────────────────────────────────────────
export default function SupportAdminPanel() {
  const [activePanel, setActivePanel] = useState<SubPanel>('dashboard');

  const navItems: { id: SubPanel; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: <BarChart3 size={16} /> },
    { id: 'feedback', label: 'FEEDBACK', icon: <Inbox size={16} /> },
    { id: 'strat-feedback', label: 'STRAT LOGS', icon: <Eye size={16} /> },
    { id: 'sessions', label: 'SESSIONS', icon: <Users size={16} /> },
    { id: 'conversations', label: 'MESSAGES', icon: <MessageSquare size={16} /> },
    { id: 'users', label: 'USERS', icon: <User size={16} /> },
    { id: 'sharelinks', label: 'SHARE LINKS', icon: <Link2 size={16} /> },
    { id: 'ndas', label: 'NDA REVIEW', icon: <FileText size={16} /> },
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
        {activePanel === 'strat-feedback' && <StratFeedbackPanel />}
        {activePanel === 'sessions' && <SessionsPanel />}
        {activePanel === 'conversations' && <ConversationsPanel />}
        {activePanel === 'users' && <UsersPanel />}
        {activePanel === 'sharelinks' && <ShareLinksPanel />}
        {activePanel === 'ndas' && <NdaReviewPanel />}
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

// ── Share Links Panel ───────────────────────────────────────────────────
const AVAILABLE_PAGES = [
  { path: '/pitch', label: 'Pitch' },
  { path: '/', label: 'Home (Analyze)' },
  { path: '/advanced', label: 'Advanced' },
  { path: '/fleet', label: 'Fleet' },
  { path: '/drag', label: 'Drag Racing' },
  { path: '/community', label: 'Community' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/calibrations', label: 'Calibrations' },
];

const EXPIRY_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 48, label: '48 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

function ShareLinksPanel() {
  const [selectedPath, setSelectedPath] = useState('/pitch');
  const [expiryHours, setExpiryHours] = useState(24);
  const [label, setLabel] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const generateMutation = trpc.auth.generateShareLink.useMutation();

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setGeneratedLink('');
    setCopied(false);
    try {
      const result = await generateMutation.mutateAsync({
        path: selectedPath,
        expiresInHours: expiryHours,
        label: label || undefined,
      });
      if (result.success && 'token' in result) {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}${result.allowedPath}?share_token=${result.token}`;
        setGeneratedLink(link);
      } else {
        setError(('message' in result ? result.message : null) || 'Failed to generate link');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to generate share link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = generatedLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: sColor.panel,
    border: `1px solid ${sColor.panelBorder}`,
    borderRadius: '4px',
    color: 'white',
    fontFamily: sFont.body,
    fontSize: '0.85rem',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '0.5rem',
        borderBottom: `1px solid ${sColor.borderLight}`,
        paddingBottom: '0.75rem',
      }}>
        SHARE LINKS
      </div>
      <p style={{
        fontFamily: sFont.body,
        fontSize: '0.85rem',
        color: sColor.textSecondary,
        marginBottom: '1.5rem',
        lineHeight: 1.5,
      }}>
        Generate single-use, time-limited links that bypass the auth gate and lock the viewer to one page.
        Once clicked, the link is consumed and cannot be reused.
      </p>

      {/* Generator Form */}
      <div style={{
        background: sColor.panel,
        border: `1px solid ${sColor.panelBorder}`,
        borderRadius: '4px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          fontFamily: sFont.heading,
          fontSize: '1rem',
          letterSpacing: '0.08em',
          color: sColor.red,
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <Plus size={16} /> GENERATE NEW LINK
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Page Select */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              color: sColor.textSecondary,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '0.35rem',
            }}>PAGE</label>
            <select
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              style={selectStyle}
            >
              {AVAILABLE_PAGES.map((p) => (
                <option key={p.path} value={p.path} style={{ background: '#1a1a1a' }}>
                  {p.label} ({p.path})
                </option>
              ))}
            </select>
          </div>

          {/* Expiry Select */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              color: sColor.textSecondary,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '0.35rem',
            }}>EXPIRES IN</label>
            <select
              value={expiryHours}
              onChange={(e) => setExpiryHours(Number(e.target.value))}
              style={selectStyle}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.hours} value={o.hours} style={{ background: '#1a1a1a' }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Label (optional) */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            fontFamily: sFont.body,
            fontSize: '0.75rem',
            color: sColor.textSecondary,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '0.35rem',
          }}>LABEL (OPTIONAL)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Demo for John, Investor pitch"
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              background: 'oklch(0.10 0.005 260)',
              border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '4px',
              color: 'white',
              fontFamily: sFont.body,
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.7rem',
            background: generating ? sColor.panelBorder : sColor.red,
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            fontFamily: sFont.heading,
            fontSize: '1rem',
            letterSpacing: '0.1em',
            cursor: generating ? 'wait' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
          {generating ? 'GENERATING...' : 'GENERATE SHARE LINK'}
        </button>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'oklch(0.14 0.010 25)',
            border: `1px solid oklch(0.52 0.22 25 / 0.4)`,
            borderRadius: '4px',
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            color: 'oklch(0.75 0.18 25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Generated Link */}
        {generatedLink && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'oklch(0.12 0.015 145 / 0.15)',
            border: '1px solid oklch(0.65 0.20 145 / 0.3)',
            borderRadius: '4px',
          }}>
            <div style={{
              fontFamily: sFont.body,
              fontSize: '0.75rem',
              color: sColor.green,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <CheckCircle size={14} /> LINK GENERATED
            </div>
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
            }}>
              <input
                readOnly
                value={generatedLink}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  background: 'oklch(0.08 0.005 260)',
                  border: `1px solid ${sColor.panelBorder}`,
                  borderRadius: '4px',
                  color: 'white',
                  fontFamily: sFont.mono,
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.5rem 1rem',
                  background: copied ? sColor.green : sColor.panel,
                  border: `1px solid ${copied ? sColor.green : sColor.panelBorder}`,
                  borderRadius: '4px',
                  color: 'white',
                  fontFamily: sFont.heading,
                  fontSize: '0.85rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? <><Check size={14} /> COPIED</> : <><Copy size={14} /> COPY</>}
              </button>
            </div>
            <div style={{
              fontFamily: sFont.mono,
              fontSize: '0.7rem',
              color: sColor.textMuted,
              marginTop: '0.5rem',
            }}>
              Single-use &middot; Expires in {EXPIRY_OPTIONS.find(o => o.hours === expiryHours)?.label || `${expiryHours}h`} &middot; Locked to {selectedPath}
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        background: sColor.panel,
        border: `1px solid ${sColor.panelBorder}`,
        borderLeft: `3px solid oklch(0.60 0.18 250)`,
        borderRadius: '4px',
        padding: '1rem 1.25rem',
      }}>
        <div style={{
          fontFamily: sFont.heading,
          fontSize: '0.9rem',
          letterSpacing: '0.08em',
          color: 'oklch(0.60 0.18 250)',
          marginBottom: '0.5rem',
        }}>
          HOW SHARE LINKS WORK
        </div>
        <ul style={{
          fontFamily: sFont.body,
          fontSize: '0.8rem',
          color: sColor.textSecondary,
          lineHeight: 1.8,
          margin: 0,
          paddingLeft: '1.25rem',
        }}>
          <li>Each link bypasses the auth gate for the specified page only</li>
          <li>The viewer cannot navigate to any other page in the app</li>
          <li>Once clicked, the token is consumed — the link cannot be reused</li>
          <li>Links automatically expire after the set duration</li>
          <li>Back/forward browser navigation is blocked to the allowed page</li>
        </ul>
      </div>
    </div>
  );
}


// ── NDA Review Panel ─────────────────────────────────────────────────────
function NdaReviewPanel() {
  const ndas = trpc.auth.listNdas.useQuery();
  const verifyMut = trpc.auth.verifyNda.useMutation();
  const utils = trpc.useUtils();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedSig, setExpandedSig] = useState<number | null>(null);

  const handleVerify = async (ndaId: number) => {
    await verifyMut.mutateAsync({ ndaId, action: 'verified' });
    utils.auth.listNdas.invalidate();
  };

  const handleReject = async (ndaId: number) => {
    await verifyMut.mutateAsync({ ndaId, action: 'rejected', rejectionReason: rejectReason });
    setRejectingId(null);
    setRejectReason('');
    utils.auth.listNdas.invalidate();
  };

  const statusColor = (status: string) => {
    if (status === 'verified') return sColor.green;
    if (status === 'rejected') return sColor.red;
    return sColor.yellow;
  };

  const statusLabel = (status: string) => {
    if (status === 'verified') return 'VERIFIED';
    if (status === 'rejected') return 'REJECTED';
    return 'PENDING';
  };

  return (
    <div style={{ flex: 1 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <div>
          <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>
            NDA REVIEW
          </h2>
          <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textSecondary, margin: 0 }}>
            Review and verify NDA submissions from share link recipients
          </p>
        </div>
        <button
          onClick={() => utils.auth.listNdas.invalidate()}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: 'transparent', border: `1px solid ${sColor.borderLight}`,
            color: sColor.textSecondary, padding: '0.4rem 0.8rem',
            borderRadius: '3px', cursor: 'pointer', fontFamily: sFont.mono, fontSize: '0.7rem',
          }}
        >
          <RefreshCw size={12} /> REFRESH
        </button>
      </div>

      {/* Stats row */}
      {ndas.data && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'PENDING', count: ndas.data.filter(n => n.status === 'pending').length, color: sColor.yellow },
            { label: 'VERIFIED', count: ndas.data.filter(n => n.status === 'verified').length, color: sColor.green },
            { label: 'REJECTED', count: ndas.data.filter(n => n.status === 'rejected').length, color: sColor.red },
          ].map(s => (
            <div key={s.label} style={{
              background: sColor.panel, border: `1px solid ${sColor.panelBorder}`,
              borderRadius: '3px', padding: '0.6rem 1rem', flex: 1, textAlign: 'center',
            }}>
              <div style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: s.color }}>{s.count}</div>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.1em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* NDA list */}
      {ndas.isLoading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: sColor.textMuted }}>
          <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ fontFamily: sFont.body, fontSize: '0.85rem' }}>Loading NDAs...</div>
        </div>
      )}

      {ndas.data && ndas.data.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3rem',
          background: sColor.panel, border: `1px solid ${sColor.panelBorder}`, borderRadius: '3px',
        }}>
          <Shield size={32} style={{ color: sColor.textMuted, margin: '0 auto 0.75rem' }} />
          <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textSecondary }}>
            No NDA submissions yet
          </div>
        </div>
      )}

      {ndas.data && ndas.data.map(nda => (
        <div key={nda.id} style={{
          background: sColor.panel, border: `1px solid ${sColor.panelBorder}`,
          borderLeft: `3px solid ${statusColor(nda.status)}`,
          borderRadius: '3px', padding: '1rem', marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <span style={{ fontFamily: sFont.body, fontSize: '1rem', color: 'white', fontWeight: 600 }}>
                  {nda.signerName}
                </span>
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem', letterSpacing: '0.1em',
                  padding: '0.15rem 0.5rem', borderRadius: '2px',
                  background: `${statusColor(nda.status)}22`, color: statusColor(nda.status),
                  border: `1px solid ${statusColor(nda.status)}44`,
                }}>
                  {statusLabel(nda.status)}
                </span>
              </div>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textSecondary }}>
                {nda.signerEmail || 'No email'}
              </div>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginTop: '0.25rem' }}>
                Token #{nda.tokenId} · Signed {new Date(nda.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Signature preview */}
            {nda.signatureImageUrl && nda.signatureImageUrl.startsWith('data:') && (
              <button
                onClick={() => setExpandedSig(expandedSig === nda.id ? null : nda.id)}
                style={{
                  background: '#111', border: `1px solid ${sColor.borderLight}`,
                  borderRadius: '3px', padding: '0.25rem', cursor: 'pointer',
                }}
                title="View signature"
              >
                <Eye size={14} style={{ color: sColor.textSecondary }} />
              </button>
            )}
          </div>

          {/* Expanded signature */}
          {expandedSig === nda.id && nda.signatureImageUrl && nda.signatureImageUrl.startsWith('data:') && (
            <div style={{
              marginTop: '0.75rem', background: '#0d0d0d',
              border: `1px solid ${sColor.borderLight}`, borderRadius: '3px',
              padding: '0.5rem', textAlign: 'center',
            }}>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginBottom: '0.25rem', letterSpacing: '0.1em' }}>
                DIGITAL SIGNATURE
              </div>
              <img
                src={nda.signatureImageUrl}
                alt="Signature"
                style={{ maxWidth: '400px', maxHeight: '100px', background: '#0a0a0a', borderRadius: '2px' }}
              />
            </div>
          )}

          {/* Action buttons for pending NDAs */}
          {nda.status === 'pending' && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {rejectingId === nda.id ? (
                <>
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    style={{
                      flex: 1, background: '#111', border: `1px solid ${sColor.borderLight}`,
                      color: 'white', padding: '0.4rem 0.6rem', borderRadius: '3px',
                      fontFamily: sFont.body, fontSize: '0.8rem',
                    }}
                  />
                  <button
                    onClick={() => handleReject(nda.id)}
                    disabled={verifyMut.isPending}
                    style={{
                      background: sColor.red, color: 'white', border: 'none',
                      padding: '0.4rem 0.8rem', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: sFont.mono, fontSize: '0.7rem', letterSpacing: '0.05em',
                    }}
                  >
                    CONFIRM REJECT
                  </button>
                  <button
                    onClick={() => { setRejectingId(null); setRejectReason(''); }}
                    style={{
                      background: 'transparent', color: sColor.textSecondary, border: `1px solid ${sColor.borderLight}`,
                      padding: '0.4rem 0.6rem', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: sFont.mono, fontSize: '0.7rem',
                    }}
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleVerify(nda.id)}
                    disabled={verifyMut.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      background: `${sColor.green}22`, color: sColor.green,
                      border: `1px solid ${sColor.green}44`,
                      padding: '0.4rem 0.8rem', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: sFont.mono, fontSize: '0.7rem', letterSpacing: '0.05em',
                    }}
                  >
                    <CheckCircle size={13} /> VERIFY
                  </button>
                  <button
                    onClick={() => setRejectingId(nda.id)}
                    disabled={verifyMut.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      background: `${sColor.red}22`, color: sColor.red,
                      border: `1px solid ${sColor.red}44`,
                      padding: '0.4rem 0.8rem', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: sFont.mono, fontSize: '0.7rem', letterSpacing: '0.05em',
                    }}
                  >
                    <XCircle size={13} /> REJECT
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Info box */}
      <div style={{
        marginTop: '1.5rem', background: sColor.panel,
        border: `1px solid ${sColor.panelBorder}`, borderRadius: '3px',
        padding: '1rem',
      }}>
        <div style={{
          fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
          color: sColor.textSecondary, marginBottom: '0.5rem',
        }}>
          HOW NDA VERIFICATION WORKS
        </div>
        <ul style={{
          fontFamily: sFont.body, fontSize: '0.8rem',
          color: sColor.textSecondary, lineHeight: 1.8,
          margin: 0, paddingLeft: '1.25rem',
        }}>
          <li>Share link recipients must sign an NDA before accessing any content</li>
          <li>NDAs are tied to the signer's email — once verified, valid for 180 days</li>
          <li>A verified NDA works across all share links for that person</li>
          <li>Screen capture detection is active on all share-token-gated pages</li>
          <li>Rejected NDAs can be re-submitted by the user</li>
        </ul>
      </div>
    </div>
  );
}


// ── Strat Feedback Panel — Chat Logs + Ratings ──────────────────────────
function StratFeedbackPanel() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const feedbackQuery = trpc.strat.getFeedback.useQuery();

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const avgRating = feedbackQuery.data?.feedback?.length
    ? (feedbackQuery.data.feedback.reduce((sum: number, f: any) => sum + f.rating, 0) / feedbackQuery.data.feedback.length).toFixed(1)
    : '—';

  const resolvedCount = feedbackQuery.data?.feedback?.filter((f: any) => f.resolved === true).length ?? 0;
  const unresolvedCount = feedbackQuery.data?.feedback?.filter((f: any) => f.resolved === false).length ?? 0;

  return (
    <div>
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1.4rem',
        letterSpacing: '0.1em',
        color: sColor.textPrimary,
        marginBottom: '0.5rem',
      }}>
        STRAT FEEDBACK & CHAT LOGS
      </div>
      <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textSecondary, marginBottom: '1rem' }}>
        Review customer feedback from Strat support sessions — includes full chat transcripts.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'TOTAL', value: feedbackQuery.data?.total ?? '—', color: sColor.blue },
          { label: 'AVG RATING', value: avgRating, color: sColor.yellow },
          { label: 'RESOLVED', value: resolvedCount, color: sColor.green },
          { label: 'UNRESOLVED', value: unresolvedCount, color: sColor.red },
        ].map(s => (
          <div key={s.label} style={{
            background: sColor.panel, border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '3px', padding: '0.6rem 1rem', flex: 1, textAlign: 'center',
          }}>
            <div style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, letterSpacing: '0.1em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button
          onClick={() => feedbackQuery.refetch()}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.75rem',
            background: 'transparent',
            border: `1px solid ${sColor.panelBorder}`,
            borderRadius: '3px',
            color: sColor.textSecondary,
            cursor: 'pointer',
            fontFamily: sFont.mono,
            fontSize: '0.7rem',
          }}
        >
          <RefreshCw size={12} /> REFRESH
        </button>
      </div>

      {/* Loading */}
      {feedbackQuery.isLoading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: sColor.textMuted }}>
          <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ fontFamily: sFont.body, fontSize: '0.85rem' }}>Loading feedback...</div>
        </div>
      )}

      {/* Empty */}
      {feedbackQuery.data?.feedback?.length === 0 && !feedbackQuery.isLoading && (
        <div style={{
          textAlign: 'center', padding: '3rem',
          background: sColor.panel, border: `1px solid ${sColor.panelBorder}`, borderRadius: '3px',
        }}>
          <Inbox size={32} style={{ color: sColor.textMuted, margin: '0 auto 0.75rem' }} />
          <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textSecondary }}>
            No Strat feedback submissions yet.
          </div>
        </div>
      )}

      {/* Feedback List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {feedbackQuery.data?.feedback?.map((item: any) => {
          const isExpanded = expandedId === item.id;
          const chatLog = item.chatLog as Array<{ role: string; content: string }> | null;
          const hasChatLog = chatLog && chatLog.length > 0;

          return (
            <div key={item.id} style={{
              background: sColor.panel,
              border: `1px solid ${sColor.panelBorder}`,
              borderLeft: `3px solid ${item.resolved ? sColor.green : item.resolved === false ? sColor.red : sColor.yellow}`,
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              {/* Header row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  {/* Stars */}
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={13} fill={s <= item.rating ? sColor.yellow : 'transparent'} style={{ color: s <= item.rating ? sColor.yellow : sColor.textMuted }} />
                    ))}
                  </div>

                  {/* User name */}
                  <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'white', fontWeight: 600 }}>
                    {item.userName || 'Anonymous'}
                  </span>

                  {/* Resolved badge */}
                  <span style={{
                    fontFamily: sFont.mono, fontSize: '0.6rem', letterSpacing: '0.1em',
                    padding: '0.1rem 0.4rem', borderRadius: '2px',
                    background: item.resolved ? `${sColor.green}22` : item.resolved === false ? `${sColor.red}22` : `${sColor.yellow}22`,
                    color: item.resolved ? sColor.green : item.resolved === false ? sColor.red : sColor.yellow,
                    border: `1px solid ${item.resolved ? sColor.green : item.resolved === false ? sColor.red : sColor.yellow}44`,
                  }}>
                    {item.resolved ? 'RESOLVED' : item.resolved === false ? 'UNRESOLVED' : 'N/A'}
                  </span>

                  {/* Message count */}
                  {item.messageCount && (
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted }}>
                      {item.messageCount} msgs
                    </span>
                  )}

                  {/* Duration */}
                  {item.sessionDuration && (
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted }}>
                      <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                      {formatDuration(item.sessionDuration)}
                    </span>
                  )}

                  {/* Chat log indicator */}
                  {hasChatLog && (
                    <span style={{
                      fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.blue,
                      padding: '0.1rem 0.4rem', borderRadius: '2px',
                      background: `${sColor.blue}15`, border: `1px solid ${sColor.blue}33`,
                    }}>
                      CHAT LOG
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                  </span>
                  <ChevronRight size={14} style={{
                    color: sColor.textMuted,
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }} />
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  borderTop: `1px solid ${sColor.borderLight}`,
                  padding: '1rem',
                }}>
                  {/* Comment */}
                  {item.comment && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
                        CUSTOMER COMMENT
                      </div>
                      <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textPrimary, lineHeight: 1.5, margin: 0 }}>
                        {item.comment}
                      </p>
                    </div>
                  )}

                  {/* Conversation Summary */}
                  {item.conversationSummary && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
                        CONVERSATION SUMMARY
                      </div>
                      <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textSecondary, lineHeight: 1.4, margin: 0 }}>
                        {item.conversationSummary}
                      </p>
                    </div>
                  )}

                  {/* Full Chat Log */}
                  {hasChatLog && (
                    <div>
                      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                        FULL CHAT TRANSCRIPT ({chatLog!.length} messages)
                      </div>
                      <div style={{
                        background: 'oklch(0.10 0.005 260)',
                        border: `1px solid ${sColor.borderLight}`,
                        borderRadius: '4px',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        padding: '0.75rem',
                      }}>
                        {chatLog!.map((msg, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginBottom: idx < chatLog!.length - 1 ? '0.75rem' : 0,
                            paddingBottom: idx < chatLog!.length - 1 ? '0.75rem' : 0,
                            borderBottom: idx < chatLog!.length - 1 ? `1px solid oklch(0.15 0.005 260)` : 'none',
                          }}>
                            <div style={{
                              flexShrink: 0,
                              width: '60px',
                              fontFamily: sFont.mono,
                              fontSize: '0.6rem',
                              letterSpacing: '0.08em',
                              color: msg.role === 'user' ? sColor.blue : sColor.green,
                              paddingTop: '0.15rem',
                              textTransform: 'uppercase',
                            }}>
                              {msg.role === 'user' ? 'CUSTOMER' : 'STRAT'}
                            </div>
                            <div style={{
                              flex: 1,
                              fontFamily: sFont.body,
                              fontSize: '0.8rem',
                              color: msg.role === 'user' ? sColor.textPrimary : sColor.textSecondary,
                              lineHeight: 1.5,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}>
                              {msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No chat log */}
                  {!hasChatLog && (
                    <div style={{
                      fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textMuted,
                      fontStyle: 'italic', padding: '1rem', textAlign: 'center',
                      background: 'oklch(0.10 0.005 260)', borderRadius: '4px',
                    }}>
                      No chat log available for this session (submitted before chat log tracking was added).
                    </div>
                  )}

                  {/* Meta info */}
                  <div style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    gap: '1.5rem',
                    fontFamily: sFont.mono,
                    fontSize: '0.6rem',
                    color: sColor.textMuted,
                  }}>
                    <span>ID: #{item.id}</span>
                    <span>User ID: {item.userId || '—'}</span>
                    {item.productCategory && <span>Product: {item.productCategory}</span>}
                    {item.sessionDuration && <span>Duration: {formatDuration(item.sessionDuration)}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
