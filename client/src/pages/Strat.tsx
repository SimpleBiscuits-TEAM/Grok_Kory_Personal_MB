/**
 * Strat — PPEI Post-Sale Tech Support AI Agent
 * Helps customers AFTER purchase with installation, device setup,
 * tune flashing, data logging, error code troubleshooting, and
 * general product support across PPEI tuning tools and platforms.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { AIChatBox, type Message } from '@/components/AIChatBox';
import {
  Headphones, BookOpen, MessageCircle, Phone,
  Star, X, CheckCircle, Send,
} from 'lucide-react';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: 'oklch(0.10 0.005 260)',
  cardBg: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.25 0.008 260)',
  textDim: 'oklch(0.60 0.010 260)',
  green: 'oklch(0.65 0.20 145)',
  amber: 'oklch(0.75 0.18 60)',
  blue: 'oklch(0.70 0.18 200)',
  cyan: 'oklch(0.72 0.15 200)',
};

const SUGGESTED_PROMPTS = [
  "I just got my AutoCal — how do I set it up?",
  "How do I flash my tune with EFILive?",
  "I'm getting error code $0333",
  "How do I record a datalog?",
  "EZ LYNK AutoAgent installation help",
  "HP Tuners T93 TCM install guide",
];

const FEEDBACK_THRESHOLD = 5; // Show feedback after 5 user messages

/* ─── Feedback Form Component ─────────────────────────────────────────── */
function StratFeedbackForm({
  onSubmit,
  onDismiss,
  isPending,
  messageCount,
}: {
  onSubmit: (data: { rating: number; comment: string; resolved: boolean }) => void;
  onDismiss: () => void;
  isPending: boolean;
  messageCount: number;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [resolved, setResolved] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (rating === 0) return;
    onSubmit({ rating, comment, resolved: resolved ?? false });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={{
        background: 'rgba(0,200,255,0.05)',
        border: `1px solid rgba(0,200,255,0.2)`,
        borderRadius: '8px',
        padding: '1.25rem',
        margin: '0.75rem 0',
        textAlign: 'center',
      }}>
        <CheckCircle size={28} style={{ color: sColor.green, margin: '0 auto 0.5rem' }} />
        <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', letterSpacing: '0.04em' }}>
          THANKS FOR THE FEEDBACK
        </div>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, marginTop: '0.25rem' }}>
          YOUR INPUT HELPS US IMPROVE STRAT
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(0,200,255,0.04)',
      border: `1px solid rgba(0,200,255,0.15)`,
      borderRadius: '8px',
      padding: '1.25rem',
      margin: '0.75rem 0',
      position: 'relative',
    }}>
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'none',
          border: 'none',
          color: sColor.textDim,
          cursor: 'pointer',
          padding: '4px',
        }}
        title="Dismiss"
      >
        <X size={14} />
      </button>

      {/* Title */}
      <div style={{
        fontFamily: sFont.heading,
        fontSize: '1rem',
        color: sColor.cyan,
        letterSpacing: '0.06em',
        marginBottom: '0.75rem',
      }}>
        HOW'S STRAT DOING?
      </div>

      {/* Star Rating */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginBottom: '0.35rem', letterSpacing: '0.06em' }}>
          RATING
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                transition: 'transform 0.15s',
                transform: (hoverRating >= n || rating >= n) ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <Star
                size={22}
                fill={(hoverRating >= n || rating >= n) ? sColor.amber : 'transparent'}
                style={{ color: (hoverRating >= n || rating >= n) ? sColor.amber : sColor.border }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Resolved? */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginBottom: '0.35rem', letterSpacing: '0.06em' }}>
          WAS YOUR ISSUE RESOLVED?
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'YES', value: true, color: sColor.green },
            { label: 'NO', value: false, color: sColor.red },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setResolved(opt.value)}
              style={{
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                letterSpacing: '0.06em',
                padding: '4px 14px',
                borderRadius: '4px',
                border: `1px solid ${resolved === opt.value ? opt.color : sColor.border}`,
                background: resolved === opt.value ? `${opt.color}22` : 'transparent',
                color: resolved === opt.value ? opt.color : sColor.textDim,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginBottom: '0.35rem', letterSpacing: '0.06em' }}>
          DETAILED COMMENTS (OPTIONAL)
        </div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Tell us about your experience — what worked, what didn't, what could be better..."
          rows={3}
          style={{
            width: '100%',
            fontFamily: sFont.body,
            fontSize: '0.8rem',
            color: 'white',
            background: sColor.cardBg,
            border: `1px solid ${sColor.border}`,
            borderRadius: '4px',
            padding: '0.5rem',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || isPending}
        style={{
          fontFamily: sFont.mono,
          fontSize: '0.65rem',
          letterSpacing: '0.06em',
          padding: '6px 20px',
          borderRadius: '4px',
          border: `1px solid ${rating > 0 ? sColor.cyan : sColor.border}`,
          background: rating > 0 ? 'rgba(0,200,255,0.1)' : 'transparent',
          color: rating > 0 ? sColor.cyan : sColor.textDim,
          cursor: rating > 0 ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.15s',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        <Send size={12} />
        {isPending ? 'SUBMITTING...' : 'SUBMIT FEEDBACK'}
      </button>

      <div style={{
        fontFamily: sFont.mono,
        fontSize: '0.5rem',
        color: sColor.textDim,
        marginTop: '0.5rem',
        opacity: 0.6,
      }}>
        {messageCount} MESSAGES IN THIS SESSION
      </div>
    </div>
  );
}

/* ─── Shared chat hook ────────────────────────────────────────────────── */
function useStratChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const feedbackShownRef = useRef(false);
  const sessionStartRef = useRef(Date.now());

  const chatMut = trpc.strat.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: 'assistant', content: String(data.reply ?? '') }]);
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection issue — give me a sec. Error: ${error.message}. If this keeps up, call us at (337) 485-7070.`,
      }]);
    },
  });

  const feedbackMut = trpc.strat.submitFeedback.useMutation();

  // Show feedback form after threshold
  useEffect(() => {
    if (userMsgCount >= FEEDBACK_THRESHOLD && !feedbackShownRef.current && !feedbackDismissed) {
      feedbackShownRef.current = true;
      setShowFeedback(true);
    }
  }, [userMsgCount, feedbackDismissed]);

  const handleSend = useCallback((content: string) => {
    const userMessage: Message = { role: 'user', content };
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      const history = newMessages
        .filter(m => m.role !== 'system')
        .slice(-20)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      chatMut.mutate({ message: content, history: history.slice(0, -1) });
      return newMessages;
    });
    setUserMsgCount(c => c + 1);
  }, [chatMut]);

  const handleFeedbackSubmit = useCallback((data: { rating: number; comment: string; resolved: boolean }) => {
    // Build a short summary from the conversation
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content);
    const summary = userMsgs.slice(0, 5).join(' | ').substring(0, 500);

    // Build full chat log for admin review
    const chatLog = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Calculate session duration in seconds
    const sessionDuration = Math.round((Date.now() - sessionStartRef.current) / 1000);

    feedbackMut.mutate({
      rating: data.rating,
      comment: data.comment || undefined,
      resolved: data.resolved,
      messageCount: userMsgCount,
      conversationSummary: summary || undefined,
      chatLog,
      sessionDuration,
    });
  }, [feedbackMut, messages, userMsgCount]);

  const handleFeedbackDismiss = useCallback(() => {
    setShowFeedback(false);
    setFeedbackDismissed(true);
  }, []);

  return {
    messages,
    handleSend,
    isLoading: chatMut.isPending,
    showFeedback,
    feedbackMut,
    handleFeedbackSubmit,
    handleFeedbackDismiss,
    userMsgCount,
  };
}

/* ─── StratContent — Embeddable version for SUPPORT tab ───────────────── */
export function StratContent() {
  const { loading: authLoading } = useAuth();
  const {
    messages, handleSend, isLoading,
    showFeedback, feedbackMut, handleFeedbackSubmit, handleFeedbackDismiss, userMsgCount,
  } = useStratChat();

  if (authLoading) {
    return (
      <div style={{ fontFamily: sFont.mono, color: sColor.textDim, fontSize: '0.8rem', padding: '2rem', textAlign: 'center' }}>
        LOADING...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto" style={{ padding: '1rem 0' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Headphones size={24} style={{ color: sColor.cyan }} />
        <h2 style={{
          fontFamily: sFont.heading,
          fontSize: '1.5rem',
          letterSpacing: '0.06em',
          color: 'white',
          margin: 0,
        }}>
          TECH SUPPORT
        </h2>
        <span style={{
          fontFamily: sFont.mono,
          fontSize: '0.55rem',
          color: sColor.cyan,
          background: 'rgba(0,200,255,0.1)',
          border: '1px solid rgba(0,200,255,0.3)',
          borderRadius: '3px',
          padding: '2px 6px',
          letterSpacing: '0.08em',
        }}>
          STRAT
        </span>
      </div>

      {/* Quick info bar */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: sFont.mono,
          fontSize: '0.6rem',
          color: sColor.textDim,
          background: sColor.cardBg,
          border: `1px solid ${sColor.border}`,
          borderRadius: '4px',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <Phone size={10} style={{ color: sColor.green }} />
          ESCALATION: (337) 485-7070
        </div>
        <div style={{
          fontFamily: sFont.mono,
          fontSize: '0.6rem',
          color: sColor.textDim,
          background: sColor.cardBg,
          border: `1px solid ${sColor.border}`,
          borderRadius: '4px',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <BookOpen size={10} style={{ color: sColor.blue }} />
          23 KB ARTICLES LOADED
        </div>
      </div>

      {/* Feedback form — appears after 5 messages */}
      {showFeedback && (
        <StratFeedbackForm
          onSubmit={handleFeedbackSubmit}
          onDismiss={handleFeedbackDismiss}
          isPending={feedbackMut.isPending}
          messageCount={userMsgCount}
        />
      )}

      {/* Chat */}
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={isLoading}
        placeholder="Ask Strat about installation, tune flashing, data logging, error codes, or device setup..."
        height="calc(100vh - 320px)"
        emptyStateMessage="Hey! I'm Strat — PPEI's tech support AI. I can help you with installation, tune flashing, data logging, error codes, and device setup. What product did you get?"
        suggestedPrompts={SUGGESTED_PROMPTS}
      />
    </div>
  );
}

/**
 * Standalone Strat page — accessible via /strat route
 */
export default function Strat() {
  const { loading: authLoading } = useAuth();
  const {
    messages, handleSend, isLoading,
    showFeedback, feedbackMut, handleFeedbackSubmit, handleFeedbackDismiss, userMsgCount,
  } = useStratChat();

  const stats = [
    { icon: BookOpen, label: 'KB Articles', value: '23', color: sColor.blue },
    { icon: MessageCircle, label: 'AI-Powered', value: 'Instant', color: sColor.green },
    { icon: Phone, label: 'Escalation', value: '(337) 485-7070', color: sColor.cyan },
  ];

  return (
    <div className="min-h-screen" style={{ background: sColor.bg }}>
      <PpeiHeader />

      {/* Page Header */}
      <div style={{
        background: `linear-gradient(135deg, oklch(0.12 0.02 200) 0%, oklch(0.10 0.005 260) 100%)`,
        borderBottom: `1px solid ${sColor.border}`,
        padding: '2rem 0',
      }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Headphones size={28} style={{ color: sColor.cyan }} />
            <h1 style={{
              fontFamily: sFont.heading,
              fontSize: '2rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
            }}>
              TECH SUPPORT
            </h1>
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.55rem',
              color: sColor.cyan,
              background: 'rgba(0,200,255,0.1)',
              border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: '3px',
              padding: '2px 6px',
              letterSpacing: '0.08em',
            }}>STRAT</span>
          </div>
          <p style={{
            fontFamily: sFont.body,
            fontSize: '0.9rem',
            color: sColor.textDim,
            maxWidth: '600px',
            margin: 0,
          }}>
            Post-sale tech support for PPEI products. Installation guides, tune flashing,
            data logging, error codes, and device setup — all powered by AI.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4">
            {stats.map((s, i) => (
              <div key={i} style={{
                background: sColor.cardBg,
                border: `1px solid ${sColor.border}`,
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <s.icon size={16} style={{ color: s.color }} />
                <div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, letterSpacing: '0.06em' }}>
                    {s.label.toUpperCase()}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'white', fontWeight: 600 }}>
                    {s.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="container mx-auto px-4 py-6">
        {/* Feedback form — appears after 5 messages */}
        {showFeedback && (
          <StratFeedbackForm
            onSubmit={handleFeedbackSubmit}
            onDismiss={handleFeedbackDismiss}
            isPending={feedbackMut.isPending}
            messageCount={userMsgCount}
          />
        )}

        <AIChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={isLoading}
          placeholder="Ask Strat about installation, tune flashing, data logging, error codes, or device setup..."
          height="calc(100vh - 400px)"
          emptyStateMessage="Hey! I'm Strat — PPEI's tech support AI. I can help you with installation, tune flashing, data logging, error codes, and device setup. What product did you get?"
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </div>
    </div>
  );
}
