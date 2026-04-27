/**
 * V-OP AI Business Chat — Theo "Pitch"
 * Dedicated business strategy AI agent for the Innovator Program.
 * Helps users brainstorm business models, form teams, and prepare proposals.
 */
import { useState, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { AIChatBox, type Message } from '@/components/AIChatBox';
import { Briefcase, TrendingUp, Users, DollarSign, Lightbulb } from 'lucide-react';
import { usePitchAnalytics } from '@/hooks/usePitchAnalytics';

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
  gold: 'oklch(0.78 0.15 80)',
};

const SUGGESTED_PROMPTS = [
  "How do I make money with V-OP?",
  "Explain the 10% Innovator Kickback",
  "What are the top 5 highest-revenue plans?",
  "Help me write a business proposal",
  "I own a diesel shop — what plans fit me?",
  "What plans can I start with zero investment?",
];

/**
 * PitchContent — Embeddable version for use inside Advanced tabs (no header/wrapper)
 */
export function PitchContent() {
  const { loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const { trackChatMessage, trackPromptClick } = usePitchAnalytics();

  const chatMut = trpc.pitch.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: 'assistant', content: String(data.reply ?? '') }]);
    },
    onError: (error) => {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection issue — give me a sec. Error: ${error.message}` }]);
    },
  });

  const handleSend = useCallback((content: string) => {
    // Track analytics
    if (SUGGESTED_PROMPTS.includes(content)) {
      trackPromptClick(content);
    }
    trackChatMessage(content.length);

    const userMessage: Message = { role: 'user', content };
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      const history = newMessages.filter(m => m.role !== 'system').slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      chatMut.mutate({ message: content, history: history.slice(0, -1) });
      return newMessages;
    });
  }, [chatMut, trackChatMessage, trackPromptClick]);

  if (authLoading) return <div style={{ fontFamily: sFont.mono, color: sColor.textDim, fontSize: '0.8rem', padding: '2rem', textAlign: 'center' }}>LOADING...</div>;

  return (
    <div className="max-w-4xl mx-auto" style={{ padding: '1rem 0' }}>
      <div className="flex items-center gap-3 mb-4">
        <Lightbulb size={24} style={{ color: sColor.gold }} />
        <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>AI BUSINESS CHAT</h2>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.gold, background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.08em' }}>PITCH</span>
      </div>
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={chatMut.isPending}
        placeholder="Ask Pitch about business opportunities, the Innovator Program, or how to make money with V-OP..."
        height="calc(100vh - 280px)"
        emptyStateMessage="Hey — I'm Pitch. Let's find you a way to make money with V-OP. What are you interested in?"
        suggestedPrompts={SUGGESTED_PROMPTS}
      />
    </div>
  );
}

export default function Pitch() {
  const { loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);

  const chatMutation = trpc.pitch.chat.useMutation({
    onSuccess: (data) => {
      const reply: Message = {
        role: "assistant",
        content: String(data.reply ?? ""),
      };
      setMessages(prev => [...prev, reply]);
    },
    onError: (error) => {
      const errMsg: Message = {
        role: "assistant",
        content: `Connection issue — give me a sec. Error: ${error.message}`,
      };
      setMessages(prev => [...prev, errMsg]);
    },
  });

  const handleSend = (content: string) => {
    const userMessage: Message = { role: "user", content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // Send only user/assistant history (no system messages), last 20 exchanges
    const history = newMessages
      .filter(m => m.role !== "system")
      .slice(-20)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    chatMutation.mutate({
      message: content,
      history: history.slice(0, -1), // exclude current message (sent separately)
    });
  };

  // Stats cards for the header
  const stats = [
    { icon: Briefcase, label: 'Business Plans', value: '100+', color: sColor.red },
    { icon: DollarSign, label: 'Total Addressable', value: '$100M+', color: sColor.green },
    { icon: TrendingUp, label: 'Innovator Kickback', value: '10%', color: sColor.gold },
    { icon: Users, label: 'Unlimited Teams', value: 'You Decide', color: sColor.blue },
  ];

  return (
    <div className="min-h-screen" style={{ background: sColor.bg }}>
      <PpeiHeader />

      {/* Page Header */}
      <div style={{
        background: `linear-gradient(135deg, oklch(0.12 0.02 80) 0%, oklch(0.10 0.005 260) 100%)`,
        borderBottom: `1px solid ${sColor.border}`,
        padding: '2rem 0',
      }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Lightbulb size={28} style={{ color: sColor.gold }} />
            <h1 style={{
              fontFamily: sFont.heading,
              fontSize: '2rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
            }}>
              AI BUSINESS CHAT
            </h1>
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.55rem',
              color: sColor.gold,
              background: 'rgba(255,200,0,0.1)',
              border: '1px solid rgba(255,200,0,0.3)',
              borderRadius: '3px',
              padding: '2px 6px',
              letterSpacing: '0.08em',
            }}>PITCH</span>
          </div>
          <p style={{
            fontFamily: sFont.body,
            fontSize: '0.9rem',
            color: sColor.textDim,
            maxWidth: '600px',
            margin: 0,
          }}>
            Meet Theo "Pitch" — your AI business strategist. Brainstorm money-making ideas, 
            explore the 100+ business avenues, form teams, and prepare Innovator Program proposals.
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {stats.map((stat, i) => (
              <div key={i} style={{
                background: sColor.cardBg,
                border: `1px solid ${sColor.border}`,
                borderRadius: '6px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <stat.icon size={20} style={{ color: stat.color, opacity: 0.8 }} />
                <div>
                  <div style={{
                    fontFamily: sFont.heading,
                    fontSize: '1.1rem',
                    color: stat.color,
                    letterSpacing: '0.04em',
                    lineHeight: 1.1,
                  }}>{stat.value}</div>
                  <div style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.55rem',
                    color: sColor.textDim,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {authLoading ? (
          <div className="flex items-center justify-center py-20">
            <div style={{
              fontFamily: sFont.mono,
              color: sColor.textDim,
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
            }}>LOADING...</div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <AIChatBox
              messages={messages}
              onSendMessage={handleSend}
              isLoading={chatMutation.isPending}
              placeholder="Ask Pitch about business opportunities, the Innovator Program, or how to make money with V-OP..."
              height="calc(100vh - 380px)"
              emptyStateMessage="Hey — I'm Pitch. Let's find you a way to make money with V-OP. What are you interested in?"
              suggestedPrompts={SUGGESTED_PROMPTS}
            />

            {/* Bottom Info Bar */}
            <div style={{
              marginTop: '12px',
              padding: '10px 16px',
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <span style={{
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                color: sColor.textDim,
                letterSpacing: '0.06em',
              }}>
                POWERED BY THEO "PITCH" — V-OP BUSINESS STRATEGY AI
              </span>
              <span style={{
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                color: sColor.gold,
                letterSpacing: '0.06em',
                opacity: 0.7,
              }}>
                THE WORLD IS YOUR PLAYGROUND
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
