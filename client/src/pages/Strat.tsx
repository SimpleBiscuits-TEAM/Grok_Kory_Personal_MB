/**
 * Strat — PPEI Post-Sale Tech Support AI Agent
 * Helps customers AFTER purchase with installation, device setup,
 * tune flashing, data logging, error code troubleshooting, and
 * general product support for EFILive, EZ LYNK, HP Tuners, and DEBETA.
 */
import { useState, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { AIChatBox, type Message } from '@/components/AIChatBox';
import { Headphones, Wrench, BookOpen, MessageCircle, Phone } from 'lucide-react';

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

/**
 * StratContent — Embeddable version for use inside Advanced SUPPORT tab (no header/wrapper)
 */
export function StratContent() {
  const { loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);

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
  }, [chatMut]);

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
          <Wrench size={10} style={{ color: sColor.amber }} />
          EFILIVE · EZ LYNK · HP TUNERS · DEBETA
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

      {/* Chat */}
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={chatMut.isPending}
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
  const [messages, setMessages] = useState<Message[]>([]);

  const chatMutation = trpc.strat.chat.useMutation({
    onSuccess: (data) => {
      const reply: Message = {
        role: 'assistant',
        content: String(data.reply ?? ''),
      };
      setMessages(prev => [...prev, reply]);
    },
    onError: (error) => {
      const errMsg: Message = {
        role: 'assistant',
        content: `Connection issue — give me a sec. Error: ${error.message}. If this keeps up, call us at (337) 485-7070.`,
      };
      setMessages(prev => [...prev, errMsg]);
    },
  });

  const handleSend = (content: string) => {
    const userMessage: Message = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const history = newMessages
      .filter(m => m.role !== 'system')
      .slice(-20)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    chatMutation.mutate({
      message: content,
      history: history.slice(0, -1),
    });
  };

  const stats = [
    { icon: Wrench, label: 'Products Supported', value: '4 Platforms', color: sColor.amber },
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
        <AIChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={chatMutation.isPending}
          placeholder="Ask Strat about installation, tune flashing, data logging, error codes, or device setup..."
          height="calc(100vh - 400px)"
          emptyStateMessage="Hey! I'm Strat — PPEI's tech support AI. I can help you with installation, tune flashing, data logging, error codes, and device setup. What product did you get?"
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </div>
    </div>
  );
}
