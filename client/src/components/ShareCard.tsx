/**
 * ShareCard — Universal Facebook/Social sharing component for V-OP
 * Generates a styled share card with the user's truck photo as background
 * and data overlay. Supports sharing to Facebook, copying link, or native share.
 *
 * Share card types:
 *  - dyno: HP/TQ numbers from datalog analysis
 *  - diagnostic: Health score from diagnostic report
 *  - timeslip: Drag racing time slip data
 *  - callout: Regional callout challenge
 *  - league: League standings/championship
 *  - fleet: Fleet stats summary
 *  - community: Forum post/thread
 *  - health: Full health report card
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Share2, Facebook, Copy, Download, Image, Upload, X } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

// @ts-ignore — dom-to-image-more has no @types package
import domtoimage from 'dom-to-image-more';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

export type ShareCardType = 'dyno' | 'diagnostic' | 'timeslip' | 'callout' | 'league' | 'fleet' | 'community' | 'health';

export interface ShareCardData {
  type: ShareCardType;
  title: string;
  subtitle?: string;
  /** Primary stat (e.g., "620 HP", "10.8s", "94/100") */
  primaryStat?: string;
  primaryLabel?: string;
  /** Secondary stat */
  secondaryStat?: string;
  secondaryLabel?: string;
  /** Tertiary stat */
  tertiaryStat?: string;
  tertiaryLabel?: string;
  /** User's vehicle description */
  vehicleDesc?: string;
  /** User's display name */
  userName?: string;
  /** Location for regional callouts */
  location?: string;
  /** Truck photo URL */
  vehiclePhotoUrl?: string;
  /** Custom share text for Facebook */
  shareText?: string;
}

// Color schemes per card type
const CARD_THEMES: Record<ShareCardType, { accent: string; gradient: string; badge: string }> = {
  dyno: { accent: 'from-red-600 to-orange-500', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-red-600' },
  diagnostic: { accent: 'from-emerald-500 to-cyan-500', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-emerald-600' },
  timeslip: { accent: 'from-amber-500 to-red-600', gradient: 'from-black/85 via-black/65 to-black/40', badge: 'bg-amber-600' },
  callout: { accent: 'from-red-700 to-red-500', gradient: 'from-black/90 via-black/70 to-black/40', badge: 'bg-red-700' },
  league: { accent: 'from-purple-600 to-blue-500', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-purple-600' },
  fleet: { accent: 'from-blue-600 to-cyan-500', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-blue-600' },
  community: { accent: 'from-indigo-500 to-purple-500', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-indigo-600' },
  health: { accent: 'from-emerald-600 to-green-400', gradient: 'from-black/80 via-black/60 to-transparent', badge: 'bg-emerald-600' },
};

const TYPE_LABELS: Record<ShareCardType, string> = {
  dyno: 'LOG DETAILS',
  diagnostic: 'DIAGNOSTIC REPORT',
  timeslip: 'TIME SLIP',
  callout: 'REGIONAL CALLOUT',
  league: 'LEAGUE STANDINGS',
  fleet: 'FLEET REPORT',
  community: 'COMMUNITY',
  health: 'HEALTH REPORT',
};

interface ShareCardProps {
  data: ShareCardData;
  /** Optional: allow user to upload a truck photo inline */
  onPhotoUpload?: (file: File) => void;
  /** Trigger element — defaults to a share button */
  trigger?: React.ReactNode;
  /** Compact mode — just the button, no dialog */
  compact?: boolean;
}

export function ShareCard({ data, onPhotoUpload, trigger, compact }: ShareCardProps) {
  const [open, setOpen] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const theme = CARD_THEMES[data.type];
  const typeLabel = TYPE_LABELS[data.type];
  const photoUrl = localPhoto || data.vehiclePhotoUrl;

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo must be under 10MB');
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPhoto(url);
    onPhotoUpload?.(file);
  }, [onPhotoUpload]);

  const downloadCard = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await domtoimage.toPng(cardRef.current, {
        scale: 3,
        bgcolor: '#0a0a0a',
        width: 600,
        height: 315,
      });
      const link = document.createElement('a');
      link.download = `vop-${data.type}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Share card downloaded!');
    } catch {
      toast.error('Failed to generate image');
    }
  }, [data.type]);

  const shareToFacebook = useCallback(async () => {
    const shareUrl = window.location.href;
    const text = data.shareText || `${data.title} — ${data.primaryStat || ''} | V-OP by PPEI`;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`;
    window.open(fbUrl, '_blank', 'width=600,height=400');
    toast.success('Opening Facebook...');
  }, [data]);

  const copyShareLink = useCallback(() => {
    const text = data.shareText || `${data.title} — ${data.primaryStat || ''} | V-OP by PPEI\n${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [data]);

  const nativeShare = useCallback(async () => {
    if (!navigator.share) {
      copyShareLink();
      return;
    }
    try {
      await navigator.share({
        title: `V-OP ${typeLabel}`,
        text: data.shareText || `${data.title} — ${data.primaryStat || ''} | V-OP by PPEI`,
        url: window.location.href,
      });
    } catch {
      // User cancelled
    }
  }, [data, typeLabel, copyShareLink]);

  // The visual share card
  const ShareCardVisual = (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-lg"
      style={{ width: 600, height: 315, background: '#0a0a0a' }}
    >
      {/* Truck photo background */}
      {photoUrl && (
        <img
          src={photoUrl}
          alt="Vehicle"
          className="absolute inset-0 w-full h-full object-cover"
          crossOrigin="anonymous"
        />
      )}

      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-r ${theme.gradient}`} />

      {/* Accent bar top */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${theme.accent}`} />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6">
        {/* Top section */}
        <div className="flex items-start justify-between">
          <div>
            {/* Type badge */}
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-widest text-white ${theme.badge} mb-2`}>
              {typeLabel}
            </span>
            {/* Title */}
            <h2 className="text-white text-xl font-bold leading-tight max-w-[380px]" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
              {data.title}
            </h2>
            {data.subtitle && (
              <p className="text-white/70 text-xs mt-1">{data.subtitle}</p>
            )}
          </div>
          {/* PPEI Logo */}
          <img src={PPEI_LOGO_URL} alt="PPEI" className="w-10 h-10 rounded" crossOrigin="anonymous" />
        </div>

        {/* Stats section */}
        <div className="flex items-end justify-between">
          <div className="flex gap-6">
            {data.primaryStat && (
              <div>
                <div className="text-white text-3xl font-black leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {data.primaryStat}
                </div>
                {data.primaryLabel && (
                  <div className="text-white/60 text-[10px] uppercase tracking-wider mt-0.5">{data.primaryLabel}</div>
                )}
              </div>
            )}
            {data.secondaryStat && (
              <div>
                <div className="text-white text-2xl font-bold leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {data.secondaryStat}
                </div>
                {data.secondaryLabel && (
                  <div className="text-white/60 text-[10px] uppercase tracking-wider mt-0.5">{data.secondaryLabel}</div>
                )}
              </div>
            )}
            {data.tertiaryStat && (
              <div>
                <div className="text-white text-2xl font-bold leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {data.tertiaryStat}
                </div>
                {data.tertiaryLabel && (
                  <div className="text-white/60 text-[10px] uppercase tracking-wider mt-0.5">{data.tertiaryLabel}</div>
                )}
              </div>
            )}
          </div>

          {/* Bottom right info */}
          <div className="text-right">
            {data.vehicleDesc && (
              <div className="text-white/80 text-xs font-medium">{data.vehicleDesc}</div>
            )}
            {data.userName && (
              <div className="text-white/50 text-[10px]">{data.userName}</div>
            )}
            {data.location && (
              <div className="text-white/50 text-[10px]">📍 {data.location}</div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-[9px] font-mono">V-OP BETA {APP_VERSION}</span>
            <span className="text-white/20">•</span>
            <span className="text-white/40 text-[9px]">PPEI CUSTOM TUNING</span>
          </div>
          <span className="text-white/30 text-[9px]">ppei.com</span>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={nativeShare}
        className="gap-1.5 text-xs border-white/10 text-white/60 hover:text-white hover:bg-white/5"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-white/10 text-white/60 hover:text-white hover:bg-white/5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[680px] bg-[#0d0f14] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
            Share to Facebook
          </DialogTitle>
        </DialogHeader>

        {/* Card Preview */}
        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-white/10" style={{ maxWidth: '100%' }}>
            <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left', width: '117.6%' }}>
              {ShareCardVisual}
            </div>
          </div>

          {/* Photo upload overlay */}
          {!photoUrl && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg border-2 border-dashed border-white/20 hover:border-ppei-red/50 transition-colors cursor-pointer"
            >
              <Upload className="w-8 h-8 text-white/40 mb-2" />
              <span className="text-white/60 text-sm font-medium">Upload your truck photo</span>
              <span className="text-white/40 text-xs mt-1">Makes your share card look 🔥</span>
            </button>
          )}

          {/* Change photo button */}
          {photoUrl && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white/70 hover:text-white rounded-full p-1.5 transition-colors"
              title="Change photo"
            >
              <Image className="w-4 h-4" />
            </button>
          )}

          {/* Remove photo */}
          {localPhoto && (
            <button
              onClick={() => setLocalPhoto(null)}
              className="absolute top-2 right-10 bg-black/60 hover:bg-black/80 text-white/70 hover:text-white rounded-full p-1.5 transition-colors"
              title="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelect}
        />

        {/* Share actions */}
        <div className="flex gap-2 mt-2">
          <Button
            onClick={shareToFacebook}
            className="flex-1 gap-2 bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold"
          >
            <Facebook className="w-4 h-4" />
            Share to Facebook
          </Button>
          <Button
            onClick={downloadCard}
            variant="outline"
            className="gap-2 border-white/10 text-white/70 hover:text-white hover:bg-white/5"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button
            onClick={copyShareLink}
            variant="outline"
            className="gap-2 border-white/10 text-white/70 hover:text-white hover:bg-white/5"
          >
            <Copy className="w-4 h-4" />
            Copy
          </Button>
        </div>

        <p className="text-white/30 text-[10px] text-center mt-1">
          V-OP BETA {APP_VERSION} — Every share is free marketing for your build. 🔥
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick share button — no dialog, just shares via native share or copies to clipboard
 */
export function QuickShareButton({ data, className }: { data: ShareCardData; className?: string }) {
  const handleShare = useCallback(async () => {
    const text = data.shareText || `${data.title} — ${data.primaryStat || ''} | V-OP by PPEI`;
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: `V-OP ${TYPE_LABELS[data.type]}`, text, url });
        return;
      } catch {
        // User cancelled or not supported
      }
    }

    // Fallback: copy to clipboard
    navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
      toast.success('Copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [data]);

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors ${className || ''}`}
      title="Share"
    >
      <Share2 className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Helper to build share data from different modules ──────────────────────

export function buildDynoShareData(hp: number, tq: number, vehicleDesc?: string, userName?: string, vehiclePhotoUrl?: string): ShareCardData {
  return {
    type: 'dyno',
    title: 'LOG DETAILS',
    subtitle: vehicleDesc || 'Duramax Performance',
    primaryStat: `${hp} HP`,
    primaryLabel: 'Peak Horsepower',
    secondaryStat: `${tq} TQ`,
    secondaryLabel: 'Peak Torque',
    vehicleDesc,
    userName,
    vehiclePhotoUrl,
    shareText: `Just analyzed my ${vehicleDesc || 'truck'} — ${hp}HP / ${tq}TQ. Built by PPEI 🔥 #VOP #PPEI #Duramax`,
  };
}

export function buildDiagnosticShareData(score: number, status: string, vehicleDesc?: string, userName?: string, vehiclePhotoUrl?: string): ShareCardData {
  return {
    type: 'diagnostic',
    title: 'VEHICLE HEALTH',
    subtitle: vehicleDesc || 'Diagnostic Report',
    primaryStat: `${score}/100`,
    primaryLabel: 'Health Score',
    secondaryStat: status.toUpperCase(),
    secondaryLabel: 'Status',
    vehicleDesc,
    userName,
    vehiclePhotoUrl,
    shareText: `V-OP Health Score: ${score}/100 — ${status}. My truck is dialed. 💪 #VOP #PPEI`,
  };
}

export function buildTimeslipShareData(
  et: string, mph: string, sixtyFt: string,
  vehicleDesc?: string, userName?: string, location?: string, vehiclePhotoUrl?: string
): ShareCardData {
  return {
    type: 'timeslip',
    title: 'TIME SLIP',
    subtitle: location || 'Drag Strip',
    primaryStat: `${et}s`,
    primaryLabel: '1/4 Mile ET',
    secondaryStat: `${mph} MPH`,
    secondaryLabel: 'Trap Speed',
    tertiaryStat: `${sixtyFt}s`,
    tertiaryLabel: '60ft',
    vehicleDesc,
    userName,
    location,
    vehiclePhotoUrl,
    shareText: `${et} @ ${mph}mph — ${location || 'the strip'} 🏁 ${vehicleDesc || ''} #VOP #PPEI #DragRacing`,
  };
}

export function buildCalloutShareData(
  title: string, location: string, vehicleDesc?: string, userName?: string, vehiclePhotoUrl?: string
): ShareCardData {
  return {
    type: 'callout',
    title: title.toUpperCase(),
    subtitle: `Regional Challenge — ${location}`,
    primaryStat: '🏆',
    primaryLabel: 'COME TAKE IT',
    vehicleDesc,
    userName,
    location,
    vehiclePhotoUrl,
    shareText: `${title} — Come take it. 🐊 ${location} #VOP #PPEI #Callout`,
  };
}

export function buildLeagueShareData(
  leagueName: string, rank: number, points: number,
  vehicleDesc?: string, userName?: string, vehiclePhotoUrl?: string
): ShareCardData {
  return {
    type: 'league',
    title: leagueName.toUpperCase(),
    subtitle: 'Championship Standings',
    primaryStat: `#${rank}`,
    primaryLabel: 'Current Rank',
    secondaryStat: `${points} PTS`,
    secondaryLabel: 'Season Points',
    vehicleDesc,
    userName,
    vehiclePhotoUrl,
    shareText: `${leagueName} — #${rank} Ranked with ${points} points 🏆 #VOP #PPEI`,
  };
}

export function buildFleetShareData(
  vehicleCount: number, avgMpg: number, totalMiles: number,
  orgName?: string, vehiclePhotoUrl?: string
): ShareCardData {
  return {
    type: 'fleet',
    title: orgName || 'FLEET REPORT',
    subtitle: 'V-OP Fleet Management',
    primaryStat: `${vehicleCount}`,
    primaryLabel: 'Vehicles',
    secondaryStat: `${avgMpg.toFixed(1)} MPG`,
    secondaryLabel: 'Fleet Average',
    tertiaryStat: `${(totalMiles / 1000).toFixed(0)}K`,
    tertiaryLabel: 'Total Miles',
    vehiclePhotoUrl,
    shareText: `My fleet: ${vehicleCount} trucks averaging ${avgMpg.toFixed(1)} MPG across ${totalMiles.toLocaleString()} miles 📊 #VOP #PPEI #FleetManagement`,
  };
}

export function buildCommunityShareData(
  threadTitle: string, category: string, userName?: string
): ShareCardData {
  return {
    type: 'community',
    title: threadTitle,
    subtitle: `${category} — V-OP Community`,
    userName,
    shareText: `${threadTitle} — Check out this discussion on V-OP Community #VOP #PPEI`,
  };
}

export function buildHealthShareData(
  score: number, status: string, vehicleDesc?: string, userName?: string, vehiclePhotoUrl?: string
): ShareCardData {
  return {
    type: 'health',
    title: 'HEALTH REPORT CARD',
    subtitle: vehicleDesc || 'Vehicle Health Analysis',
    primaryStat: `${score}/100`,
    primaryLabel: 'Overall Score',
    secondaryStat: status.toUpperCase(),
    secondaryLabel: 'Verdict',
    vehicleDesc,
    userName,
    vehiclePhotoUrl,
    shareText: `V-OP Health Report: ${score}/100 — ${status}. AI-powered analysis by PPEI 🔧 #VOP #PPEI`,
  };
}
