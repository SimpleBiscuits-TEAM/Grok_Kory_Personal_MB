/**
 * FeedbackPanel — Feedback and error reporting via tRPC
 *
 * Design: Dark theme, Bebas Neue headings, Rajdhani body, red accents
 * Submits to backend via tRPC → saved to DB + owner notification
 *
 * Tab 1: General Feedback
 * Tab 2: Error / Bug Report
 */

import React, { useState } from 'react';
import { MessageSquare, AlertTriangle, X, Send, CheckCircle, ChevronDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';

type Tab = 'feedback' | 'error';
type Status = 'idle' | 'sending' | 'success' | 'error';

interface FeedbackPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional: pre-fill context (e.g. current file name) */
  context?: string;
}

export function FeedbackPanel({ isOpen, onClose, context }: FeedbackPanelProps) {
  const [tab, setTab] = useState<Tab>('feedback');
  const [status, setStatus] = useState<Status>('idle');

  // Feedback form state
  const [fbName, setFbName] = useState('');
  const [fbEmail, setFbEmail] = useState('');
  const [fbRating, setFbRating] = useState<number | null>(null);
  const [fbMessage, setFbMessage] = useState('');

  // Error report form state
  const [errName, setErrName] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [errType, setErrType] = useState('');
  const [errDescription, setErrDescription] = useState('');
  const [errSteps, setErrSteps] = useState('');

  const submitMutation = trpc.feedback.submit.useMutation();

  const resetAll = () => {
    setStatus('idle');
    setFbName(''); setFbEmail(''); setFbRating(null); setFbMessage('');
    setErrName(''); setErrEmail(''); setErrType(''); setErrDescription(''); setErrSteps('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const result = await submitMutation.mutateAsync({
        type: 'feedback',
        name: fbName || undefined,
        email: fbEmail || undefined,
        rating: fbRating ?? undefined,
        message: fbMessage,
        context: context || undefined,
      });
      setStatus(result.success ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  const handleErrorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const result = await submitMutation.mutateAsync({
        type: 'error',
        name: errName || undefined,
        email: errEmail || undefined,
        message: errDescription,
        errorType: errType || undefined,
        stepsToReproduce: errSteps || undefined,
        context: context || undefined,
      });
      setStatus(result.success ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontFamily: '"Rajdhani", sans-serif',
    fontSize: '0.9rem',
    background: 'oklch(0.10 0.005 260)',
    border: '1px solid oklch(0.28 0.008 260)',
    borderRadius: '3px',
    color: 'white',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: '"Rajdhani", sans-serif',
    fontSize: '0.8rem',
    color: 'oklch(0.60 0.010 260)',
    letterSpacing: '0.04em',
    marginBottom: '4px',
    textTransform: 'uppercase',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'oklch(0 0 0 / 0.6)',
          zIndex: 998,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel — bottom-sheet on mobile, centered modal on desktop */}
      <div
        className="ppei-anim-scale-in ppei-feedback-panel"
        style={{
          position: 'fixed',
          zIndex: 999,
          background: 'oklch(0.11 0.005 260)',
          border: '1px solid oklch(0.25 0.008 260)',
          borderTop: '3px solid oklch(0.52 0.22 25)',
          boxShadow: '0 20px 60px oklch(0 0 0 / 0.7)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <style>{`
          .ppei-feedback-panel {
            /* Mobile: bottom sheet */
            bottom: 0;
            left: 0;
            right: 0;
            max-height: 90vh;
            max-height: 90dvh;
            border-radius: 12px 12px 0 0 !important;
            width: 100% !important;
          }
          @media (min-width: 640px) {
            .ppei-feedback-panel {
              /* Desktop: centered modal */
              bottom: auto !important;
              left: 50% !important;
              right: auto !important;
              top: 50%;
              transform: translate(-50%, -50%);
              width: min(520px, 95vw) !important;
              max-height: 85vh !important;
              border-radius: 4px !important;
            }
          }
        `}</style>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid oklch(0.20 0.008 260)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'oklch(0.52 0.22 25)',
              borderRadius: '3px',
              padding: '4px 8px',
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.7rem',
              color: 'white',
              letterSpacing: '0.08em',
            }}>BETA</div>
            <h2 style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1.2rem',
              letterSpacing: '0.08em',
              color: 'white',
              margin: 0,
            }}>REPORT CENTER</h2>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'oklch(0.68 0.010 260)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = 'oklch(0.68 0.010 260)')}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid oklch(0.20 0.008 260)',
        }}>
          {([
            { id: 'feedback' as Tab, label: 'FEEDBACK', icon: <MessageSquare style={{ width: '14px', height: '14px' }} /> },
            { id: 'error' as Tab, label: 'ERROR REPORT', icon: <AlertTriangle style={{ width: '14px', height: '14px' }} /> },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setStatus('idle'); }}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid oklch(0.52 0.22 25)' : '2px solid transparent',
                color: tab === t.id ? 'white' : 'oklch(0.68 0.010 260)',
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '0.95rem',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem', paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}>

          {/* Success state */}
          {status === 'success' && (
            <div className="ppei-anim-scale-in" style={{
              textAlign: 'center',
              padding: '2rem 1rem',
            }}>
              <CheckCircle style={{ width: '48px', height: '48px', color: 'oklch(0.65 0.20 145)', margin: '0 auto 1rem' }} />
              <h3 style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '1.4rem',
                letterSpacing: '0.08em',
                color: 'white',
                marginBottom: '0.5rem',
              }}>REPORT SENT</h3>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', color: 'oklch(0.60 0.010 260)', fontSize: '0.9rem' }}>
                Thanks for your feedback. We review every submission.
              </p>
              <button
                onClick={handleClose}
                style={{
                  marginTop: '1.5rem',
                  background: 'oklch(0.52 0.22 25)',
                  color: 'white',
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  padding: '8px 24px',
                  borderRadius: '3px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >CLOSE</button>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div style={{
              background: 'oklch(0.14 0.010 25)',
              border: '1px solid oklch(0.52 0.22 25 / 0.5)',
              borderRadius: '3px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              color: 'oklch(0.75 0.18 25)',
            }}>
              Submission failed. Please try again later.
            </div>
          )}

          {/* Feedback Form */}
          {status !== 'success' && tab === 'feedback' && (
            <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.68 0.010 260)', margin: 0 }}>
                Help us improve. All feedback is reviewed directly by the team.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Name (optional)</label>
                  <input
                    type="text"
                    value={fbName}
                    onChange={e => setFbName(e.target.value)}
                    placeholder="Your name"
                    style={inputStyle}
                    className="ppei-input-focus"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email (optional)</label>
                  <input
                    type="email"
                    value={fbEmail}
                    onChange={e => setFbEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={inputStyle}
                    className="ppei-input-focus"
                  />
                </div>
              </div>

              {/* Star rating */}
              <div>
                <label style={labelStyle}>Rating</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFbRating(n)}
                      style={{
                        width: '36px',
                        height: '36px',
                        background: fbRating !== null && n <= fbRating ? 'oklch(0.75 0.18 40)' : 'oklch(0.36 0.008 260)',
                        border: `1px solid ${fbRating !== null && n <= fbRating ? 'oklch(0.75 0.18 40)' : 'oklch(0.48 0.008 260)'}`,
                        borderRadius: '3px',
                        color: fbRating !== null && n <= fbRating ? 'oklch(0.30 0.005 260)' : 'oklch(0.68 0.010 260)',
                        fontFamily: '"Bebas Neue", sans-serif',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >{n}</button>
                  ))}
                  {fbRating && (
                    <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.75 0.18 40)', alignSelf: 'center' }}>
                      {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][fbRating]}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Feedback <span style={{ color: 'oklch(0.52 0.22 25)' }}>*</span></label>
                <textarea
                  required
                  value={fbMessage}
                  onChange={e => setFbMessage(e.target.value)}
                  placeholder="What's working well? What could be better? Any features you'd like to see?"
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
                  className="ppei-input-focus"
                />
              </div>

              <button
                type="submit"
                disabled={status === 'sending' || !fbMessage.trim()}
                style={{
                  background: status === 'sending' || !fbMessage.trim() ? 'oklch(0.30 0.010 260)' : 'oklch(0.52 0.22 25)',
                  color: 'white',
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.1em',
                  padding: '10px 24px',
                  borderRadius: '3px',
                  border: 'none',
                  cursor: status === 'sending' || !fbMessage.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                  alignSelf: 'stretch',
                  width: '100%',
                }}
              >
                <Send style={{ width: '14px', height: '14px' }} />
                {status === 'sending' ? 'SENDING...' : 'SEND FEEDBACK'}
              </button>
            </form>
          )}

          {/* Error Report Form */}
          {status !== 'success' && tab === 'error' && (
            <form onSubmit={handleErrorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.68 0.010 260)', margin: 0 }}>
                Found a bug or incorrect result? Report it here and we'll investigate.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Name (optional)</label>
                  <input
                    type="text"
                    value={errName}
                    onChange={e => setErrName(e.target.value)}
                    placeholder="Your name"
                    style={inputStyle}
                    className="ppei-input-focus"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email (optional)</label>
                  <input
                    type="email"
                    value={errEmail}
                    onChange={e => setErrEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={inputStyle}
                    className="ppei-input-focus"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Error Type <span style={{ color: 'oklch(0.52 0.22 25)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <select
                    required
                    value={errType}
                    onChange={e => setErrType(e.target.value)}
                    style={{
                      ...inputStyle,
                      appearance: 'none',
                      paddingRight: '32px',
                    }}
                    className="ppei-input-focus"
                  >
                    <option value="">Select error type...</option>
                    <option value="File Upload / Parse Error">File Upload / Parse Error</option>
                    <option value="Incorrect Diagnostic Result">Incorrect Diagnostic Result</option>
                    <option value="Wrong HP / Torque Values">Wrong HP / Torque Values</option>
                    <option value="VIN Decode Issue">VIN Decode Issue</option>
                    <option value="Chart Not Displaying">Chart Not Displaying</option>
                    <option value="PDF Export Issue">PDF Export Issue</option>
                    <option value="DTC Lookup Error">DTC Lookup Error</option>
                    <option value="OBD Datalogger Issue">OBD Datalogger Issue</option>
                    <option value="App Crash / Freeze">App Crash / Freeze</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    width: '14px', height: '14px',
                    color: 'oklch(0.68 0.010 260)',
                    pointerEvents: 'none',
                  }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description <span style={{ color: 'oklch(0.52 0.22 25)' }}>*</span></label>
                <textarea
                  required
                  value={errDescription}
                  onChange={e => setErrDescription(e.target.value)}
                  placeholder="Describe what went wrong. Include any error messages you saw."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                  className="ppei-input-focus"
                />
              </div>

              <div>
                <label style={labelStyle}>Steps to Reproduce (optional)</label>
                <textarea
                  value={errSteps}
                  onChange={e => setErrSteps(e.target.value)}
                  placeholder={"1. Uploaded file X\n2. Clicked Y\n3. Saw error..."}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                  className="ppei-input-focus"
                />
              </div>

              {context && (
                <div style={{
                  background: 'oklch(0.13 0.006 260)',
                  border: '1px solid oklch(0.22 0.008 260)',
                  borderRadius: '3px',
                  padding: '0.6rem 0.75rem',
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.75rem',
                  color: 'oklch(0.63 0.010 260)',
                }}>
                  Context auto-attached: {context}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !errType || !errDescription.trim()}
                style={{
                  background: status === 'sending' || !errType || !errDescription.trim() ? 'oklch(0.50 0.010 260)' : 'oklch(0.52 0.22 25)',
                  color: 'white',
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.1em',
                  padding: '10px 24px',
                  borderRadius: '3px',
                  border: 'none',
                  cursor: status === 'sending' || !errType || !errDescription.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                  alignSelf: 'stretch',
                  width: '100%',
                }}
              >
                <AlertTriangle style={{ width: '14px', height: '14px' }} />
                {status === 'sending' ? 'SENDING...' : 'SUBMIT ERROR REPORT'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

/** Floating trigger button — fixed bottom-right, compact on mobile */
export function FeedbackTrigger({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="ppei-feedback-trigger-wrap"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
      }}
    >
      <style>{`
        .ppei-feedback-trigger-label {
          display: none;
        }
        .ppei-feedback-trigger-wrap {
          bottom: 1rem !important;
          right: 1rem !important;
        }
        @media (min-width: 640px) {
          .ppei-feedback-trigger-label {
            display: inline;
          }
          .ppei-feedback-trigger-wrap {
            bottom: 1.5rem !important;
            right: 1.5rem !important;
          }
        }
      `}</style>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="ppei-btn-hover"
        style={{
          background: hovered ? 'oklch(0.45 0.22 25)' : 'oklch(0.52 0.22 25)',
          color: 'white',
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '0.9rem',
          letterSpacing: '0.1em',
          padding: '10px 18px',
          borderRadius: '3px',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: hovered
            ? '0 4px 20px oklch(0.52 0.22 25 / 0.5)'
            : '0 2px 12px oklch(0.52 0.22 25 / 0.3)',
          transition: 'all 0.2s ease',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        }}
      >
        <MessageSquare style={{ width: '15px', height: '15px' }} />
        <span className="ppei-feedback-trigger-label">FEEDBACK / REPORT</span>
      </button>
    </div>
  );
}
