/**
 * Strat — PPEI Post-Sale Tech Support AI Agent
 * Helps customers AFTER purchase with installation, device setup,
 * tune flashing, data logging, error code troubleshooting, and
 * general product support across PPEI tuning tools and platforms.
 *
 * Features Knox AI collaboration — customers watch Strat and Knox
 * converse in real-time to diagnose and resolve technical issues.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { type Message } from '@/components/AIChatBox';
import { Streamdown } from 'streamdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SpeechToTextButton } from '@/components/SpeechToTextButton';
import {
  Headphones, BookOpen, MessageCircle, Phone,
  Star, X, CheckCircle, Send, Brain, Cpu,
  Loader2, Sparkles, User,
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
  purple: 'oklch(0.65 0.25 300)',
};

const SUGGESTED_PROMPTS = [
  "I just got my AutoCal — how do I set it up?",
  "How do I flash my tune with EFILive?",
  "I'm getting error code $0333",
  "How do I record a datalog?",
  "EZ LYNK AutoAgent installation help",
  "HP Tuners T93 TCM install guide",
];

const FEEDBACK_THRESHOLD = 5;

/**
 * Extended message type that supports Knox conversation steps.
 */
type StratMessage = Message & {
  speaker?: 'strat' | 'knox' | 'user';
  stepType?: 'handoff' | 'thinking' | 'response' | 'banter' | 'final';
};

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
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute', top: '0.5rem', right: '0.5rem',
          background: 'none', border: 'none', color: sColor.textDim, cursor: 'pointer', padding: '4px',
        }}
        title="Dismiss"
      >
        <X size={14} />
      </button>

      <div style={{
        fontFamily: sFont.heading, fontSize: '1rem', color: sColor.cyan,
        letterSpacing: '0.06em', marginBottom: '0.75rem',
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
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
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
                fontFamily: sFont.mono, fontSize: '0.6rem', letterSpacing: '0.06em',
                padding: '4px 14px', borderRadius: '4px',
                border: `1px solid ${resolved === opt.value ? opt.color : sColor.border}`,
                background: resolved === opt.value ? `${opt.color}22` : 'transparent',
                color: resolved === opt.value ? opt.color : sColor.textDim,
                cursor: 'pointer', transition: 'all 0.15s',
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
            width: '100%', fontFamily: sFont.body, fontSize: '0.8rem', color: 'white',
            background: sColor.cardBg, border: `1px solid ${sColor.border}`,
            borderRadius: '4px', padding: '0.5rem', resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || isPending}
        style={{
          fontFamily: sFont.mono, fontSize: '0.65rem', letterSpacing: '0.06em',
          padding: '6px 20px', borderRadius: '4px',
          border: `1px solid ${rating > 0 ? sColor.cyan : sColor.border}`,
          background: rating > 0 ? 'rgba(0,200,255,0.1)' : 'transparent',
          color: rating > 0 ? sColor.cyan : sColor.textDim,
          cursor: rating > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: '6px',
          transition: 'all 0.15s', opacity: isPending ? 0.6 : 1,
        }}
      >
        <Send size={12} />
        {isPending ? 'SUBMITTING...' : 'SUBMIT FEEDBACK'}
      </button>

      <div style={{
        fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textDim,
        marginTop: '0.5rem', opacity: 0.6,
      }}>
        {messageCount} MESSAGES IN THIS SESSION
      </div>
    </div>
  );
}

/* ─── Knox/Strat Message Bubble — distinct styling per speaker ─────────── */
function StratMessageBubble({ msg }: { msg: StratMessage }) {
  const isKnox = msg.speaker === 'knox';
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end items-start" style={{ animation: 'stratFadeIn 0.3s ease-out' }}>
        <div style={{
          maxWidth: '80%', borderRadius: '12px', padding: '10px 16px',
          background: sColor.red, color: 'white', fontFamily: sFont.body, fontSize: '0.9rem',
        }}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 4,
        }}>
          <User size={14} style={{ color: sColor.textDim }} />
        </div>
      </div>
    );
  }

  // Assistant message (Strat or Knox)
  const avatarBg = isKnox ? 'rgba(147,51,234,0.15)' : 'rgba(0,200,255,0.1)';
  const avatarBorder = isKnox ? 'rgba(147,51,234,0.4)' : 'rgba(0,200,255,0.3)';
  const accentColor = isKnox ? sColor.purple : sColor.cyan;
  const label = isKnox ? 'KNOX' : 'STRAT';
  const Icon = isKnox ? Brain : Cpu;
  const bubbleBg = isKnox ? 'rgba(147,51,234,0.06)' : 'rgba(0,200,255,0.04)';
  const bubbleBorder = isKnox ? 'rgba(147,51,234,0.15)' : 'rgba(0,200,255,0.1)';

  return (
    <div
      className="flex gap-3 justify-start items-start"
      style={{ animation: 'stratFadeIn 0.4s ease-out' }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: avatarBg, border: `1px solid ${avatarBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 4,
      }}>
        <Icon size={16} style={{ color: accentColor }} />
      </div>

      {/* Message */}
      <div style={{ maxWidth: '80%' }}>
        {/* Speaker label */}
        <div style={{
          fontFamily: sFont.mono, fontSize: '0.5rem', color: accentColor,
          letterSpacing: '0.1em', marginBottom: '4px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          {label}
          {msg.stepType === 'banter' && (
            <span style={{ color: sColor.textDim, fontSize: '0.45rem' }}>• entering chat</span>
          )}
          {msg.stepType === 'handoff' && (
            <span style={{ color: sColor.textDim, fontSize: '0.45rem' }}>• consulting knox</span>
          )}
          {msg.stepType === 'final' && (
            <span style={{ color: sColor.textDim, fontSize: '0.45rem' }}>• wrapping up</span>
          )}
        </div>

        <div style={{
          borderRadius: '10px', padding: '10px 16px',
          background: bubbleBg, border: `1px solid ${bubbleBorder}`,
          fontFamily: sFont.body, fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)',
        }}>
          <div className="prose prose-sm prose-invert max-w-none">
            <Streamdown>{msg.content}</Streamdown>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Knox Typing Indicator ──────────────────────────────────────────── */
function KnoxTypingIndicator({ speaker }: { speaker: 'strat' | 'knox' }) {
  const isKnox = speaker === 'knox';
  const avatarBg = isKnox ? 'rgba(147,51,234,0.15)' : 'rgba(0,200,255,0.1)';
  const avatarBorder = isKnox ? 'rgba(147,51,234,0.4)' : 'rgba(0,200,255,0.3)';
  const accentColor = isKnox ? sColor.purple : sColor.cyan;
  const label = isKnox ? 'KNOX' : 'STRAT';
  const Icon = isKnox ? Brain : Cpu;

  return (
    <div className="flex gap-3 justify-start items-start" style={{ animation: 'stratFadeIn 0.3s ease-out' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: avatarBg, border: `1px solid ${avatarBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 4,
      }}>
        <Icon size={16} style={{ color: accentColor }} />
      </div>
      <div>
        <div style={{
          fontFamily: sFont.mono, fontSize: '0.5rem', color: accentColor,
          letterSpacing: '0.1em', marginBottom: '4px',
        }}>
          {label}
          <span style={{ color: sColor.textDim, fontSize: '0.45rem', marginLeft: '6px' }}>
            • {isKnox ? 'analyzing...' : 'thinking...'}
          </span>
        </div>
        <div style={{
          borderRadius: '10px', padding: '10px 16px',
          background: isKnox ? 'rgba(147,51,234,0.06)' : 'rgba(0,200,255,0.04)',
          border: `1px solid ${isKnox ? 'rgba(147,51,234,0.15)' : 'rgba(0,200,255,0.1)'}`,
          display: 'flex', gap: '4px', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: accentColor, opacity: 0.5,
                  animation: `stratBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Custom Strat Chat Box (replaces AIChatBox for Knox support) ────── */
function StratChatBox({
  messages,
  onSendMessage,
  isLoading,
  isAnimating,
  animatingSpeaker,
  placeholder,
  height,
  emptyStateMessage,
  suggestedPrompts,
}: {
  messages: StratMessage[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  isAnimating: boolean;
  animatingSpeaker: 'strat' | 'knox';
  placeholder?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
}) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages, isLoading, isAnimating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;
    onSendMessage(trimmedInput);
    setInput('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const displayMessages = messages.filter(m => m.role !== 'system');

  return (
    <div
      className="flex flex-col rounded-lg border shadow-sm"
      style={{
        height: height || '600px',
        background: sColor.cardBg,
        borderColor: sColor.border,
      }}
    >
      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-3">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Cpu size={24} style={{ color: sColor.cyan, opacity: 0.3 }} />
                  <span style={{ color: sColor.textDim, fontFamily: sFont.mono, fontSize: '0.5rem' }}>+</span>
                  <Brain size={24} style={{ color: sColor.purple, opacity: 0.3 }} />
                </div>
                <p style={{
                  fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim,
                  textAlign: 'center', maxWidth: '400px',
                }}>
                  {emptyStateMessage}
                </p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      style={{
                        fontFamily: sFont.body, fontSize: '0.8rem',
                        color: sColor.textDim, background: sColor.bg,
                        border: `1px solid ${sColor.border}`,
                        borderRadius: '8px', padding: '8px 14px',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLElement).style.borderColor = sColor.cyan;
                        (e.target as HTMLElement).style.color = sColor.cyan;
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLElement).style.borderColor = sColor.border;
                        (e.target as HTMLElement).style.color = sColor.textDim;
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => (
                <StratMessageBubble key={index} msg={message} />
              ))}

              {/* Typing indicator — shows during loading or animation */}
              {(isLoading || isAnimating) && (
                <KnoxTypingIndicator speaker={isAnimating ? animatingSpeaker : 'strat'} />
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        style={{
          display: 'flex', gap: '8px', padding: '12px 16px',
          borderTop: `1px solid ${sColor.border}`,
          background: 'rgba(0,0,0,0.2)',
          alignItems: 'end',
        }}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 max-h-32 resize-none min-h-9"
          rows={1}
          style={{
            fontFamily: sFont.body, fontSize: '0.9rem',
            background: sColor.bg, borderColor: sColor.border,
            color: 'white',
          }}
        />
        <SpeechToTextButton
          onTranscript={(text) => setInput(prev => prev ? prev + ' ' + text : text)}
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          className="shrink-0 h-[38px] w-[38px]"
          style={{
            background: sColor.cyan,
            color: sColor.bg,
          }}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>

      {/* CSS animations */}
      <style>{`
        @keyframes stratFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stratBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

/* ─── Shared chat hook (with Knox conversation support) ──────────────── */
function useStratChat() {
  const [messages, setMessages] = useState<StratMessage[]>([]);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animatingSpeaker, setAnimatingSpeaker] = useState<'strat' | 'knox'>('strat');
  const feedbackShownRef = useRef(false);
  const sessionStartRef = useRef(Date.now());

  // Animate conversation steps one at a time with delays
  const animateSteps = useCallback((steps: Array<{ speaker: string; content: string; type: string }>) => {
    if (!steps || steps.length === 0) return;

    setIsAnimating(true);
    const queue = steps.map(s => ({
      role: 'assistant' as const,
      content: s.content,
      speaker: s.speaker as 'strat' | 'knox',
      stepType: s.type as StratMessage['stepType'],
    }));

    let idx = 0;
    const playNext = () => {
      if (idx >= queue.length) {
        setIsAnimating(false);
        return;
      }
      const msg = queue[idx];
      // Show typing indicator for the NEXT speaker before revealing message
      const nextSpeaker = idx + 1 < queue.length ? queue[idx + 1].speaker : msg.speaker;
      setAnimatingSpeaker(msg.speaker);
      setMessages(prev => [...prev, msg]);
      idx++;
      // Delay between messages: banter/handoff = 1.2s, response = 1.8s, final = 1s
      const delay = msg.stepType === 'response' ? 1800 : msg.stepType === 'banter' || msg.stepType === 'handoff' ? 1200 : 1000;
      if (idx < queue.length) {
        setAnimatingSpeaker(nextSpeaker);
      }
      setTimeout(playNext, delay);
    };
    playNext();
  }, []);

  const chatMut = trpc.strat.chat.useMutation({
    onSuccess: (data) => {
      const steps = (data as any).conversationSteps;
      if (steps && steps.length > 0) {
        // Knox-assisted response — animate the conversation
        animateSteps(steps);
      } else {
        // Simple Strat-only response
        setMessages(prev => [...prev, { role: 'assistant', content: String(data.reply ?? ''), speaker: 'strat' }]);
      }
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection issue — give me a sec. Error: ${error.message}. If this keeps up, call us at (337) 485-7070.`,
        speaker: 'strat',
      }]);
    },
  });

  const feedbackMut = trpc.strat.submitFeedback.useMutation();

  useEffect(() => {
    if (userMsgCount >= FEEDBACK_THRESHOLD && !feedbackShownRef.current && !feedbackDismissed) {
      feedbackShownRef.current = true;
      setShowFeedback(true);
    }
  }, [userMsgCount, feedbackDismissed]);

  const handleSend = useCallback((content: string) => {
    const userMessage: StratMessage = { role: 'user', content, speaker: 'user' };
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
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content);
    const summary = userMsgs.slice(0, 5).join(' | ').substring(0, 500);
    const chatLog = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
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
    isAnimating,
    animatingSpeaker,
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
    messages, handleSend, isLoading, isAnimating, animatingSpeaker,
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
          fontFamily: sFont.heading, fontSize: '1.5rem',
          letterSpacing: '0.06em', color: 'white', margin: 0,
        }}>
          TECH SUPPORT
        </h2>
        <span style={{
          fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.cyan,
          background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)',
          borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.08em',
        }}>
          STRAT
        </span>
        <span style={{
          fontFamily: sFont.mono, fontSize: '0.45rem', color: sColor.purple,
          background: 'rgba(147,51,234,0.1)', border: '1px solid rgba(147,51,234,0.3)',
          borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.08em',
        }}>
          + KNOX
        </span>
      </div>

      {/* Quick info bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{
          fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim,
          background: sColor.cardBg, border: `1px solid ${sColor.border}`,
          borderRadius: '4px', padding: '4px 8px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <Phone size={10} style={{ color: sColor.green }} />
          ESCALATION: (337) 485-7070
        </div>
        <div style={{
          fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim,
          background: sColor.cardBg, border: `1px solid ${sColor.border}`,
          borderRadius: '4px', padding: '4px 8px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <BookOpen size={10} style={{ color: sColor.blue }} />
          23 KB ARTICLES LOADED
        </div>
      </div>

      {/* Feedback form */}
      {showFeedback && (
        <StratFeedbackForm
          onSubmit={handleFeedbackSubmit}
          onDismiss={handleFeedbackDismiss}
          isPending={feedbackMut.isPending}
          messageCount={userMsgCount}
        />
      )}

      {/* Chat */}
      <StratChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={isLoading}
        isAnimating={isAnimating}
        animatingSpeaker={animatingSpeaker}
        placeholder="Ask Strat about installation, tune flashing, data logging, error codes, or device setup..."
        height="calc(100vh - 320px)"
        emptyStateMessage="Hey! I'm Strat — PPEI's tech support AI. For tough technical questions, I'll pull in Knox to help diagnose. What do you need help with?"
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
    messages, handleSend, isLoading, isAnimating, animatingSpeaker,
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
              fontFamily: sFont.heading, fontSize: '2rem',
              letterSpacing: '0.06em', color: 'white', margin: 0,
            }}>
              TECH SUPPORT
            </h1>
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.cyan,
              background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.08em',
            }}>STRAT</span>
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.45rem', color: sColor.purple,
              background: 'rgba(147,51,234,0.1)', border: '1px solid rgba(147,51,234,0.3)',
              borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.08em',
            }}>+ KNOX</span>
          </div>
          <p style={{
            fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textDim,
            maxWidth: '600px', margin: 0,
          }}>
            Post-sale tech support powered by Strat + Knox AI collaboration.
            Watch them work together to diagnose and resolve your issues in real-time.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4">
            {stats.map((s, i) => (
              <div key={i} style={{
                background: sColor.cardBg, border: `1px solid ${sColor.border}`,
                borderRadius: '6px', padding: '0.75rem 1rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
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
        {showFeedback && (
          <StratFeedbackForm
            onSubmit={handleFeedbackSubmit}
            onDismiss={handleFeedbackDismiss}
            isPending={feedbackMut.isPending}
            messageCount={userMsgCount}
          />
        )}

        <StratChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={isLoading}
          isAnimating={isAnimating}
          animatingSpeaker={animatingSpeaker}
          placeholder="Ask Strat about installation, tune flashing, data logging, error codes, or device setup..."
          height="calc(100vh - 400px)"
          emptyStateMessage="Hey! I'm Strat — PPEI's tech support AI. For tough technical questions, I'll pull in Knox to help diagnose. What do you need help with?"
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </div>
    </div>
  );
}
