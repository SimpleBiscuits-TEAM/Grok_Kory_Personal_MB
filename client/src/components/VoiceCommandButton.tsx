/**
 * VoiceCommandButton — Floating voice command interface
 * 
 * Features:
 * - Floating microphone button (push-to-talk)
 * - Animated recording indicator with pulse effect
 * - Expandable transcript/response panel
 * - Command history with PID matches
 * - Text-to-speech playback controls
 * - Integration with live datalogger PIDs
 * 
 * Design: Matches PPEI industrial dark theme
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, ChevronUp, ChevronDown, Loader2, MessageSquare, Trash2, Send } from 'lucide-react';
import { useVoiceCommand, VoiceState, VoiceCommandResult } from '@/hooks/useVoiceCommand';
import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

// ─── Styles ────────────────────────────────────────────────────────────────
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};
const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  bgHover: 'oklch(0.16 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  redGlow: 'oklch(0.52 0.22 25 / 0.4)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
};

interface VoiceCommandButtonProps {
  /** Currently active PID definitions from the datalogger */
  activePids?: PIDDefinition[];
  /** Live PID readings from the datalogger */
  liveReadings?: Map<number, PIDReading>;
  /** Whether the vehicle is connected */
  isConnected?: boolean;
  /** Position on screen */
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
}

export default function VoiceCommandButton({
  activePids = [],
  liveReadings,
  isConnected = false,
  position = 'bottom-right',
}: VoiceCommandButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activePidNames = activePids.map(p => p.shortName);

  const {
    state,
    error,
    history,
    currentTranscript,
    isSpeaking,
    isListening,
    isProcessing,
    startListening,
    stopListening,
    toggleListening,
    stopSpeaking,
    speak,
    updateWithLiveData,
    clearHistory,
  } = useVoiceCommand({
    activePids: activePidNames,
    autoSpeak: true,
    onPidQuery: (pids) => {
      // When PIDs are matched, check if we have live data
      if (liveReadings && liveReadings.size > 0) {
        const pidValues = pids.map(p => {
          const reading = liveReadings.get(p.pid);
          if (reading) {
            return {
              name: p.name,
              shortName: p.shortName,
              value: reading.value,
              unit: p.unit,
            };
          }
          return null;
        }).filter(Boolean) as Array<{ name: string; shortName: string; value: number; unit: string }>;

        if (pidValues.length > 0 && history.length > 0) {
          updateWithLiveData(history[0].id, pidValues);
        }
      }
    },
  });

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: '24px', right: '24px' },
    'bottom-left': { bottom: '24px', left: '24px' },
    'bottom-center': { bottom: '24px', left: '50%', transform: 'translateX(-50%)' },
  };

  // State-based button styling
  const getButtonStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      position: 'relative',
    };

    switch (state) {
      case 'listening':
        return {
          ...base,
          background: sColor.red,
          boxShadow: `0 0 20px ${sColor.redGlow}, 0 0 40px ${sColor.redGlow}`,
          animation: 'voicePulse 1.5s ease-in-out infinite',
        };
      case 'processing':
        return {
          ...base,
          background: sColor.yellow,
          boxShadow: `0 0 15px oklch(0.75 0.18 60 / 0.3)`,
        };
      case 'responding':
        return {
          ...base,
          background: sColor.green,
          boxShadow: `0 0 15px oklch(0.65 0.20 145 / 0.3)`,
        };
      case 'error':
        return {
          ...base,
          background: 'oklch(0.40 0.15 25)',
          boxShadow: '0 0 10px oklch(0.40 0.15 25 / 0.3)',
        };
      default:
        return {
          ...base,
          background: sColor.bgCard,
          border: `2px solid ${sColor.border}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        };
    }
  };

  const getStatusText = (): string => {
    switch (state) {
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'responding': return 'Responding...';
      case 'error': return error || 'Error';
      default: return isConnected ? 'Ask Erika' : 'Ask Erika (No vehicle connected)';
    }
  };

  const getStatusColor = (): string => {
    switch (state) {
      case 'listening': return sColor.red;
      case 'processing': return sColor.yellow;
      case 'responding': return sColor.green;
      case 'error': return 'oklch(0.40 0.15 25)';
      default: return sColor.textDim;
    }
  };

  // Handle text command submission
  const handleTextSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    // For now, speak the text as a command hint
    // The full text command pipeline will be wired later
    setTextInput('');
  }, [textInput]);

  return (
    <>
      {/* CSS Animation */}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes voiceRipple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* Container */}
      <div style={{
        position: 'fixed',
        ...positionStyles[position],
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: position === 'bottom-left' ? 'flex-start' : position === 'bottom-center' ? 'center' : 'flex-end',
        gap: '12px',
      }}>
        {/* Expanded Panel */}
        {isExpanded && (
          <div
            ref={panelRef}
            style={{
              width: '360px',
              maxHeight: '500px',
              background: sColor.bg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Panel Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${sColor.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: sColor.bgCard,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={16} color={sColor.red} />
                <span style={{
                  fontFamily: sFont.heading,
                  fontSize: '1.1rem',
                  color: sColor.text,
                  letterSpacing: '0.05em',
                }}>
                  ERIKA VOICE
                </span>
                <span style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.6rem',
                  color: isConnected ? sColor.green : sColor.textMuted,
                  background: isConnected ? 'oklch(0.65 0.20 145 / 0.15)' : 'oklch(0.45 0.008 260 / 0.15)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}>
                  {isConnected ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    title="Clear history"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: sColor.textMuted,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: sColor.textMuted,
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Current Status */}
            <div style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderBottom: `1px solid ${sColor.border}`,
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: getStatusColor(),
                boxShadow: state !== 'idle' ? `0 0 8px ${getStatusColor()}` : 'none',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: sFont.body,
                fontSize: '0.85rem',
                color: sColor.text,
              }}>
                {getStatusText()}
              </span>
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: sColor.green,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                  }}
                >
                  <VolumeX size={14} /> STOP
                </button>
              )}
            </div>

            {/* Current Transcript */}
            {currentTranscript && (
              <div style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${sColor.border}`,
                background: 'oklch(0.12 0.005 260)',
              }}>
                <div style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.65rem',
                  color: sColor.textMuted,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                }}>
                  Transcript
                </div>
                <div style={{
                  fontFamily: sFont.body,
                  fontSize: '0.9rem',
                  color: sColor.text,
                  fontStyle: 'italic',
                }}>
                  "{currentTranscript}"
                </div>
              </div>
            )}

            {/* Command History */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 0',
              maxHeight: '280px',
            }}>
              {history.length === 0 ? (
                <div style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                }}>
                  <Mic size={32} color={sColor.textMuted} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <div style={{
                    fontFamily: sFont.body,
                    fontSize: '0.85rem',
                    color: sColor.textDim,
                    marginBottom: '8px',
                  }}>
                    Press and hold the mic button to ask a question
                  </div>
                  <div style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.textMuted,
                    lineHeight: 1.6,
                  }}>
                    Try: "How much fuel is in the tank?"<br />
                    "What's the engine temperature?"<br />
                    "How fast am I going?"<br />
                    "Are there any fault codes?"
                  </div>
                </div>
              ) : (
                history.map((cmd) => (
                  <div
                    key={cmd.id}
                    style={{
                      padding: '10px 16px',
                      borderBottom: `1px solid oklch(0.18 0.006 260)`,
                    }}
                  >
                    {/* User query */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '6px',
                    }}>
                      <Mic size={12} color={sColor.textMuted} style={{ marginTop: '3px', flexShrink: 0 }} />
                      <span style={{
                        fontFamily: sFont.body,
                        fontSize: '0.85rem',
                        color: sColor.text,
                      }}>
                        {cmd.transcript}
                      </span>
                    </div>

                    {/* Erika response */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      paddingLeft: '4px',
                    }}>
                      <Volume2 size={12} color={sColor.green} style={{ marginTop: '3px', flexShrink: 0 }} />
                      <div>
                        <span style={{
                          fontFamily: sFont.body,
                          fontSize: '0.82rem',
                          color: sColor.textDim,
                        }}>
                          {cmd.response || cmd.intent.naturalResponse}
                        </span>

                        {/* Matched PIDs */}
                        {cmd.intent.matchedPids.length > 0 && (
                          <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px',
                            marginTop: '6px',
                          }}>
                            {cmd.intent.matchedPids.map((p, i) => (
                              <span
                                key={i}
                                style={{
                                  fontFamily: sFont.mono,
                                  fontSize: '0.6rem',
                                  color: sColor.blue,
                                  background: 'oklch(0.70 0.18 200 / 0.12)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid oklch(0.70 0.18 200 / 0.2)',
                                }}
                              >
                                {p.shortName}
                                {cmd.liveValues?.find(v => v.shortName === p.shortName) && (
                                  <span style={{ color: sColor.green, marginLeft: '4px' }}>
                                    {cmd.liveValues.find(v => v.shortName === p.shortName)!.value}
                                    {cmd.liveValues.find(v => v.shortName === p.shortName)!.unit}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Replay button */}
                        <button
                          onClick={() => speak(cmd.response || cmd.intent.naturalResponse)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: sColor.textMuted,
                            padding: '2px 0',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontFamily: sFont.mono,
                            fontSize: '0.55rem',
                          }}
                        >
                          <Volume2 size={10} /> Replay
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Text Input (alternative to voice) */}
            <form
              onSubmit={handleTextSubmit}
              style={{
                padding: '10px 12px',
                borderTop: `1px solid ${sColor.border}`,
                display: 'flex',
                gap: '8px',
                background: sColor.bgCard,
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a command..."
                style={{
                  flex: 1,
                  background: sColor.bg,
                  border: `1px solid ${sColor.border}`,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontFamily: sFont.body,
                  fontSize: '0.82rem',
                  color: sColor.text,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                style={{
                  background: textInput.trim() ? sColor.red : sColor.bgHover,
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: textInput.trim() ? 'pointer' : 'default',
                  color: sColor.text,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        )}

        {/* Main Floating Button */}
        <div style={{ position: 'relative' }}>
          {/* Ripple effect when listening */}
          {state === 'listening' && (
            <>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: `2px solid ${sColor.red}`,
                animation: 'voiceRipple 1.5s ease-out infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: `2px solid ${sColor.red}`,
                animation: 'voiceRipple 1.5s ease-out infinite 0.5s',
                pointerEvents: 'none',
              }} />
            </>
          )}

          <button
            onMouseDown={() => {
              if (state === 'idle') startListening();
            }}
            onMouseUp={() => {
              if (state === 'listening') stopListening();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              if (state === 'idle') startListening();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (state === 'listening') stopListening();
            }}
            onClick={() => {
              if (state !== 'listening' && state !== 'idle') return;
              if (!isExpanded) setIsExpanded(true);
            }}
            style={getButtonStyle()}
            title={getStatusText()}
          >
            {state === 'processing' ? (
              <Loader2 size={24} color={sColor.bg} style={{ animation: 'spin 1s linear infinite' }} />
            ) : state === 'listening' ? (
              <Mic size={24} color="white" />
            ) : state === 'responding' ? (
              <Volume2 size={24} color="white" />
            ) : state === 'error' ? (
              <MicOff size={24} color="white" />
            ) : (
              <Mic size={24} color={sColor.textDim} />
            )}
          </button>

          {/* Expand/Collapse toggle */}
          {!isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: sColor.bgCard,
                border: `1px solid ${sColor.border}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sColor.textMuted,
              }}
            >
              <ChevronUp size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Spin animation for loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
