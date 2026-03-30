/**
 * V-OP Community Forum — Diesel Culture Hub
 * Categories: Drag Racing, Fleet Management, Tuning, General
 * Features: Channels, threads, posts, likes, memberships
 * Integrated with drag racing callouts and fleet discussions
 */
import { useState, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';
import PpeiHeader from '@/components/PpeiHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Loader2, MessageSquare, Hash, Users, Heart, ArrowLeft,
  Plus, ChevronRight, Shield, Send, Flame, Wrench, Flag,
  Truck, Zap, BookOpen, Share2
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareCard, QuickShareButton, buildCommunityShareData } from '@/components/ShareCard';

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

type ForumView = 'categories' | 'channels' | 'threads' | 'thread';

// Default categories for the forum
const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Drag Racing', description: 'Race talk, callouts, timeslips, and trash talk', icon: Flag, color: sColor.red },
  { id: 2, name: 'Fleet Management', description: 'Fleet ops, driver coaching, Goose AI tips', icon: Truck, color: sColor.blue },
  { id: 3, name: 'Tuning & Performance', description: 'ECU tuning, datalog analysis, mods', icon: Zap, color: sColor.amber },
  { id: 4, name: 'General Discussion', description: 'Off-topic, builds, events, meetups', icon: MessageSquare, color: sColor.green },
];

export default function Community() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [view, setView] = useState<ForumView>('categories');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [selectedChannelName, setSelectedChannelName] = useState('');
  const [selectedThreadTitle, setSelectedThreadTitle] = useState('');

  // Create channel state
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  // Create thread state
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadContent, setNewThreadContent] = useState('');

  // Reply state
  const [replyContent, setReplyContent] = useState('');

  // Queries
  const categoriesQuery = trpc.community.getCategories.useQuery();
  const channelsQuery = trpc.community.getChannels.useQuery(
    { categoryId: selectedCategoryId! },
    { enabled: view === 'channels' && !!selectedCategoryId }
  );
  const threadsQuery = trpc.community.getThreads.useQuery(
    { channelId: selectedChannelId! },
    { enabled: view === 'threads' && !!selectedChannelId }
  );
  const postsQuery = trpc.community.getPosts.useQuery(
    { threadId: selectedThreadId! },
    { enabled: view === 'thread' && !!selectedThreadId }
  );
  const statsQuery = trpc.community.getStats.useQuery();

  // Mutations
  const createChannelMut = trpc.community.createChannel.useMutation({
    onSuccess: () => {
      channelsQuery.refetch();
      setShowCreateChannel(false);
      setNewChannelName('');
      setNewChannelDesc('');
      toast.success('Channel created');
    },
  });
  const createThreadMut = trpc.community.createThread.useMutation({
    onSuccess: (data) => {
      threadsQuery.refetch();
      setShowCreateThread(false);
      setNewThreadTitle('');
      setNewThreadContent('');
      toast.success('Thread posted');
    },
  });
  const createPostMut = trpc.community.createPost.useMutation({
    onSuccess: () => {
      postsQuery.refetch();
      setReplyContent('');
    },
  });
  const toggleLikeMut = trpc.community.toggleLike.useMutation({
    onSuccess: () => postsQuery.refetch(),
  });

  const navigateToCategory = (catId: number) => {
    setSelectedCategoryId(catId);
    setView('channels');
  };
  const navigateToChannel = (channelId: number, channelName: string) => {
    setSelectedChannelId(channelId);
    setSelectedChannelName(channelName);
    setView('threads');
  };
  const navigateToThread = (threadId: number, threadTitle: string) => {
    setSelectedThreadId(threadId);
    setSelectedThreadTitle(threadTitle);
    setView('thread');
  };
  const goBack = () => {
    if (view === 'thread') setView('threads');
    else if (view === 'threads') setView('channels');
    else if (view === 'channels') setView('categories');
  };

  // Use DB categories if available, otherwise defaults
  const categories = categoriesQuery.data && categoriesQuery.data.length > 0
    ? categoriesQuery.data.map((c, i) => ({ ...DEFAULT_CATEGORIES[i] || DEFAULT_CATEGORIES[0], ...c }))
    : DEFAULT_CATEGORIES;

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

  return (
    <div className="min-h-screen" style={{ background: sColor.bg }}>
      <PpeiHeader />

      {/* Community Header */}
      <div style={{
        background: 'linear-gradient(135deg, oklch(0.12 0.01 200) 0%, oklch(0.08 0.004 260) 100%)',
        borderBottom: `1px solid ${sColor.border}`,
        padding: '1.5rem 0',
      }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {view !== 'categories' && (
                <button onClick={goBack} className="ppei-btn-hover" style={{
                  padding: '6px', borderRadius: '2px', background: 'oklch(0.16 0.006 260)', border: `1px solid ${sColor.border}`,
                }}>
                  <ArrowLeft className="h-4 w-4" style={{ color: sColor.textDim }} />
                </button>
              )}
              <MessageSquare className="h-7 w-7" style={{ color: sColor.green }} />
              <div>
                <h1 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.06em', color: 'white', margin: 0, lineHeight: 1 }}>
                  {view === 'categories' ? 'V-OP COMMUNITY' :
                   view === 'channels' ? categories.find(c => c.id === selectedCategoryId)?.name?.toUpperCase() || 'CHANNELS' :
                   view === 'threads' ? selectedChannelName.toUpperCase() :
                   selectedThreadTitle.toUpperCase()}
                </h1>
                {view === 'categories' && (
                  <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: 0 }}>
                    Diesel culture. Racing. Tuning. Fleet ops. Your people are here.
                  </p>
                )}
              </div>
            </div>
            {/* Stats */}
            {view === 'categories' && statsQuery.data && (
              <div className="hidden md:flex items-center gap-4">
                {[
                  { label: 'CHANNELS', value: statsQuery.data.channels },
                  { label: 'THREADS', value: statsQuery.data.threads },
                  { label: 'POSTS', value: statsQuery.data.posts },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', display: 'block' }}>{s.value}</span>
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6" style={{ maxWidth: '900px' }}>
        {/* ── CATEGORIES ── */}
        {view === 'categories' && (
          <div className="ppei-anim-fade-up grid gap-4">
            {categories.map(cat => {
              const Icon = cat.icon || MessageSquare;
              return (
                <Card key={cat.id} className="ppei-card ppei-card-hover cursor-pointer p-5"
                  onClick={() => navigateToCategory(cat.id)}
                  style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${cat.color || sColor.red}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '4px',
                        background: `${cat.color || sColor.red}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon className="h-5 w-5" style={{ color: cat.color || sColor.red }} />
                      </div>
                      <div>
                        <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>{cat.name}</span>
                        <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: 0 }}>
                          {cat.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5" style={{ color: sColor.textDim }} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── CHANNELS ── */}
        {view === 'channels' && (
          <div className="ppei-anim-fade-up">
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                {channelsQuery.data?.length ?? 0} CHANNELS
              </span>
              {isAuthenticated && (
                <Button onClick={() => setShowCreateChannel(!showCreateChannel)}
                  className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.7rem' }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> NEW CHANNEL
                </Button>
              )}
            </div>

            {showCreateChannel && (
              <Card className="ppei-card p-5 mb-4 ppei-anim-scale-in" style={{ background: sColor.cardBg, border: `1px solid ${sColor.red}` }}>
                <div className="space-y-3">
                  <Input value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                    placeholder="Channel name" className="ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  <Input value={newChannelDesc} onChange={e => setNewChannelDesc(e.target.value)}
                    placeholder="Description (optional)" className="ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  <div className="flex gap-2">
                    <Button onClick={() => createChannelMut.mutate({ categoryId: selectedCategoryId!, name: newChannelName, description: newChannelDesc || undefined })}
                      disabled={!newChannelName.trim() || createChannelMut.isPending}
                      className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                      CREATE
                    </Button>
                    <Button onClick={() => setShowCreateChannel(false)} style={{ background: 'transparent', border: `1px solid ${sColor.border}`, color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                      CANCEL
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {channelsQuery.data && channelsQuery.data.length > 0 ? (
              <div className="grid gap-2">
                {channelsQuery.data.map(ch => (
                  <Card key={ch.id} className="ppei-card ppei-card-hover cursor-pointer p-4"
                    onClick={() => navigateToChannel(ch.id, ch.name)}
                    style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Hash className="h-4 w-4" style={{ color: sColor.textDim }} />
                        <div>
                          <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white' }}>{ch.name}</span>
                          {ch.description && <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim, margin: 0 }}>{ch.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
                          {ch.postCount ?? 0} posts
                        </span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
                          <Users className="h-3 w-3 inline mr-1" />{ch.memberCount ?? 0}
                        </span>
                        <ChevronRight className="h-4 w-4" style={{ color: sColor.textDim }} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Hash className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO CHANNELS YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Be the first to create a channel in this category.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ── THREADS ── */}
        {view === 'threads' && (
          <div className="ppei-anim-fade-up">
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                {threadsQuery.data?.length ?? 0} THREADS
              </span>
              {isAuthenticated && (
                <Button onClick={() => setShowCreateThread(!showCreateThread)}
                  className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.7rem' }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> NEW THREAD
                </Button>
              )}
            </div>

            {showCreateThread && (
              <Card className="ppei-card p-5 mb-4 ppei-anim-scale-in" style={{ background: sColor.cardBg, border: `1px solid ${sColor.red}` }}>
                <div className="space-y-3">
                  <Input value={newThreadTitle} onChange={e => setNewThreadTitle(e.target.value)}
                    placeholder="Thread title" className="ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body }} />
                  <textarea value={newThreadContent} onChange={e => setNewThreadContent(e.target.value)}
                    placeholder="What's on your mind?" rows={4}
                    className="w-full p-2 rounded ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body, resize: 'vertical' }} />
                  <div className="flex gap-2">
                    <Button onClick={() => createThreadMut.mutate({ channelId: selectedChannelId!, title: newThreadTitle, content: newThreadContent })}
                      disabled={!newThreadTitle.trim() || !newThreadContent.trim() || createThreadMut.isPending}
                      className="ppei-btn-red" style={{ fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                      {createThreadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      POST THREAD
                    </Button>
                    <Button onClick={() => setShowCreateThread(false)} style={{ background: 'transparent', border: `1px solid ${sColor.border}`, color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.75rem' }}>
                      CANCEL
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {threadsQuery.data && threadsQuery.data.length > 0 ? (
              <div className="grid gap-2">
                {threadsQuery.data.map(t => (
                  <Card key={t.id} className="ppei-card ppei-card-hover cursor-pointer p-4"
                    onClick={() => navigateToThread(t.id, t.title)}
                    style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white' }}>{t.title}</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
                            {t.replyCount ?? 0} replies
                          </span>
                          {t.isPinned && <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.amber }}>PINNED</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4" style={{ color: sColor.textDim }} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-8 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <MessageSquare className="h-12 w-12 mx-auto mb-4" style={{ color: sColor.textDim }} />
                <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white' }}>NO THREADS YET</p>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, marginTop: '0.5rem' }}>
                  Start the conversation. Post the first thread.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ── THREAD VIEW (Posts) ── */}
        {view === 'thread' && (
          <div className="ppei-anim-fade-up">
            {postsQuery.data && postsQuery.data.length > 0 ? (
              <div className="grid gap-3 mb-6">
                {postsQuery.data.map((p, idx) => (
                  <Card key={p.id} className="ppei-card p-4" style={{
                    background: idx === 0 ? 'oklch(0.14 0.008 260)' : sColor.cardBg,
                    border: `1px solid ${idx === 0 ? 'oklch(0.30 0.010 260)' : sColor.border}`,
                    borderLeft: idx === 0 ? `4px solid ${sColor.red}` : undefined,
                  }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '4px',
                          background: 'oklch(0.20 0.02 25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: sFont.heading, fontSize: '0.7rem', color: sColor.red,
                        }}>
                          {idx === 0 ? 'OP' : `#${idx}`}
                        </div>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                          {p.authorId ? `User ${p.authorId}` : 'Anonymous'}
                        </span>
                      </div>
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>
                        {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                      </span>
                    </div>
                    <p style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: 'oklch(0.90 0.005 260)', whiteSpace: 'pre-wrap' }}>
                      {p.content}
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); toggleLikeMut.mutate({ postId: p.id }); }}
                        className="flex items-center gap-1 ppei-btn-hover"
                        style={{ padding: '2px 8px', borderRadius: '2px', background: 'oklch(0.16 0.006 260)', border: `1px solid ${sColor.border}` }}>
                        <Heart className="h-3 w-3" style={{ color: sColor.red }} />
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>{p.likeCount ?? 0}</span>
                      </button>
                      {idx === 0 && (
                        <QuickShareButton
                          data={buildCommunityShareData(
                            selectedThreadTitle,
                            categories.find(c => c.id === selectedCategoryId)?.name || 'General',
                            user?.name || undefined
                          )}
                          className="ppei-btn-hover"
                        />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="ppei-card p-6 mb-6 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: sColor.textDim }} />
              </Card>
            )}

            {/* Reply box */}
            {isAuthenticated ? (
              <Card className="ppei-card p-4" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <div className="flex gap-2">
                  <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    rows={2}
                    className="flex-1 p-2 rounded ppei-input-focus"
                    style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.body, resize: 'vertical' }} />
                  <Button onClick={() => createPostMut.mutate({ threadId: selectedThreadId!, content: replyContent })}
                    disabled={!replyContent.trim() || createPostMut.isPending}
                    className="ppei-btn-red self-end" style={{ fontFamily: sFont.heading }}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="ppei-card p-4 text-center" style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}` }}>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>
                  <a href={getLoginUrl()} style={{ color: sColor.red, textDecoration: 'underline' }}>Sign in</a> to reply
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
