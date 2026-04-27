/**
 * V-OP Drag Racing — Regional Callouts, User-Created Leagues, BTC Wagering
 * "Fastest in Louisiana" style challenges, bracket racing, championship series
 * Facebook sharing, AI race reports, community-driven competition
 * Pricing: 3 free runs → $20/mo (bragging rights) → $200/mo (BTC wagering)
 */
import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Loader2, Flag, Trophy, MapPin, Users, Timer, Crown,
  Plus, Share2, Bitcoin, Shield, Star, Target,
  Medal, Swords, Award, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShareCard, buildTimeslipShareData, buildCalloutShareData, buildLeagueShareData, QuickShareButton } from '@/components/ShareCard';

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
  gold: 'oklch(0.80 0.18 80)',
  btcOrange: 'oklch(0.72 0.18 55)',
};

type DragTab = 'leaderboard' | 'callouts' | 'leagues' | 'timeslips' | 'profile';

export function DragContent() {
  return <DragRacing embedded />;
}

export default function DragRacing({ embedded = false }: { embedded?: boolean }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<DragTab>('leaderboard');

  // Queries — match actual router input shapes exactly
  const leaderboardQuery = trpc.drag.getLeaderboard.useQuery(
    { limit: 50 },
    { enabled: true }
  );
  const calloutsQuery = trpc.drag.getCallouts.useQuery(
    { limit: 50 },
    { enabled: activeTab === 'callouts' }
  );
  const leaguesQuery = trpc.drag.getLeagues.useQuery(
    { limit: 50 },
    { enabled: activeTab === 'leagues' }
  );
  const myProfileQuery = trpc.drag.getMyProfile.useQuery(
    undefined,
    { enabled: isAuthenticated && (activeTab === 'profile' || activeTab === 'timeslips') }
  );
  const regionalChampionsQuery = trpc.drag.getRegionalChampions.useQuery(
    { raceType: 'quarter', limit: 50 },
    { enabled: activeTab === 'leaderboard' }
  );
  const profileBadgesQuery = trpc.drag.getProfileBadges.useQuery(
    { profileId: myProfileQuery.data?.id ?? 0 },
    { enabled: !!myProfileQuery.data?.id && activeTab === 'profile' }
  );

  // Create callout state
  const [showCreateCallout, setShowCreateCallout] = useState(false);
  const [calloutForm, setCalloutForm] = useState({
    title: '',
    locationType: 'state' as const,
    locationValue: '',
    locationState: '',
    vehicleClass: 'open',
    description: '',
  });

  // Bracket state
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const bracketQuery = trpc.drag.getPlayoffBracket.useQuery(
    { seasonId: selectedSeasonId! },
    { enabled: !!selectedSeasonId }
  );

  // Create league state
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [leagueForm, setLeagueForm] = useState({
    name: '',
    locationValue: '',
    description: '',
    maxMembers: 64,
    entryFee: '',
    raceType: 'quarter' as 'eighth' | 'quarter',
  });

  // Mutations
  const createCalloutMut = trpc.drag.createCallout.useMutation({
    onSuccess: () => {
      calloutsQuery.refetch();
      setShowCreateCallout(false);
      setCalloutForm({ title: '', locationType: 'state', locationValue: '', locationState: '', vehicleClass: 'open', description: '' });
      toast.success('Callout posted! Time to defend your turf.');
    },
  });
  const createLeagueMut = trpc.drag.createLeague.useMutation({
    onSuccess: () => {
      leaguesQuery.refetch();
      setShowCreateLeague(false);
      toast.success('League created! Share it with your crew.');
    },
  });

  const tabs: { id: DragTab; label: string; icon: any }[] = [
    { id: 'leaderboard', label: 'LEADERBOARD', icon: Trophy },
    { id: 'callouts', label: 'CALLOUTS', icon: Swords },
    { id: 'leagues', label: 'LEAGUES', icon: Crown },
    { id: 'timeslips', label: 'MY RUNS', icon: Timer },
    { id: 'profile', label: 'PROFILE', icon: Star },
  ];

  const shareToFacebook = (text: string) => {
    const url = encodeURIComponent(window.location.href);
    const quote = encodeURIComponent(text);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`, '_blank', 'width=600,height=400');
  };

  if (authLoading) {
    return (
      <div className={embedded ? '' : 'min-h-screen'} style={{ background: sColor.bg }}>
        {!embedded && <PpeiHeader />}
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: sColor.red }} />
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={{ background: sColor.bg }}>
      {!embedded && <PpeiHeader />}

      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, oklch(0.12 0.02 25) 0%, oklch(0.28 0.004 260) 100%)',
        borderBottom: `1px solid ${sColor.border}`,
        padding: '2rem 0',
      }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Flag className="h-8 w-8" style={{ color: sColor.red }} />
                <h1 style={{ fontFamily: sFont.heading, fontSize: '2.2rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                  V-OP DRAG RACING
                </h1>
              </div>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '500px' }}>
                Regional callouts. User-created leagues. Bragging rights that matter.
                Prove you're the fastest in your state, zip code, or the whole damn country.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => { setActiveTab('callouts'); setShowCreateCallout(true); }} className="ppei-btn-red" style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}>
                <Swords className="h-4 w-4 mr-2" /> POST CALLOUT
              </Button>
              <Button onClick={() => { setActiveTab('leagues'); setShowCreateLeague(true); }}
                style={{ fontFamily: sFont.heading, letterSpacing: '0.08em', background: 'oklch(0.16 0.008 260)', border: `1px solid ${sColor.border}`, color: 'white' }}>
                <Crown className="h-4 w-4 mr-2" /> CREATE LEAGUE
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ background: 'oklch(0.08 0.004 260)', borderBottom: `1px solid ${sColor.border}` }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-2">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="ppei-btn-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: isActive ? 'oklch(0.18 0.02 25)' : 'transparent',
                    border: isActive ? `1px solid ${sColor.red}` : '1px solid transparent',
                    color: isActive ? sColor.red : sColor.textDim,
                    padding: '6px 14px', borderRadius: '2px',
                    fontFamily: sFont.heading, fontSize: '0.72rem', letterSpacing: '0.08em',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
        {/* Module Summary Banner */}
        <div style={{
          background: 'oklch(0.12 0.008 260)',
          border: `1px solid ${sColor.border}`,
          borderLeft: `4px solid ${sColor.red}`,
          borderRadius: '3px',
          padding: '20px 24px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'white', margin: '0 0 8px 0' }}>
            ABOUT V-OP DRAG RACING
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.92rem', color: sColor.textDim, lineHeight: 1.7, margin: 0 }}>
            V-OP Drag Racing turns your datalog into a virtual drag strip. Upload a pull and we'll calculate your 1/8 and 1/4 mile times, generate a timeslip, and rank you against other trucks in your area. Our goal is to build a competitive community where you can post callouts, create leagues, and earn regional champion badges — all backed by real data, not just talk. Whether you're chasing a personal best or calling out the fastest truck in your zip code, this is where it happens.
          </p>
        </div>

        {/* ── LEADERBOARD ── */}
        {activeTab === 'leaderboard' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Trophy className="h-6 w-6" style={{ color: sColor.gold }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>
                GLOBAL LEADERBOARD
              </h2>
            </div>
            {leaderboardQuery.data && leaderboardQuery.data.length > 0 ? (
              <div className="grid gap-2">
                {leaderboardQuery.data.map((entry, idx) => (
                  <Card key={entry.id} className="ppei-card ppei-card-hover p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center gap-4">
                      <div style={{
                        width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: idx === 0 ? 'oklch(0.30 0.12 80)' : idx === 1 ? 'oklch(0.45 0.04 260)' : idx === 2 ? 'oklch(0.45 0.08 50)' : 'oklch(0.36 0.006 260)',
                        borderRadius: '2px',
                        fontFamily: sFont.heading, fontSize: '1.3rem',
                        color: idx === 0 ? sColor.gold : idx === 1 ? 'oklch(0.80 0.005 260)' : idx === 2 ? 'oklch(0.70 0.12 50)' : sColor.textDim,
                      }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white' }}>
                            Profile #{entry.profileId}
                          </span>
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, padding: '1px 6px', background: 'oklch(0.16 0.006 260)', borderRadius: '2px' }}>
                            {entry.category}
                          </span>
                        </div>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                          {entry.vehicleClass || 'Open Class'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span style={{ fontFamily: sFont.heading, fontSize: '1.6rem', color: sColor.red }}>
                          {entry.bestValue ? `${Number(entry.bestValue).toFixed(3)}` : '—'}
                        </span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, display: 'block' }}>
                          {entry.season || 'All-Time'}
                        </span>
                      </div>
                      <ShareCard
                        data={buildTimeslipShareData(
                          entry.bestValue ? Number(entry.bestValue).toFixed(3) : '—',
                          '—',
                          '—',
                          entry.vehicleClass || undefined,
                          undefined,
                          entry.season || undefined
                        )}
                        compact
                      />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Trophy className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO TIMES POSTED YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Be the first to claim the throne. Upload a timeslip and own the leaderboard.
                </p>
              </Card>
            )}

            {/* Regional Champions */}
            {regionalChampionsQuery.data && regionalChampionsQuery.data.length > 0 && (
              <div className="mt-8">
                <div className="ppei-section-header mb-4">
                  <MapPin className="h-5 w-5" style={{ color: sColor.amber }} />
                  <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', margin: 0 }}>FASTEST IN YOUR AREA</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {regionalChampionsQuery.data.map((champ, idx) => (
                    <Card key={idx} className="ppei-card ppei-card-hover p-4" style={{
                      background: sColor.cardBg,
                      border: `1px solid ${sColor.border}`,
                      borderLeft: `4px solid ${sColor.amber}`,
                    }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="h-3.5 w-3.5" style={{ color: sColor.amber }} />
                            <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.amber, letterSpacing: '0.06em' }}>
                              FASTEST IN {(champ.trackLocation || 'UNKNOWN').toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white' }}>
                            {champ.displayName || `Profile #${champ.profileId}`}
                          </span>
                          {champ.vehicleDesc && (
                            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, display: 'block', marginTop: '2px' }}>
                              {champ.vehicleDesc}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span style={{ fontFamily: sFont.heading, fontSize: '1.4rem', color: sColor.red }}>
                            {champ.bestEt ? `${Number(champ.bestEt).toFixed(3)}s` : '—'}
                          </span>
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, display: 'block' }}>
                            {champ.bestMph ? `${Number(champ.bestMph).toFixed(1)} MPH` : ''}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CALLOUTS ── */}
        {activeTab === 'callouts' && (
          <div className="ppei-anim-fade-up">
            <div className="flex items-center justify-between mb-6">
              <div className="ppei-section-header" style={{ marginBottom: 0 }}>
                <Swords className="h-6 w-6" style={{ color: sColor.red }} />
                <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>REGIONAL CALLOUTS</h2>
              </div>
              {isAuthenticated && (
                <Button onClick={() => setShowCreateCallout(!showCreateCallout)} className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                  <Plus className="h-4 w-4 mr-1" /> NEW CALLOUT
                </Button>
              )}
            </div>

            {/* Create Callout Form */}
            {showCreateCallout && (
              <Card className="ppei-card p-6 mb-6 ppei-anim-scale-in" style={{ background: sColor.cardBg, border: `1px solid ${sColor.red}` }}>
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.red, marginBottom: '1rem' }}>
                  POST A CALLOUT — CLAIM YOUR TERRITORY
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>CALLOUT TITLE</label>
                    <Input value={calloutForm.title} onChange={e => setCalloutForm(f => ({ ...f, title: e.target.value }))}
                      placeholder='e.g., "Fastest L5P in Louisiana"'
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>LOCATION TYPE</label>
                    <select value={calloutForm.locationType} onChange={e => setCalloutForm(f => ({ ...f, locationType: e.target.value as any }))}
                      className="w-full mt-1 p-2 rounded ppei-input-focus"
                      style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}>
                      <option value="state">State</option>
                      <option value="city">City</option>
                      <option value="zip">Zip Code</option>
                      <option value="county">County</option>
                      <option value="region">Region</option>
                      <option value="country">Country</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>LOCATION VALUE</label>
                    <Input value={calloutForm.locationValue} onChange={e => setCalloutForm(f => ({ ...f, locationValue: e.target.value }))}
                      placeholder="e.g., Louisiana, 70601, Houston"
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>VEHICLE CLASS</label>
                    <select value={calloutForm.vehicleClass} onChange={e => setCalloutForm(f => ({ ...f, vehicleClass: e.target.value }))}
                      className="w-full mt-1 p-2 rounded ppei-input-focus"
                      style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}>
                      <option value="open">Open (Any Vehicle)</option>
                      <option value="diesel_truck">Diesel Truck</option>
                      <option value="l5p">L5P Duramax</option>
                      <option value="lml">LML Duramax</option>
                      <option value="cummins">Cummins</option>
                      <option value="powerstroke">Powerstroke</option>
                      <option value="gas_truck">Gas Truck</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>TRASH TALK (optional)</label>
                    <textarea value={calloutForm.description} onChange={e => setCalloutForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Nobody in this zip code can touch my truck. Come prove me wrong."
                      rows={3}
                      className="w-full mt-1 p-2 rounded ppei-input-focus"
                      style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body, resize: 'vertical' }} />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button onClick={() => {
                    if (!myProfileQuery.data) { toast.error('Create a racer profile first'); return; }
                    createCalloutMut.mutate({
                      creatorId: myProfileQuery.data.id,
                      title: calloutForm.title,
                      locationType: calloutForm.locationType as any,
                      locationValue: calloutForm.locationValue,
                      locationState: calloutForm.locationState || undefined,
                      vehicleClass: calloutForm.vehicleClass,
                      description: calloutForm.description || undefined,
                      raceType: 'quarter',
                    });
                  }} disabled={!calloutForm.title.trim() || !calloutForm.locationValue.trim() || createCalloutMut.isPending}
                    className="ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                    {createCalloutMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Swords className="h-4 w-4 mr-2" />}
                    POST CALLOUT
                  </Button>
                  <Button onClick={() => setShowCreateCallout(false)} style={{ background: 'transparent', border: `1px solid ${sColor.border}`, color: sColor.textDim, fontFamily: sFont.heading }}>
                    CANCEL
                  </Button>
                </div>
              </Card>
            )}

            {/* Callout List */}
            {calloutsQuery.data && calloutsQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {calloutsQuery.data.map(c => (
                  <Card key={c.id} className="ppei-card ppei-card-hover p-5" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.red}` }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>{c.title}</span>
                          <span style={{
                            fontFamily: sFont.mono, fontSize: '0.6rem', padding: '1px 6px', borderRadius: '2px',
                            background: c.isActive ? 'oklch(0.25 0.08 145)' : 'oklch(0.25 0.04 260)',
                            color: c.isActive ? sColor.green : sColor.textDim,
                          }}>
                            {c.isActive ? 'ACTIVE' : 'CLOSED'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                            <MapPin className="h-3 w-3 inline mr-1" />{c.locationValue}{c.locationState ? ` / ${c.locationState}` : ''}
                          </span>
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.amber }}>
                            {c.vehicleClass?.toUpperCase().replace('_', ' ') || 'OPEN'}
                          </span>
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                            {c.challengeCount ?? 0} CHALLENGERS
                          </span>
                        </div>
                        {c.description && (
                          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, fontStyle: 'italic' }}>
                            "{c.description}"
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <ShareCard
                          data={buildCalloutShareData(
                            c.title,
                            c.locationValue || 'Unknown',
                            undefined,
                            undefined
                          )}
                          compact
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Swords className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO CALLOUTS YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Be the first to throw down a challenge. Post a callout and claim your territory.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ── LEAGUES ── */}
        {activeTab === 'leagues' && (
          <div className="ppei-anim-fade-up">
            <div className="flex items-center justify-between mb-6">
              <div className="ppei-section-header" style={{ marginBottom: 0 }}>
                <Crown className="h-6 w-6" style={{ color: sColor.gold }} />
                <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>USER-CREATED LEAGUES</h2>
              </div>
              {isAuthenticated && (
                <Button onClick={() => setShowCreateLeague(!showCreateLeague)} className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                  <Plus className="h-4 w-4 mr-1" /> CREATE LEAGUE
                </Button>
              )}
            </div>

            {/* Create League Form */}
            {showCreateLeague && (
              <Card className="ppei-card p-6 mb-6 ppei-anim-scale-in" style={{ background: sColor.cardBg, border: `1px solid ${sColor.gold}` }}>
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.gold, marginBottom: '1rem' }}>
                  CREATE A LEAGUE — BE THE COMMISSIONER
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>LEAGUE NAME</label>
                    <Input value={leagueForm.name} onChange={e => setLeagueForm(f => ({ ...f, name: e.target.value }))}
                      placeholder='e.g., "Gulf Coast Diesel Series 2026"'
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>LOCATION / REGION</label>
                    <Input value={leagueForm.locationValue} onChange={e => setLeagueForm(f => ({ ...f, locationValue: e.target.value }))}
                      placeholder="e.g., Gulf Coast, Louisiana"
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>MAX MEMBERS</label>
                    <Input type="number" value={leagueForm.maxMembers} onChange={e => setLeagueForm(f => ({ ...f, maxMembers: parseInt(e.target.value) || 64 }))}
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>RACE TYPE</label>
                    <select value={leagueForm.raceType} onChange={e => setLeagueForm(f => ({ ...f, raceType: e.target.value as 'eighth' | 'quarter' }))}
                      className="w-full mt-1 p-2 rounded ppei-input-focus"
                      style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}>
                      <option value="quarter">Quarter Mile</option>
                      <option value="eighth">Eighth Mile</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                      <Bitcoin className="h-3 w-3 inline mr-1" style={{ color: sColor.btcOrange }} />
                      ENTRY FEE (BTC, optional)
                    </label>
                    <Input value={leagueForm.entryFee} onChange={e => setLeagueForm(f => ({ ...f, entryFee: e.target.value }))}
                      placeholder="0.001"
                      className="mt-1 ppei-input-focus" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono }} />
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>DESCRIPTION</label>
                    <textarea value={leagueForm.description} onChange={e => setLeagueForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Describe your league rules, schedule, and what makes it special..."
                      rows={3}
                      className="w-full mt-1 p-2 rounded ppei-input-focus"
                      style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body, resize: 'vertical' }} />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button onClick={() => {
                    if (!myProfileQuery.data) { toast.error('Create a racer profile first'); return; }
                    createLeagueMut.mutate({
                      commissionerId: myProfileQuery.data.id,
                      name: leagueForm.name,
                      locationValue: leagueForm.locationValue || undefined,
                      description: leagueForm.description || undefined,
                      maxMembers: leagueForm.maxMembers,
                      entryFee: leagueForm.entryFee || '0',
                      raceType: leagueForm.raceType,
                    });
                  }} disabled={!leagueForm.name.trim() || createLeagueMut.isPending}
                    className="ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                    {createLeagueMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
                    CREATE LEAGUE
                  </Button>
                  <Button onClick={() => setShowCreateLeague(false)} style={{ background: 'transparent', border: `1px solid ${sColor.border}`, color: sColor.textDim, fontFamily: sFont.heading }}>
                    CANCEL
                  </Button>
                </div>
              </Card>
            )}

            {/* League List */}
            {leaguesQuery.data && leaguesQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {leaguesQuery.data.map(l => (
                  <Card key={l.id} className="ppei-card ppei-card-hover p-5" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.gold}` }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Crown className="h-4 w-4" style={{ color: sColor.gold }} />
                          <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>{l.name}</span>
                          <span style={{
                            fontFamily: sFont.mono, fontSize: '0.6rem', padding: '1px 6px', borderRadius: '2px',
                            background: l.status === 'setup' ? 'oklch(0.25 0.08 145)' : l.status === 'active' ? 'oklch(0.45 0.08 25)' : 'oklch(0.45 0.04 260)',
                            color: l.status === 'setup' ? sColor.green : l.status === 'active' ? sColor.red : sColor.textDim,
                          }}>
                            {l.status?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          {l.locationValue && <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}><MapPin className="h-3 w-3 inline mr-1" />{l.locationValue}</span>}
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.amber }}>
                            {l.raceType?.toUpperCase()}
                          </span>
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                            <Users className="h-3 w-3 inline mr-1" />{l.memberCount ?? 0}/{l.maxMembers}
                          </span>
                          {l.entryFee && Number(l.entryFee) > 0 && (
                            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.btcOrange }}>
                              <Bitcoin className="h-3 w-3 inline mr-1" />{l.entryFee} BTC
                            </span>
                          )}
                        </div>
                        {l.description && (
                          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim }}>{l.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isAuthenticated && l.status === 'setup' && (
                          <Button onClick={() => toast.info('League join coming soon')}
                            className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.7rem' }}>
                            JOIN
                          </Button>
                        )}
                        <ShareCard
                          data={buildLeagueShareData(
                            l.name,
                            0, // rank
                            0, // points
                            undefined,
                            undefined
                          )}
                          compact
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Crown className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO LEAGUES YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Create the first league and become the commissioner. Set the rules, build the bracket, run the series.
                </p>
              </Card>
            )}

            {/* Playoff Bracket Viewer */}
            <div className="mt-8">
              <div className="ppei-section-header mb-4">
                <Trophy className="h-5 w-5" style={{ color: sColor.gold }} />
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', margin: 0 }}>PLAYOFF BRACKET</h3>
              </div>
              {!selectedSeasonId ? (
                <Card className="ppei-card p-6 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                  <Trophy className="h-10 w-10 mx-auto mb-3" style={{ color: sColor.textDim }} />
                  <p style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white' }}>SELECT A LEAGUE SEASON</p>
                  <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, marginTop: '0.5rem' }}>
                    When a league enters playoff status, the bracket will appear here.
                    Seeding is based on regular-season standings.
                  </p>
                  <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, marginTop: '1rem' }}>
                    Feature coming soon — brackets auto-generate when a season enters playoffs.
                  </p>
                </Card>
              ) : bracketQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: sColor.red }} />
                </div>
              ) : bracketQuery.data?.bracket && bracketQuery.data.bracket.length > 0 ? (
                <div>
                  {bracketQuery.data.season && (
                    <div className="mb-4 flex items-center gap-3">
                      <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.amber }}>
                        {bracketQuery.data.season.name || `Season ${bracketQuery.data.season.seasonNumber}`}
                      </span>
                      <span style={{
                        fontFamily: sFont.mono, fontSize: '0.6rem', padding: '2px 8px', borderRadius: '2px',
                        background: bracketQuery.data.season.status === 'playoffs' ? 'oklch(0.45 0.08 25)' : 'oklch(0.40 0.04 260)',
                        color: bracketQuery.data.season.status === 'playoffs' ? sColor.red : sColor.textDim,
                      }}>
                        {bracketQuery.data.season.status?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="grid gap-3">
                    {bracketQuery.data.bracket.map((match, idx) => (
                      <Card key={idx} className="ppei-card p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, marginBottom: '8px' }}>
                          ROUND {match.round} — MATCH {match.matchIndex + 1}
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          {/* Seed 1 */}
                          <div className="ppei-card p-3" style={{
                            background: match.winnerId === match.seed1?.profileId ? 'oklch(0.18 0.04 145)' : 'oklch(0.32 0.005 260)',
                            border: `1px solid ${match.winnerId === match.seed1?.profileId ? sColor.green : sColor.border}`,
                            borderRadius: '2px',
                          }}>
                            <div className="flex items-center gap-2">
                              <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.amber }}>
                                #{match.seed1?.rank ?? '?'}
                              </span>
                              <div>
                                <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: 'white' }}>
                                  {match.seed1?.displayName || 'TBD'}
                                </span>
                                {match.seed1?.bestEt && (
                                  <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, display: 'block' }}>
                                    {Number(match.seed1.bestEt).toFixed(3)}s
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* VS */}
                          <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.red }}>VS</span>
                          {/* Seed 2 */}
                          <div className="ppei-card p-3" style={{
                            background: match.winnerId === match.seed2?.profileId ? 'oklch(0.18 0.04 145)' : 'oklch(0.32 0.005 260)',
                            border: `1px solid ${match.winnerId === match.seed2?.profileId ? sColor.green : sColor.border}`,
                            borderRadius: '2px',
                          }}>
                            <div className="flex items-center gap-2 justify-end">
                              <div className="text-right">
                                <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: 'white' }}>
                                  {match.seed2?.displayName || 'TBD'}
                                </span>
                                {match.seed2?.bestEt && (
                                  <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, display: 'block' }}>
                                    {Number(match.seed2.bestEt).toFixed(3)}s
                                  </span>
                                )}
                              </div>
                              <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.amber }}>
                                #{match.seed2?.rank ?? '?'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="ppei-card p-6 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                  <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>No bracket data available for this season.</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── MY RUNS / TIMESLIPS ── */}
        {activeTab === 'timeslips' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Timer className="h-6 w-6" style={{ color: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>MY TIMESLIPS</h2>
            </div>
            {!myProfileQuery.data ? (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Star className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>CREATE A RACER PROFILE FIRST</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Go to the Profile tab to set up your racer identity.
                </p>
                <Button onClick={() => setActiveTab('profile')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                  <Plus className="h-4 w-4 mr-2" /> GO TO PROFILE
                </Button>
              </Card>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Timer className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO RUNS YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Upload a timeslip from the analyzer or log a run manually. 3 free runs to get started.
                </p>
                <Button onClick={() => toast.info('Run logging coming soon')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                  <Plus className="h-4 w-4 mr-2" /> LOG A RUN
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* ── PROFILE ── */}
        {activeTab === 'profile' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Star className="h-6 w-6" style={{ color: sColor.gold }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>RACER PROFILE</h2>
            </div>
            {myProfileQuery.data ? (
              <Card className="ppei-card p-6" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <div className="flex items-center gap-6 mb-6">
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '4px',
                    background: 'oklch(0.18 0.02 25)', border: `2px solid ${sColor.red}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Flag className="h-8 w-8" style={{ color: sColor.red }} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: sFont.heading, fontSize: '1.6rem', color: 'white', margin: 0 }}>
                      {myProfileQuery.data.displayName || user?.name || 'Racer'}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.amber }}>
                        {myProfileQuery.data.vehicleDesc || 'No vehicle set'}
                      </span>
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                        ELO: {myProfileQuery.data.elo}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'BEST ET', value: myProfileQuery.data.bestEt ? `${Number(myProfileQuery.data.bestEt).toFixed(3)}s` : '—', color: sColor.red },
                    { label: 'BEST MPH', value: myProfileQuery.data.bestMph ? `${Number(myProfileQuery.data.bestMph).toFixed(1)}` : '—', color: sColor.green },
                    { label: 'TOTAL RUNS', value: myProfileQuery.data.totalRuns ?? 0, color: sColor.blue },
                    { label: 'WINS', value: myProfileQuery.data.wins ?? 0, color: sColor.gold },
                  ].map(s => (
                    <div key={s.label} className="ppei-stat" style={{ borderTopColor: s.color as string }}>
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.05em' }}>{s.label}</span>
                      <span style={{ fontFamily: sFont.heading, fontSize: '1.8rem', color: 'white', display: 'block' }}>{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* Regional Champion Badges */}
                {profileBadgesQuery.data && profileBadgesQuery.data.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Award className="h-4 w-4" style={{ color: sColor.gold }} />
                      <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.gold, letterSpacing: '0.06em' }}>BADGES & TITLES</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profileBadgesQuery.data.map((badge, i) => (
                        <div key={i} className="ppei-anim-scale-in" style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: '2px',
                          background: badge.type === 'league_champion'
                            ? 'linear-gradient(135deg, oklch(0.40 0.08 80), oklch(0.35 0.04 80))'
                            : 'linear-gradient(135deg, oklch(0.40 0.06 25), oklch(0.34 0.03 25))',
                          border: `1px solid ${badge.type === 'league_champion' ? sColor.gold : sColor.red}`,
                        }}>
                          {badge.type === 'league_champion'
                            ? <Crown className="h-3.5 w-3.5" style={{ color: sColor.gold }} />
                            : <Zap className="h-3.5 w-3.5" style={{ color: sColor.red }} />
                          }
                          <span style={{
                            fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.08em',
                            color: badge.type === 'league_champion' ? sColor.gold : sColor.red,
                          }}>
                            {badge.label}
                          </span>
                          {badge.value && (
                            <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>
                              {badge.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Star className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>CREATE YOUR RACER PROFILE</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Set up your profile to start racing, post callouts, and join leagues.
                </p>
                <Button onClick={() => toast.info('Profile setup coming soon')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                  <Plus className="h-4 w-4 mr-2" /> CREATE PROFILE
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Pricing Banner */}
        <div className="mt-12 mb-6">
          <Card className="ppei-card p-6" style={{
            background: 'linear-gradient(135deg, oklch(0.12 0.02 25) 0%, oklch(0.30 0.005 260) 50%, oklch(0.32 0.02 55) 100%)',
            border: `1px solid ${sColor.border}`,
          }}>
            <div className="text-center mb-6">
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>V-OP DRAG RACING PLANS</h3>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>3 free runs to get started. Then pick your lane.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Free */}
              <div className="ppei-card p-5 text-center" style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}` }}>
                <span style={{ fontFamily: sFont.heading, fontSize: '1.8rem', color: 'white' }}>FREE</span>
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, marginTop: '0.5rem' }}>3 runs to test drive</p>
                <ul style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, textAlign: 'left', marginTop: '1rem', listStyle: 'none', padding: 0 }}>
                  <li style={{ padding: '4px 0' }}>&#10003; 3 timeslip uploads</li>
                  <li style={{ padding: '4px 0' }}>&#10003; View leaderboards</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Browse callouts</li>
                </ul>
              </div>
              {/* $20/mo */}
              <div className="ppei-card p-5 text-center" style={{ background: 'oklch(0.13 0.01 25)', border: `2px solid ${sColor.red}` }}>
                <span style={{ fontFamily: sFont.heading, fontSize: '1.8rem', color: sColor.red }}>$20<span style={{ fontSize: '0.8rem', color: sColor.textDim }}>/MO</span></span>
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'white', marginTop: '0.5rem' }}>Bragging Rights</p>
                <ul style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, textAlign: 'left', marginTop: '1rem', listStyle: 'none', padding: 0 }}>
                  <li style={{ padding: '4px 0' }}>&#10003; Unlimited runs</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Post & answer callouts</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Create & join leagues</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Facebook sharing</li>
                  <li style={{ padding: '4px 0' }}>&#10003; AI race reports</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Regional rankings</li>
                </ul>
              </div>
              {/* $200/mo */}
              <div className="ppei-card p-5 text-center" style={{ background: 'oklch(0.12 0.02 55)', border: `2px solid ${sColor.btcOrange}` }}>
                <span style={{ fontFamily: sFont.heading, fontSize: '1.8rem', color: sColor.btcOrange }}>$200<span style={{ fontSize: '0.8rem', color: sColor.textDim }}>/MO</span></span>
                <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'white', marginTop: '0.5rem' }}>
                  <Bitcoin className="h-4 w-4 inline mr-1" />BTC Wagering
                </p>
                <ul style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, textAlign: 'left', marginTop: '1rem', listStyle: 'none', padding: 0 }}>
                  <li style={{ padding: '4px 0' }}>&#10003; Everything in $20 plan</li>
                  <li style={{ padding: '4px 0' }}>&#10003; BTC challenge wagers</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Tournament prize pools</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Smart contract escrow</li>
                  <li style={{ padding: '4px 0' }}>&#10003; 1% rake on winnings</li>
                  <li style={{ padding: '4px 0' }}>&#10003; Lightning Network</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
