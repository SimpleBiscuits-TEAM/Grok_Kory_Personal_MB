/**
 * V-OP Fleet Management — Powered by Goose AI
 * Multi-industry fleet intelligence: diesel trucks, agriculture, powersports, golf carts
 * Features: Vehicle management, driver scoring, alerts, remote diagnostics, Goose AI chat
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import PpeiHeader from '@/components/PpeiHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Truck, Users, AlertTriangle, Activity, Plus, MessageSquare, Send, Bot, Fuel, Wrench, Shield, ChevronRight, ArrowLeft, Share2 } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { toast } from 'sonner';
import { ShareCard, QuickShareButton, buildFleetShareData } from '@/components/ShareCard';

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
};

type FleetTab = 'dashboard' | 'vehicles' | 'drivers' | 'alerts' | 'goose' | 'fuel';

interface GooseMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function Fleet() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<FleetTab>('dashboard');
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  // Goose AI state
  const [gooseMessages, setGooseMessages] = useState<GooseMessage[]>([]);
  const [gooseInput, setGooseInput] = useState('');
  const gooseEndRef = useRef<HTMLDivElement>(null);

  // Create org state
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState<string>('diesel_trucks');

  // Queries
  const orgsQuery = trpc.fleet.getMyOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const dashQuery = trpc.fleet.getDashboardStats.useQuery(
    { orgId: selectedOrgId! },
    { enabled: !!selectedOrgId }
  );
  const vehiclesQuery = trpc.fleet.getVehicles.useQuery(
    { orgId: selectedOrgId! },
    { enabled: !!selectedOrgId && activeTab === 'vehicles' }
  );
  const membersQuery = trpc.fleet.getMembers.useQuery(
    { orgId: selectedOrgId! },
    { enabled: !!selectedOrgId && activeTab === 'drivers' }
  );
  const alertsQuery = trpc.fleet.getAlerts.useQuery(
    { orgId: selectedOrgId!, limit: 50 },
    { enabled: !!selectedOrgId && activeTab === 'alerts' }
  );
  const fuelQuery = trpc.fleet.getFuelLogs.useQuery(
    { orgId: selectedOrgId!, limit: 50 },
    { enabled: !!selectedOrgId && activeTab === 'fuel' }
  );

  // Mutations
  const createOrgMut = trpc.fleet.createOrg.useMutation({
    onSuccess: () => {
      orgsQuery.refetch();
      setShowCreateOrg(false);
      setNewOrgName('');
      toast.success('Fleet organization created');
    },
  });
  const gooseChatMut = trpc.fleet.gooseChat.useMutation();

  // Auto-select first org
  useEffect(() => {
    if (orgsQuery.data && orgsQuery.data.length > 0 && !selectedOrgId) {
      setSelectedOrgId(orgsQuery.data[0].id);
    }
  }, [orgsQuery.data, selectedOrgId]);

  // Scroll goose chat
  useEffect(() => {
    gooseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gooseMessages]);

  const sendGooseMessage = useCallback(async () => {
    if (!gooseInput.trim() || gooseChatMut.isPending) return;
    const userMsg: GooseMessage = { role: 'user', content: gooseInput.trim() };
    const newMessages = [...gooseMessages, userMsg];
    setGooseMessages(newMessages);
    setGooseInput('');
    try {
      const result = await gooseChatMut.mutateAsync({
        messages: newMessages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: String(m.content) })),
        orgId: selectedOrgId ?? undefined,
      });
      setGooseMessages(prev => [...prev, { role: 'assistant' as const, content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content) }]);
    } catch {
      setGooseMessages(prev => [...prev, { role: 'assistant' as const, content: 'Goose encountered an error. Please try again.' }]);
    }
  }, [gooseInput, gooseMessages, gooseChatMut, selectedOrgId]);

  if (authLoading) {
    return (
      <div className="min-h-screen" style={{ background: sColor.bg }}>
        <PpeiHeader />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: sColor.red }} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen" style={{ background: sColor.bg }}>
        <PpeiHeader />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
          <div className="ppei-section-header">
            <Shield className="h-8 w-8" style={{ color: sColor.red }} />
            <h2 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
              FLEET ACCESS REQUIRED
            </h2>
          </div>
          <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '400px', textAlign: 'center' }}>
            Sign in to access V-OP Fleet Management. Monitor your vehicles, track drivers, and get AI-powered fleet intelligence.
          </p>
          <Button onClick={() => window.location.href = getLoginUrl()} className="ppei-btn-red" style={{ fontFamily: sFont.heading, letterSpacing: '0.1em' }}>
            SIGN IN TO FLEET
          </Button>
        </div>
      </div>
    );
  }

  // No org yet — onboarding
  if (orgsQuery.data && orgsQuery.data.length === 0) {
    return (
      <div className="min-h-screen" style={{ background: sColor.bg }}>
        <PpeiHeader />
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto">
            <div className="ppei-section-header mb-6">
              <Truck className="h-8 w-8" style={{ color: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '2rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                CREATE YOUR FLEET
              </h2>
            </div>
            <Card className="ppei-card p-6" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginBottom: '1.5rem' }}>
                Set up your fleet organization to start monitoring vehicles, tracking drivers, and getting AI-powered insights from Goose.
              </p>
              <div className="space-y-4">
                <div>
                  <label style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim, letterSpacing: '0.05em' }}>FLEET NAME</label>
                  <Input
                    value={newOrgName}
                    onChange={e => setNewOrgName(e.target.value)}
                    placeholder="e.g., Willis Diesel Fleet"
                    className="mt-1 ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim, letterSpacing: '0.05em' }}>INDUSTRY</label>
                  <select
                    value={newOrgIndustry}
                    onChange={e => setNewOrgIndustry(e.target.value)}
                    className="w-full mt-1 p-2 rounded ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}
                  >
                    <option value="diesel_trucks">Diesel Trucks</option>
                    <option value="agriculture">Agriculture</option>
                    <option value="powersports">Powersports</option>
                    <option value="golf_carts">Golf Carts</option>
                    <option value="heavy_equipment">Heavy Equipment</option>
                    <option value="construction">Construction</option>
                    <option value="rental">Rental Fleet</option>
                    <option value="mixed">Mixed Fleet</option>
                  </select>
                </div>
                <Button
                  onClick={() => createOrgMut.mutate({ name: newOrgName, industry: newOrgIndustry as any })}
                  disabled={!newOrgName.trim() || createOrgMut.isPending}
                  className="w-full ppei-btn-red"
                  style={{ fontFamily: sFont.heading, letterSpacing: '0.1em' }}
                >
                  {createOrgMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  CREATE FLEET
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: FleetTab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: Activity },
    { id: 'vehicles', label: 'VEHICLES', icon: Truck },
    { id: 'drivers', label: 'DRIVERS', icon: Users },
    { id: 'alerts', label: 'ALERTS', icon: AlertTriangle },
    { id: 'fuel', label: 'FUEL', icon: Fuel },
    { id: 'goose', label: 'GOOSE AI', icon: Bot },
  ];

  return (
    <div className="min-h-screen" style={{ background: sColor.bg }}>
      <PpeiHeader />

      {/* Fleet Sub-nav */}
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isActive ? 'oklch(0.18 0.02 25)' : 'transparent',
                    border: isActive ? `1px solid ${sColor.red}` : '1px solid transparent',
                    color: isActive ? sColor.red : sColor.textDim,
                    padding: '6px 14px',
                    borderRadius: '2px',
                    fontFamily: sFont.heading,
                    fontSize: '0.72rem',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
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
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Activity className="h-6 w-6" style={{ color: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>FLEET OVERVIEW</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'VEHICLES', value: dashQuery.data?.vehicles ?? 0, icon: Truck, color: sColor.blue },
                { label: 'DRIVERS', value: dashQuery.data?.drivers ?? 0, icon: Users, color: sColor.green },
                { label: 'ACTIVE ALERTS', value: dashQuery.data?.activeAlerts ?? 0, icon: AlertTriangle, color: sColor.amber },
                { label: 'TRIPS TODAY', value: dashQuery.data?.tripsToday ?? 0, icon: Activity, color: sColor.red },
              ].map(stat => (
                <div key={stat.label} className="ppei-stat ppei-card-hover" style={{ borderTopColor: stat.color }}>
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.05em' }}>{stat.label}</span>
                  </div>
                  <span style={{ fontFamily: sFont.heading, fontSize: '2rem', color: 'white' }}>{stat.value}</span>
                </div>
              ))}
            </div>
            {/* Share Fleet Stats */}
            <div className="flex justify-end mb-4">
              <ShareCard
                data={buildFleetShareData(
                  dashQuery.data?.vehicles ?? 0,
                  0, // avg MPG — populated when fuel logs exist
                  0, // total miles — populated when trips exist
                  orgsQuery.data?.find(o => o.id === selectedOrgId)?.name,
                )}
                trigger={
                  <Button variant="outline" size="sm" style={{ fontFamily: sFont.heading, fontSize: '0.72rem', letterSpacing: '0.06em', color: sColor.textDim, borderColor: sColor.border }}>
                    <Share2 className="h-3.5 w-3.5 mr-1.5" /> SHARE FLEET STATS
                  </Button>
                }
              />
            </div>

            <Card className="ppei-card p-6" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
              <div className="flex items-center gap-3 mb-4">
                <Bot className="h-5 w-5" style={{ color: sColor.green }} />
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', margin: 0 }}>GOOSE AI INSIGHTS</h3>
              </div>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>
                Add vehicles and log trips to start receiving AI-powered fleet intelligence from Goose.
                Goose monitors fuel efficiency, driver behavior, maintenance schedules, and predicts failures before they happen.
              </p>
              <Button onClick={() => setActiveTab('goose')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}>
                <MessageSquare className="h-4 w-4 mr-2" />
                TALK TO GOOSE
              </Button>
            </Card>
          </div>
        )}

        {/* Vehicles */}
        {activeTab === 'vehicles' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Truck className="h-6 w-6" style={{ color: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>FLEET VEHICLES</h2>
            </div>
            {vehiclesQuery.data && vehiclesQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {vehiclesQuery.data.map(v => (
                  <Card key={v.id} className="ppei-card ppei-card-hover p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white' }}>
                          {v.year} {v.make} {v.model}
                        </span>
                        {v.vin && (
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, marginLeft: '12px' }}>
                            VIN: {v.vin}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontFamily: sFont.mono,
                        fontSize: '0.65rem',
                        padding: '2px 8px',
                        borderRadius: '2px',
                        background: v.status === 'active' ? 'oklch(0.25 0.08 145)' : 'oklch(0.25 0.08 60)',
                        color: v.status === 'active' ? sColor.green : sColor.amber,
                        letterSpacing: '0.05em',
                      }}>
                        {v.status?.toUpperCase()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Truck className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO VEHICLES YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Connect a V-OP adapter to auto-populate, or add vehicles manually.
                </p>
                <Button onClick={() => toast.info('Vehicle add form coming soon')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                  <Plus className="h-4 w-4 mr-2" /> ADD VEHICLE
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Drivers */}
        {activeTab === 'drivers' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Users className="h-6 w-6" style={{ color: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>FLEET DRIVERS</h2>
            </div>
            {membersQuery.data && membersQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {membersQuery.data.map(m => (
                  <Card key={m.id} className="ppei-card ppei-card-hover p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white' }}>{m.name}</span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, marginLeft: '12px' }}>
                          {m.role?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>SCORE</span>
                        <span style={{
                          fontFamily: sFont.heading,
                          fontSize: '1.4rem',
                          color: (m.driverScore ?? 0) >= 80 ? sColor.green : (m.driverScore ?? 0) >= 60 ? sColor.amber : sColor.red,
                        }}>
                          {m.driverScore ?? 100}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Users className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO DRIVERS YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Add drivers to track behavior, scoring, and assign vehicles.
                </p>
                <Button onClick={() => toast.info('Driver add form coming soon')} className="mt-4 ppei-btn-red" style={{ fontFamily: sFont.heading }}>
                  <Plus className="h-4 w-4 mr-2" /> ADD DRIVER
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Alerts */}
        {activeTab === 'alerts' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <AlertTriangle className="h-6 w-6" style={{ color: sColor.amber }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>FLEET ALERTS</h2>
            </div>
            {alertsQuery.data && alertsQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {alertsQuery.data.map(a => (
                  <Card key={a.id} className={`ppei-card p-4 ${a.severity === 'critical' ? 'ppei-fault-critical' : a.severity === 'warning' ? 'ppei-fault-warning' : 'ppei-fault-info'}`}
                    style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white' }}>{a.title}</span>
                        {a.message && <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, marginTop: '4px' }}>{a.message}</p>}
                      </div>
                      <span style={{
                        fontFamily: sFont.mono,
                        fontSize: '0.6rem',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        background: a.severity === 'critical' ? 'oklch(0.25 0.08 25)' : 'oklch(0.25 0.08 60)',
                        color: a.severity === 'critical' ? sColor.red : sColor.amber,
                      }}>
                        {a.severity?.toUpperCase()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.green }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.green }}>ALL CLEAR</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  No active alerts. Your fleet is running clean.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Fuel */}
        {activeTab === 'fuel' && (
          <div className="ppei-anim-fade-up">
            <div className="ppei-section-header mb-6">
              <Fuel className="h-6 w-6" style={{ color: sColor.amber }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>FUEL LOGS</h2>
            </div>
            {fuelQuery.data && fuelQuery.data.length > 0 ? (
              <div className="grid gap-3">
                {fuelQuery.data.map(f => (
                  <Card key={f.id} className="ppei-card ppei-card-hover p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span style={{ fontFamily: sFont.heading, color: 'white' }}>{f.gallons} GAL</span>
                        {f.station && <span style={{ fontFamily: sFont.body, color: sColor.textDim, marginLeft: '12px' }}>{f.station}</span>}
                      </div>
                      {f.totalCost && <span style={{ fontFamily: sFont.mono, color: sColor.green }}>${f.totalCost}</span>}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Fuel className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO FUEL LOGS</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Start logging fuel to track efficiency across your fleet.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Goose AI Chat */}
        {activeTab === 'goose' && (
          <div className="ppei-anim-fade-up" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="ppei-section-header mb-6">
              <Bot className="h-6 w-6" style={{ color: sColor.green }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', color: 'white', margin: 0 }}>GOOSE AI — FLEET INTELLIGENCE</h2>
            </div>
            <Card className="ppei-card" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, height: '60vh', display: 'flex', flexDirection: 'column' }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {gooseMessages.length === 0 && (
                  <div className="text-center py-12">
                    <Bot className="h-16 w-16 mx-auto mb-4" style={{ color: sColor.green, opacity: 0.5 }} />
                    <p style={{ fontFamily: sFont.heading, fontSize: '1.3rem', color: 'white' }}>HONK HONK</p>
                    <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '400px', margin: '0.5rem auto 0' }}>
                      I'm Goose, your fleet AI. Ask me about vehicle health, driver coaching, fuel efficiency, maintenance scheduling, or anything fleet-related.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                      {[
                        'What maintenance should I prioritize?',
                        'How can I improve fleet fuel efficiency?',
                        'Analyze my driver scores',
                        'What DTCs should I worry about?',
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => { setGooseInput(q); }}
                          className="ppei-btn-hover"
                          style={{
                            background: 'oklch(0.15 0.006 260)',
                            border: `1px solid ${sColor.border}`,
                            color: sColor.textDim,
                            padding: '6px 12px',
                            borderRadius: '2px',
                            fontFamily: sFont.body,
                            fontSize: '0.8rem',
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {gooseMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: '4px',
                      background: msg.role === 'user' ? 'oklch(0.20 0.04 25)' : 'oklch(0.16 0.006 260)',
                      border: `1px solid ${msg.role === 'user' ? 'oklch(0.35 0.08 25)' : sColor.border}`,
                    }}>
                      {msg.role === 'assistant' ? (
                        <div style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'oklch(0.90 0.005 260)' }}>
                          <Streamdown>{String(msg.content)}</Streamdown>
                        </div>
                      ) : (
                        <p style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'white', margin: 0 }}>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {gooseChatMut.isPending && (
                  <div className="flex justify-start">
                    <div style={{ padding: '10px 14px', background: 'oklch(0.16 0.006 260)', border: `1px solid ${sColor.border}`, borderRadius: '4px' }}>
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: sColor.green }} />
                    </div>
                  </div>
                )}
                <div ref={gooseEndRef} />
              </div>
              {/* Input */}
              <div style={{ borderTop: `1px solid ${sColor.border}`, padding: '12px' }}>
                <div className="flex gap-2">
                  <Input
                    value={gooseInput}
                    onChange={e => setGooseInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendGooseMessage()}
                    placeholder="Ask Goose about your fleet..."
                    className="ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }}
                  />
                  <Button
                    onClick={sendGooseMessage}
                    disabled={!gooseInput.trim() || gooseChatMut.isPending}
                    className="ppei-btn-red"
                    style={{ fontFamily: sFont.heading }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
