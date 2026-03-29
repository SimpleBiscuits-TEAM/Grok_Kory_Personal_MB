/**
 * Support Session Join Page
 * Customers land here via invite link from PPEI employees
 * No authentication required — link-based access
 * 
 * Flow:
 * 1. Validate invite link → show lobby or error
 * 2. Lobby: customer enters name, checks device permissions
 * 3. Join: enters active session with video/audio/screen/chat
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { SpeechToTextButton } from '@/components/SpeechToTextButton';
import { toast } from 'sonner';
import {
  Video, VideoOff, Mic, MicOff, Monitor, MonitorOff,
  MessageSquare, Send, Phone, PhoneOff, Users, Shield,
  CheckCircle, XCircle, Loader2, AlertTriangle, Clock,
  Headphones, Camera, ScreenShare, Settings, Volume2,
  ArrowLeft, Maximize2, Minimize2, X
} from 'lucide-react';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

// ─── Shared Styles ──────────────────────────────────────────────────────────
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace'
};
const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgDark: 'oklch(0.08 0.004 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  bgInput: 'oklch(0.10 0.005 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
};

// ─── Types ──────────────────────────────────────────────────────────────────
type SessionStatus = 'loading' | 'lobby' | 'connecting' | 'active' | 'ended' | 'expired' | 'error';
type DevicePermission = 'pending' | 'granted' | 'denied';

interface ChatMessage {
  id: string;
  sender: string;
  senderRole: 'customer' | 'ppei';
  message: string;
  timestamp: number;
}

interface DeviceState {
  camera: DevicePermission;
  microphone: DevicePermission;
  cameraStream: MediaStream | null;
  micStream: MediaStream | null;
}

// ─── Device Permission Check Component ──────────────────────────────────────
function DeviceCheck({
  label,
  icon: Icon,
  status,
  onRequest,
}: {
  label: string;
  icon: any;
  status: DevicePermission;
  onRequest: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: sColor.bgDark,
        border: `1px solid ${sColor.border}`,
        borderRadius: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Icon size={20} style={{ color: sColor.textDim }} />
        <span style={{ fontFamily: sFont.body, color: sColor.text, fontSize: '14px' }}>
          {label}
        </span>
      </div>
      {status === 'pending' && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRequest}
          style={{
            fontFamily: sFont.mono,
            fontSize: '11px',
            borderColor: sColor.border,
            color: sColor.text,
          }}
        >
          ALLOW
        </Button>
      )}
      {status === 'granted' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle size={16} style={{ color: sColor.green }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.green }}>
            READY
          </span>
        </div>
      )}
      {status === 'denied' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <XCircle size={16} style={{ color: sColor.red }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.red }}>
            BLOCKED
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Video Preview Component ────────────────────────────────────────────────
function VideoPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: sColor.bgDark,
          border: `1px solid ${sColor.border}`,
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <VideoOff size={48} style={{ color: sColor.textMuted }} />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: '100%',
        aspectRatio: '16/9',
        objectFit: 'cover',
        borderRadius: '4px',
        border: `1px solid ${sColor.border}`,
        background: sColor.bgDark,
      }}
    />
  );
}

// ─── Chat Panel Component ───────────────────────────────────────────────────
function ChatPanel({
  messages,
  onSend,
  customerName,
}: {
  messages: ChatMessage[];
  onSend: (msg: string) => void;
  customerName: string;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: sColor.bgCard,
        border: `1px solid ${sColor.border}`,
        borderRadius: '4px',
      }}
    >
      {/* Chat Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${sColor.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <MessageSquare size={16} style={{ color: sColor.red }} />
        <span style={{ fontFamily: sFont.heading, fontSize: '16px', color: sColor.text, letterSpacing: '1px' }}>
          SESSION CHAT
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <MessageSquare size={32} style={{ color: sColor.textMuted, margin: '0 auto 12px' }} />
            <p style={{ fontFamily: sFont.body, color: sColor.textDim, fontSize: '13px' }}>
              Chat with your PPEI support technician
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.senderRole === 'customer' ? 'flex-end' : 'flex-start',
            }}
          >
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '10px',
              color: sColor.textMuted,
              marginBottom: '2px',
              paddingLeft: msg.senderRole === 'ppei' ? '4px' : '0',
              paddingRight: msg.senderRole === 'customer' ? '4px' : '0',
            }}>
              {msg.sender} · {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div
              style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: '4px',
                background: msg.senderRole === 'customer' ? sColor.red : sColor.bgDark,
                border: msg.senderRole === 'ppei' ? `1px solid ${sColor.border}` : 'none',
              }}
            >
              <span style={{
                fontFamily: sFont.body,
                fontSize: '13px',
                color: sColor.text,
                lineHeight: '1.4',
              }}>
                {msg.message}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px',
          borderTop: `1px solid ${sColor.border}`,
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            background: sColor.bgInput,
            border: `1px solid ${sColor.border}`,
            borderRadius: '4px',
            padding: '8px 12px',
            fontFamily: sFont.body,
            fontSize: '13px',
            color: sColor.text,
            outline: 'none',
          }}
        />
        <SpeechToTextButton
          onTranscript={(text) => setDraft(prev => prev ? prev + ' ' + text : text)}
          variant="dark"
          size="sm"
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!draft.trim()}
          style={{
            background: sColor.red,
            borderRadius: '4px',
            width: '36px',
            height: '36px',
          }}
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}

// ─── Session Controls Toolbar ───────────────────────────────────────────────
function SessionToolbar({
  audioEnabled,
  videoEnabled,
  screenShareEnabled,
  chatOpen,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  chatOpen: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
}) {
  const btnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '16px',
        background: sColor.bgCard,
        borderTop: `1px solid ${sColor.border}`,
      }}
    >
      {/* Audio Toggle */}
      <button
        onClick={onToggleAudio}
        style={{
          ...btnBase,
          background: audioEnabled ? sColor.bgDark : sColor.red,
          border: `1px solid ${audioEnabled ? sColor.border : 'transparent'}`,
        }}
        title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {audioEnabled ? (
          <Mic size={20} style={{ color: sColor.text }} />
        ) : (
          <MicOff size={20} style={{ color: 'white' }} />
        )}
      </button>

      {/* Video Toggle */}
      <button
        onClick={onToggleVideo}
        style={{
          ...btnBase,
          background: videoEnabled ? sColor.bgDark : sColor.red,
          border: `1px solid ${videoEnabled ? sColor.border : 'transparent'}`,
        }}
        title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {videoEnabled ? (
          <Video size={20} style={{ color: sColor.text }} />
        ) : (
          <VideoOff size={20} style={{ color: 'white' }} />
        )}
      </button>

      {/* Screen Share Toggle */}
      <button
        onClick={onToggleScreenShare}
        style={{
          ...btnBase,
          background: screenShareEnabled ? sColor.green : sColor.bgDark,
          border: `1px solid ${screenShareEnabled ? 'transparent' : sColor.border}`,
        }}
        title={screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
      >
        {screenShareEnabled ? (
          <Monitor size={20} style={{ color: 'white' }} />
        ) : (
          <ScreenShare size={20} style={{ color: sColor.text }} />
        )}
      </button>

      {/* Chat Toggle */}
      <button
        onClick={onToggleChat}
        style={{
          ...btnBase,
          background: chatOpen ? sColor.blue : sColor.bgDark,
          border: `1px solid ${chatOpen ? 'transparent' : sColor.border}`,
        }}
        title={chatOpen ? 'Close chat' : 'Open chat'}
      >
        <MessageSquare size={20} style={{ color: chatOpen ? 'white' : sColor.text }} />
      </button>

      {/* Separator */}
      <div style={{ width: '1px', height: '32px', background: sColor.border, margin: '0 8px' }} />

      {/* Leave Session */}
      <button
        onClick={onLeave}
        style={{
          ...btnBase,
          background: sColor.red,
          width: '56px',
          borderRadius: '28px',
        }}
        title="Leave session"
      >
        <PhoneOff size={20} style={{ color: 'white' }} />
      </button>
    </div>
  );
}

// ─── Loading State ──────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: sColor.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Loader2 size={24} style={{ color: sColor.red, animation: 'spin 1s linear infinite' }} />
        <span style={{ fontFamily: sFont.heading, fontSize: '20px', color: sColor.text, letterSpacing: '2px' }}>
          LOADING SESSION...
        </span>
      </div>
    </div>
  );
}

// ─── Error / Expired State ──────────────────────────────────────────────────
function ErrorState({ type, message }: { type: 'expired' | 'error' | 'not_found'; message?: string }) {
  const config = {
    expired: {
      icon: Clock,
      title: 'SESSION EXPIRED',
      description: 'This support session link has expired. Please contact your PPEI representative for a new link.',
      color: sColor.yellow,
    },
    not_found: {
      icon: AlertTriangle,
      title: 'SESSION NOT FOUND',
      description: 'This support session link is invalid. Please check the URL or contact your PPEI representative.',
      color: sColor.red,
    },
    error: {
      icon: XCircle,
      title: 'CONNECTION ERROR',
      description: message || 'Unable to connect to the support session. Please try again or contact PPEI.',
      color: sColor.red,
    },
  };

  const { icon: Icon, title, description, color } = config[type];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: sColor.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '24px',
      }}
    >
      <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
      <div
        style={{
          maxWidth: '420px',
          textAlign: 'center',
          padding: '32px',
          background: sColor.bgCard,
          border: `1px solid ${sColor.border}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: '4px',
        }}
      >
        <Icon size={48} style={{ color, margin: '0 auto 16px' }} />
        <h2 style={{ fontFamily: sFont.heading, fontSize: '24px', color: sColor.text, letterSpacing: '2px', marginBottom: '12px' }}>
          {title}
        </h2>
        <p style={{ fontFamily: sFont.body, fontSize: '14px', color: sColor.textDim, lineHeight: '1.5' }}>
          {description}
        </p>
      </div>
      <a
        href="https://ppei.com"
        style={{
          fontFamily: sFont.mono,
          fontSize: '12px',
          color: sColor.textMuted,
          textDecoration: 'none',
          marginTop: '16px',
        }}
      >
        PPEI.COM
      </a>
    </div>
  );
}

// ─── Session Ended State ────────────────────────────────────────────────────
function SessionEndedState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: sColor.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '24px',
      }}
    >
      <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
      <div
        style={{
          maxWidth: '420px',
          textAlign: 'center',
          padding: '32px',
          background: sColor.bgCard,
          border: `1px solid ${sColor.border}`,
          borderLeft: `3px solid ${sColor.green}`,
          borderRadius: '4px',
        }}
      >
        <CheckCircle size={48} style={{ color: sColor.green, margin: '0 auto 16px' }} />
        <h2 style={{ fontFamily: sFont.heading, fontSize: '24px', color: sColor.text, letterSpacing: '2px', marginBottom: '12px' }}>
          SESSION ENDED
        </h2>
        <p style={{ fontFamily: sFont.body, fontSize: '14px', color: sColor.textDim, lineHeight: '1.5' }}>
          Thank you for using PPEI support. Your session has ended successfully.
          If you need further assistance, please contact your PPEI representative.
        </p>
      </div>
      <a
        href="https://ppei.com"
        style={{
          fontFamily: sFont.mono,
          fontSize: '12px',
          color: sColor.textMuted,
          textDecoration: 'none',
          marginTop: '16px',
        }}
      >
        PPEI.COM
      </a>
    </div>
  );
}

// ─── Session Lobby ──────────────────────────────────────────────────────────
function SessionLobby({
  customerName,
  onJoin,
  deviceState,
  onRequestCamera,
  onRequestMic,
}: {
  customerName: string;
  onJoin: (displayName: string) => void;
  deviceState: DeviceState;
  onRequestCamera: () => void;
  onRequestMic: () => void;
}) {
  const [displayName, setDisplayName] = useState(customerName || '');

  const canJoin = displayName.trim().length > 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: sColor.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* PPEI Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
        <div>
          <h1 style={{ fontFamily: sFont.heading, fontSize: '28px', color: sColor.text, letterSpacing: '3px', lineHeight: 1 }}>
            V-OP SUPPORT
          </h1>
          <span style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.textMuted, letterSpacing: '1px' }}>
            REMOTE ASSISTANCE BY PPEI
          </span>
        </div>
      </div>

      <div
        style={{
          maxWidth: '520px',
          width: '100%',
          background: sColor.bgCard,
          border: `1px solid ${sColor.border}`,
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {/* Lobby Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${sColor.border}`,
            borderLeft: `3px solid ${sColor.red}`,
          }}
        >
          <h2 style={{ fontFamily: sFont.heading, fontSize: '22px', color: sColor.text, letterSpacing: '2px', marginBottom: '4px' }}>
            READY TO JOIN?
          </h2>
          <p style={{ fontFamily: sFont.body, fontSize: '13px', color: sColor.textDim }}>
            Set up your devices before joining the support session
          </p>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Camera Preview */}
          <div style={{ marginBottom: '20px' }}>
            <VideoPreview stream={deviceState.cameraStream} />
          </div>

          {/* Display Name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.textDim, letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
              YOUR NAME
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: '100%',
                background: sColor.bgInput,
                border: `1px solid ${sColor.border}`,
                borderRadius: '4px',
                padding: '10px 14px',
                fontFamily: sFont.body,
                fontSize: '14px',
                color: sColor.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Device Permissions */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.textDim, letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>
              DEVICE PERMISSIONS
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <DeviceCheck
                label="Camera"
                icon={Camera}
                status={deviceState.camera}
                onRequest={onRequestCamera}
              />
              <DeviceCheck
                label="Microphone"
                icon={Headphones}
                status={deviceState.microphone}
                onRequest={onRequestMic}
              />
            </div>
            <p style={{ fontFamily: sFont.body, fontSize: '11px', color: sColor.textMuted, marginTop: '8px' }}>
              Camera and microphone are optional. You can still join with text chat only.
            </p>
          </div>

          {/* Join Button */}
          <button
            onClick={() => canJoin && onJoin(displayName.trim())}
            disabled={!canJoin}
            style={{
              width: '100%',
              padding: '14px',
              background: canJoin ? sColor.red : sColor.bgDark,
              color: canJoin ? 'white' : sColor.textMuted,
              border: canJoin ? 'none' : `1px solid ${sColor.border}`,
              borderRadius: '4px',
              fontFamily: sFont.heading,
              fontSize: '18px',
              letterSpacing: '3px',
              cursor: canJoin ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
          >
            JOIN SESSION
          </button>
        </div>
      </div>

      {/* Security Notice */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
        <Shield size={14} style={{ color: sColor.textMuted }} />
        <span style={{ fontFamily: sFont.mono, fontSize: '10px', color: sColor.textMuted, letterSpacing: '1px' }}>
          ENCRYPTED · PEER-TO-PEER · NO DATA STORED
        </span>
      </div>
    </div>
  );
}

// ─── Active Session View ────────────────────────────────────────────────────
function ActiveSession({
  displayName,
  onLeave,
  deviceState,
}: {
  displayName: string;
  onLeave: () => void;
  deviceState: DeviceState;
}) {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'PPEI Support',
      senderRole: 'ppei',
      message: `Welcome ${displayName}! I'm ready to help. What can I assist you with today?`,
      timestamp: Date.now(),
    },
  ]);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
    if (deviceState.micStream) {
      deviceState.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !audioEnabled;
      });
    }
  }, [audioEnabled, deviceState.micStream]);

  const handleToggleVideo = useCallback(() => {
    setVideoEnabled((prev) => !prev);
    if (deviceState.cameraStream) {
      deviceState.cameraStream.getVideoTracks().forEach((track) => {
        track.enabled = !videoEnabled;
      });
    }
  }, [videoEnabled, deviceState.cameraStream]);

  const handleToggleScreenShare = useCallback(async () => {
    if (screenShareEnabled && screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setScreenShareEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        setScreenStream(stream);
        setScreenShareEnabled(true);
        // Handle user stopping screen share via browser UI
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
          setScreenShareEnabled(false);
        };
      } catch (err) {
        toast.error('Screen sharing was cancelled or denied');
      }
    }
  }, [screenShareEnabled, screenStream]);

  const handleSendChat = useCallback((message: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        sender: displayName,
        senderRole: 'customer',
        message,
        timestamp: Date.now(),
      },
    ]);
  }, [displayName]);

  return (
    <div
      style={{
        height: '100vh',
        background: sColor.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: sColor.bgCard,
          borderBottom: `1px solid ${sColor.border}`,
          minHeight: '48px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '16px', color: sColor.text, letterSpacing: '2px' }}>
            V-OP SUPPORT SESSION
          </span>
          <Badge
            variant="outline"
            style={{
              fontFamily: sFont.mono,
              fontSize: '10px',
              borderColor: sColor.green,
              color: sColor.green,
              letterSpacing: '1px',
            }}
          >
            ● LIVE
          </Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} style={{ color: sColor.textDim }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '11px', color: sColor.textDim }}>
            2 CONNECTED
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video / Screen Share Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px', gap: '12px', overflow: 'hidden' }}>
          {/* Main Video (Screen share or PPEI employee webcam) */}
          <div
            style={{
              flex: 1,
              background: sColor.bgDark,
              border: `1px solid ${sColor.border}`,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {screenShareEnabled && screenStream ? (
              <video
                ref={(el) => {
                  if (el) el.srcObject = screenStream;
                }}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <Monitor size={64} style={{ color: sColor.textMuted, marginBottom: '16px' }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '18px', color: sColor.textDim, letterSpacing: '2px' }}>
                  WAITING FOR SCREEN SHARE
                </p>
                <p style={{ fontFamily: sFont.body, fontSize: '12px', color: sColor.textMuted, marginTop: '8px' }}>
                  The PPEI technician will share their screen when ready
                </p>
              </div>
            )}

            {/* PiP Self-view */}
            {videoEnabled && deviceState.cameraStream && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  width: '180px',
                  aspectRatio: '16/9',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: `2px solid ${sColor.border}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}
              >
                <video
                  ref={(el) => {
                    if (el) el.srcObject = deviceState.cameraStream;
                  }}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '8px',
                    fontFamily: sFont.mono,
                    fontSize: '9px',
                    color: sColor.text,
                    background: 'rgba(0,0,0,0.6)',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  {displayName}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat Sidebar */}
        {chatOpen && (
          <div style={{ width: '320px', padding: '12px 12px 12px 0', flexShrink: 0 }}>
            <ChatPanel
              messages={chatMessages}
              onSend={handleSendChat}
              customerName={displayName}
            />
          </div>
        )}
      </div>

      {/* Bottom Toolbar */}
      <SessionToolbar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        screenShareEnabled={screenShareEnabled}
        chatOpen={chatOpen}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleChat={() => setChatOpen((p) => !p)}
        onLeave={onLeave}
      />
    </div>
  );
}

// ─── Main SupportJoin Page ──────────────────────────────────────────────────
export default function SupportJoin() {
  const params = useParams<{ inviteLink: string }>();
  const inviteLink = params.inviteLink || '';

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [sessionData, setSessionData] = useState<{ id: string; customerName: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [deviceState, setDeviceState] = useState<DeviceState>({
    camera: 'pending',
    microphone: 'pending',
    cameraStream: null,
    micStream: null,
  });

  // Validate invite link on mount
  useEffect(() => {
    if (!inviteLink) {
      setStatus('error');
      return;
    }

    // Simulate session validation (will be replaced with real tRPC call)
    const validateSession = async () => {
      try {
        // For now, simulate a valid session
        // In production: const session = await trpc.support.getSessionByLink.query({ inviteLink });
        await new Promise((resolve) => setTimeout(resolve, 1200));

        // Simulated session data
        setSessionData({
          id: 'session-' + inviteLink,
          customerName: '',
        });
        setStatus('lobby');
      } catch (err: any) {
        if (err?.message?.includes('expired')) {
          setStatus('expired');
        } else if (err?.message?.includes('not found')) {
          setStatus('error');
        } else {
          setStatus('error');
        }
      }
    };

    validateSession();
  }, [inviteLink]);

  // Request camera permission
  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setDeviceState((prev) => ({
        ...prev,
        camera: 'granted',
        cameraStream: stream,
      }));
    } catch {
      setDeviceState((prev) => ({ ...prev, camera: 'denied' }));
      toast.error('Camera access denied. You can still join with text chat.');
    }
  }, []);

  // Request microphone permission
  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setDeviceState((prev) => ({
        ...prev,
        microphone: 'granted',
        micStream: stream,
      }));
    } catch {
      setDeviceState((prev) => ({ ...prev, microphone: 'denied' }));
      toast.error('Microphone access denied. You can still join with text chat.');
    }
  }, []);

  // Join session
  const handleJoin = useCallback((name: string) => {
    setDisplayName(name);
    setStatus('connecting');

    // Simulate connection (will be replaced with WebRTC signaling)
    setTimeout(() => {
      setStatus('active');
      toast.success('Connected to support session');
    }, 1500);
  }, []);

  // Leave session
  const handleLeave = useCallback(() => {
    // Stop all media streams
    if (deviceState.cameraStream) {
      deviceState.cameraStream.getTracks().forEach((track) => track.stop());
    }
    if (deviceState.micStream) {
      deviceState.micStream.getTracks().forEach((track) => track.stop());
    }
    setStatus('ended');
  }, [deviceState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (deviceState.cameraStream) {
        deviceState.cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (deviceState.micStream) {
        deviceState.micStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [deviceState.cameraStream, deviceState.micStream]);

  // Render based on status
  switch (status) {
    case 'loading':
      return <LoadingState />;

    case 'lobby':
      return (
        <SessionLobby
          customerName={sessionData?.customerName || ''}
          onJoin={handleJoin}
          deviceState={deviceState}
          onRequestCamera={requestCamera}
          onRequestMic={requestMic}
        />
      );

    case 'connecting':
      return (
        <div
          style={{
            minHeight: '100vh',
            background: sColor.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          <img src={PPEI_LOGO_URL} alt="PPEI" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={24} style={{ color: sColor.green, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: sFont.heading, fontSize: '20px', color: sColor.text, letterSpacing: '2px' }}>
              CONNECTING...
            </span>
          </div>
          <p style={{ fontFamily: sFont.body, fontSize: '13px', color: sColor.textDim }}>
            Establishing secure peer-to-peer connection
          </p>
        </div>
      );

    case 'active':
      return (
        <ActiveSession
          displayName={displayName}
          onLeave={handleLeave}
          deviceState={deviceState}
        />
      );

    case 'ended':
      return <SessionEndedState />;

    case 'expired':
      return <ErrorState type="expired" />;

    case 'error':
    default:
      return <ErrorState type="not_found" />;
  }
}
