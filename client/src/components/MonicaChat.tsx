/**
 * MonicaChat — AI Monica's chat interface for testers
 * 
 * Embedded inside the DebugReportButton panel for each debug session.
 * Monica keeps testers in the loop, asks follow-up questions, and
 * provides status updates with personality and vision.
 */

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Bot, Send, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface MonicaChatProps {
  sessionId: number;
  sessionStatus: string;
}

export default function MonicaChat({ sessionId, sessionStatus }: MonicaChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get chat history
  const messagesQuery = trpc.monica.getMessages.useQuery(
    { sessionId },
    { enabled: isOpen, refetchInterval: isOpen ? 8000 : false }
  );

  // Get status update
  const statusQuery = trpc.monica.getStatusUpdate.useQuery(
    { sessionId },
    { enabled: isOpen }
  );

  // Send message mutation
  const sendMessage = trpc.monica.sendMessage.useMutation({
    onSuccess: () => {
      setInput('');
      messagesQuery.refetch();
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messagesQuery.data, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const messages = messagesQuery.data ?? [];
  const hasMessages = messages.length > 0;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMessage.isPending) return;
    sendMessage.mutate({ sessionId, message: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mt-2">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 hover:border-violet-500/50 transition-all"
      >
        <div className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-[Rajdhani] font-semibold text-violet-300">
            AI Monica
          </span>
          {!hasMessages && !isOpen && (
            <span className="text-[10px] text-violet-400/60 font-[Share_Tech_Mono]">
              — tap to chat
            </span>
          )}
          {hasMessages && !isOpen && (
            <span className="text-[10px] text-violet-400/60 font-[Share_Tech_Mono]">
              — {messages.length} messages
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-fuchsia-400 animate-pulse" />
          {isOpen ? (
            <ChevronUp className="w-3 h-3 text-violet-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-violet-400" />
          )}
        </div>
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="mt-1.5 bg-zinc-950/80 border border-violet-500/20 rounded overflow-hidden">
          {/* Status Banner */}
          {statusQuery.data && (
            <div className="px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
              <p className="text-[11px] text-violet-300 font-[Rajdhani] leading-snug">
                {statusQuery.data.message}
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="max-h-[200px] overflow-y-auto p-2 space-y-2">
            {messages.length === 0 && !messagesQuery.isLoading && (
              <div className="text-center py-4">
                <Bot className="w-6 h-6 text-violet-500/40 mx-auto mb-1.5" />
                <p className="text-[11px] text-violet-400/60 font-[Rajdhani]">
                  Hey! I'm AI Monica. Ask me anything about this bug report.
                </p>
                <p className="text-[10px] text-violet-400/40 font-[Share_Tech_Mono] mt-1">
                  I'll keep you posted on status, follow up on details, and celebrate when we squash it.
                </p>
              </div>
            )}

            {messagesQuery.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-zinc-800 text-zinc-200 font-[Rajdhani]'
                      : 'bg-violet-600/15 text-violet-200 font-[Rajdhani] border border-violet-500/20'
                  }`}
                >
                  {msg.role === 'monica' && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <Bot className="w-2.5 h-2.5 text-violet-400" />
                      <span className="text-[9px] text-violet-400 font-[Share_Tech_Mono] uppercase">Monica</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-[8px] text-zinc-600 font-[Share_Tech_Mono] mt-0.5 block">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

            {sendMessage.isPending && (
              <div className="flex justify-start">
                <div className="bg-violet-600/15 border border-violet-500/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Bot className="w-3 h-3 text-violet-400" />
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-violet-500/20 flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Monica about this bug..."
              className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 font-[Rajdhani]"
              disabled={sendMessage.isPending}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || sendMessage.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white h-7 w-7 p-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
