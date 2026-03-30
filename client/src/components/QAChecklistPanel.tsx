/**
 * QA Test Checklist Panel
 * 
 * Admin panel for PPEI team to manage QA test checklists.
 * Features: create checklists, check off tests, add error comments, track progress.
 */

import { useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, SkipForward,
  Plus, MessageSquare, ChevronDown, ChevronUp, Send,
  Trash2, ClipboardList, BarChart3, Filter, Users, X
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  bgHover: 'oklch(0.36 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.60 0.20 300)',
  orange: 'oklch(0.70 0.18 55)',
};

type Status = 'pending' | 'pass' | 'fail' | 'blocked' | 'skipped';
type Priority = 'low' | 'medium' | 'high' | 'critical';

const statusConfig: Record<Status, { label: string; color: string; icon: typeof CheckCircle2; bg: string }> = {
  pass: { label: 'PASS', color: sColor.green, icon: CheckCircle2, bg: `oklch(0.65 0.20 145 / 0.15)` },
  fail: { label: 'FAIL', color: sColor.red, icon: XCircle, bg: `oklch(0.52 0.22 25 / 0.15)` },
  blocked: { label: 'BLOCKED', color: sColor.orange, icon: AlertTriangle, bg: `oklch(0.70 0.18 55 / 0.15)` },
  pending: { label: 'PENDING', color: sColor.textDim, icon: Clock, bg: `oklch(0.55 0.010 260 / 0.10)` },
  skipped: { label: 'SKIPPED', color: sColor.purple, icon: SkipForward, bg: `oklch(0.60 0.20 300 / 0.15)` },
};

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: sColor.red },
  high: { label: 'HIGH', color: sColor.orange },
  medium: { label: 'MED', color: sColor.yellow },
  low: { label: 'LOW', color: sColor.textDim },
};

// ── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ stats }: { stats: { total: number; pass: number; fail: number; blocked: number; skipped: number; pending: number } }) {
  const pct = (n: number) => stats.total > 0 ? (n / stats.total) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'oklch(0.16 0.008 260)' }}>
        <div style={{ width: `${pct(stats.pass)}%`, background: sColor.green, transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(stats.fail)}%`, background: sColor.red, transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(stats.blocked)}%`, background: sColor.orange, transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(stats.skipped)}%`, background: sColor.purple, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color }} />
            <span style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: cfg.color }}>
              {stats[key as keyof typeof stats]} {cfg.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Comment Thread ──────────────────────────────────────────────────────────

function CommentThread({ comments, itemId }: { comments: { id: string; userName: string; message: string; createdAt: number }[]; itemId: string }) {
  const [newComment, setNewComment] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const utils = trpc.useUtils();
  const addComment = trpc.qa.addComment.useMutation({
    onSuccess: () => {
      setNewComment('');
      utils.qa.getChecklist.invalidate();
    },
  });

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: sFont.mono, fontSize: '0.72rem', color: comments.length > 0 ? sColor.yellow : sColor.textMuted,
          padding: 0,
        }}
      >
        <MessageSquare style={{ width: 12, height: 12 }} />
        {comments.length} comment{comments.length !== 1 ? 's' : ''}
        {isOpen ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
      </button>

      {isOpen && (
        <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: `2px solid ${sColor.border}` }}>
          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: '8px', padding: '6px 10px', background: 'oklch(0.11 0.005 260)', borderRadius: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 600, color: sColor.blue }}>{c.userName}</span>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted }}>{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.text, margin: 0, whiteSpace: 'pre-wrap' }}>{c.message}</p>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment or error note..."
              style={{
                flex: 1, padding: '6px 10px', fontFamily: sFont.body, fontSize: '0.8rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && newComment.trim()) {
                  addComment.mutate({ testItemId: itemId, message: newComment.trim() });
                }
              }}
            />
            <button
              onClick={() => newComment.trim() && addComment.mutate({ testItemId: itemId, message: newComment.trim() })}
              disabled={!newComment.trim() || addComment.isPending}
              style={{
                padding: '6px 10px', background: sColor.red, border: 'none', borderRadius: '3px',
                cursor: newComment.trim() ? 'pointer' : 'not-allowed', opacity: newComment.trim() ? 1 : 0.5,
              }}
            >
              <Send style={{ width: 12, height: 12, color: 'white' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Test Item Row ───────────────────────────────────────────────────────────

interface TestItemProps {
  item: {
    id: string;
    category: string;
    title: string;
    description: string | null;
    status: Status;
    priority: Priority;
    testedByName: string | null;
    testedAt: number | null;
    assignedToName: string | null;
    comment: string | null;
    errorDetails: string | null;
    comments: { id: string; userName: string; message: string; createdAt: number }[];
  };
  checklistId: string;
}

function TestItemRow({ item, checklistId }: TestItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [errorInput, setErrorInput] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const utils = trpc.useUtils();

  const updateStatus = trpc.qa.updateItemStatus.useMutation({
    onSuccess: () => {
      utils.qa.getChecklist.invalidate({ checklistId });
      setShowStatusPicker(false);
      setErrorInput('');
    },
  });

  const deleteItem = trpc.qa.deleteItem.useMutation({
    onSuccess: () => utils.qa.getChecklist.invalidate({ checklistId }),
  });

  const statusCfg = statusConfig[item.status];
  const priorityCfg = priorityConfig[item.priority];
  const StatusIcon = statusCfg.icon;

  const handleStatusChange = (newStatus: Status) => {
    if (newStatus === 'fail' && !errorInput.trim()) {
      // Show error input first
      setShowStatusPicker(false);
      setExpanded(true);
      return;
    }
    updateStatus.mutate({
      itemId: item.id,
      status: newStatus,
      errorDetails: newStatus === 'fail' ? errorInput.trim() || undefined : undefined,
    });
  };

  return (
    <div style={{
      background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px',
      borderLeft: `3px solid ${statusCfg.color}`, marginBottom: '6px',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '10px' }}>
        {/* Status indicator */}
        <button
          onClick={() => setShowStatusPicker(!showStatusPicker)}
          style={{
            background: statusCfg.bg, border: `1px solid ${statusCfg.color}40`, borderRadius: '3px',
            padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            minWidth: '80px', justifyContent: 'center',
          }}
        >
          <StatusIcon style={{ width: 14, height: 14, color: statusCfg.color }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: statusCfg.color, fontWeight: 700 }}>{statusCfg.label}</span>
        </button>

        {/* Priority badge */}
        <span style={{
          fontFamily: sFont.mono, fontSize: '0.6rem', color: priorityCfg.color,
          padding: '2px 6px', border: `1px solid ${priorityCfg.color}40`, borderRadius: '2px',
          background: `${priorityCfg.color}15`,
        }}>
          {priorityCfg.label}
        </span>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text, fontWeight: 600 }}>{item.title}</span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted, marginLeft: '8px' }}>{item.category}</span>
        </div>

        {/* Tested by */}
        {item.testedByName && (
          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.blue }}>
            {item.testedByName}
          </span>
        )}

        {/* Expand / Actions */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          {expanded ? <ChevronUp style={{ width: 14, height: 14, color: sColor.textDim }} /> : <ChevronDown style={{ width: 14, height: 14, color: sColor.textDim }} />}
        </button>
      </div>

      {/* Status picker dropdown */}
      {showStatusPicker && (
        <div style={{ display: 'flex', gap: '4px', padding: '0 14px 10px', flexWrap: 'wrap' }}>
          {(Object.keys(statusConfig) as Status[]).map(s => {
            const cfg = statusConfig[s];
            const Icon = cfg.icon;
            return (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={updateStatus.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: item.status === s ? cfg.bg : 'oklch(0.11 0.005 260)',
                  border: `1px solid ${item.status === s ? cfg.color : sColor.border}`, borderRadius: '3px',
                  cursor: 'pointer', fontFamily: sFont.mono, fontSize: '0.68rem', color: cfg.color,
                }}
              >
                <Icon style={{ width: 12, height: 12 }} /> {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${sColor.borderLight}` }}>
          {item.description && (
            <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: '10px 0 0' }}>{item.description}</p>
          )}

          {/* Error details (existing) */}
          {item.errorDetails && (
            <div style={{ marginTop: '8px', padding: '8px 10px', background: `${sColor.red}15`, border: `1px solid ${sColor.red}30`, borderRadius: '3px' }}>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.red, fontWeight: 700, marginBottom: '4px' }}>ERROR DETAILS:</div>
              <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.text, margin: 0, whiteSpace: 'pre-wrap' }}>{item.errorDetails}</p>
            </div>
          )}

          {/* Error input for marking as fail */}
          {item.status !== 'fail' && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted, marginBottom: '4px' }}>ERROR DETAILS (required for FAIL):</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <textarea
                  value={errorInput}
                  onChange={e => setErrorInput(e.target.value)}
                  placeholder="Describe the error, steps to reproduce, expected vs actual behavior..."
                  rows={2}
                  style={{
                    flex: 1, padding: '8px 10px', fontFamily: sFont.body, fontSize: '0.8rem',
                    background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                    color: sColor.text, outline: 'none', resize: 'vertical',
                  }}
                />
                <button
                  onClick={() => {
                    if (errorInput.trim()) {
                      updateStatus.mutate({ itemId: item.id, status: 'fail', errorDetails: errorInput.trim() });
                    }
                  }}
                  disabled={!errorInput.trim() || updateStatus.isPending}
                  style={{
                    padding: '8px 12px', background: sColor.red, border: 'none', borderRadius: '3px',
                    cursor: errorInput.trim() ? 'pointer' : 'not-allowed', opacity: errorInput.trim() ? 1 : 0.5,
                    fontFamily: sFont.mono, fontSize: '0.7rem', color: 'white', fontWeight: 700,
                    alignSelf: 'flex-end',
                  }}
                >
                  MARK FAIL
                </button>
              </div>
            </div>
          )}

          {/* Tested info */}
          {item.testedAt && (
            <div style={{ marginTop: '8px', fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted }}>
              Tested by {item.testedByName || 'Unknown'} on {new Date(item.testedAt).toLocaleString()}
            </div>
          )}

          {/* Comments */}
          <CommentThread comments={item.comments} itemId={item.id} />

          {/* Delete */}
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { if (confirm('Delete this test item?')) deleteItem.mutate({ itemId: item.id }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: 'none', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                cursor: 'pointer', fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted,
              }}
            >
              <Trash2 style={{ width: 12, height: 12 }} /> DELETE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Checklist Dialog ─────────────────────────────────────────────────

function CreateChecklistDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [populateDefaults, setPopulateDefaults] = useState(true);
  const utils = trpc.useUtils();

  const create = trpc.qa.createChecklist.useMutation({
    onSuccess: () => {
      utils.qa.listChecklists.invalidate();
      onClose();
    },
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
        padding: '24px', width: '480px', maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>NEW QA CHECKLIST</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X style={{ width: 18, height: 18, color: sColor.textDim }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>NAME</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g., V-OP Release 2.5 QA"
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>VERSION (optional)</label>
            <input
              value={version} onChange={e => setVersion(e.target.value)}
              placeholder="e.g., 2.5.0"
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>DESCRIPTION (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Notes about this test cycle..."
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={populateDefaults} onChange={e => setPopulateDefaults(e.target.checked)} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text }}>
              Pre-populate with default V-OP test items ({50} tests)
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="outline" onClick={onClose} style={{ fontFamily: sFont.body }}>Cancel</Button>
          <Button
            onClick={() => create.mutate({ name, description: description || undefined, version: version || undefined, populateDefaults })}
            disabled={!name.trim() || create.isPending}
            style={{ fontFamily: sFont.body, background: sColor.red }}
          >
            {create.isPending ? 'Creating...' : 'Create Checklist'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Add Item Dialog ─────────────────────────────────────────────────────────

function AddItemDialog({ checklistId, onClose }: { checklistId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const utils = trpc.useUtils();

  const addItem = trpc.qa.addItem.useMutation({
    onSuccess: () => {
      utils.qa.getChecklist.invalidate({ checklistId });
      onClose();
    },
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
        padding: '24px', width: '480px', maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>ADD TEST ITEM</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X style={{ width: 18, height: 18, color: sColor.textDim }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>TITLE</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Test boost pressure PID logging"
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>CATEGORY</label>
            <input
              value={category} onChange={e => setCategory(e.target.value)}
              placeholder="e.g., Datalogger, Analyzer, UI/UX"
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>DESCRIPTION (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Steps to test, expected behavior..."
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.9rem',
                background: 'oklch(0.09 0.004 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>PRIORITY</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(Object.keys(priorityConfig) as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  style={{
                    padding: '4px 12px', fontFamily: sFont.mono, fontSize: '0.72rem',
                    background: priority === p ? `${priorityConfig[p].color}25` : 'oklch(0.31 0.005 260)',
                    border: `1px solid ${priority === p ? priorityConfig[p].color : sColor.border}`,
                    borderRadius: '3px', cursor: 'pointer', color: priorityConfig[p].color,
                  }}
                >
                  {priorityConfig[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="outline" onClick={onClose} style={{ fontFamily: sFont.body }}>Cancel</Button>
          <Button
            onClick={() => addItem.mutate({ checklistId, title, description: description || undefined, category: category || 'General', priority })}
            disabled={!title.trim() || !category.trim() || addItem.isPending}
            style={{ fontFamily: sFont.body, background: sColor.red }}
          >
            {addItem.isPending ? 'Adding...' : 'Add Item'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Detail View ───────────────────────────────────────────────────

function ChecklistDetail({ checklistId, onBack }: { checklistId: string; onBack: () => void }) {
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddItem, setShowAddItem] = useState(false);

  const { data, isLoading } = trpc.qa.getChecklist.useQuery({ checklistId });

  const categories = useMemo(() => {
    if (!data) return [];
    const cats = new Set(data.items.map(i => i.category));
    return Array.from(cats).sort();
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    });
  }, [data, statusFilter, categoryFilter]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontFamily: sFont.mono, color: sColor.textDim }}>Loading checklist...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontFamily: sFont.mono, color: sColor.red }}>Checklist not found</div>
        <Button onClick={onBack} variant="outline" style={{ marginTop: '12px' }}>Go Back</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{
            background: 'none', border: `1px solid ${sColor.border}`, borderRadius: '3px',
            padding: '6px 12px', cursor: 'pointer', fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim,
          }}>
            ← BACK
          </button>
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
              {data.checklist.name}
            </h3>
            {data.checklist.version && (
              <span style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted }}>v{data.checklist.version}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAddItem(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
            background: sColor.red, border: 'none', borderRadius: '3px', cursor: 'pointer',
            fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 600, color: 'white',
          }}
        >
          <Plus style={{ width: 14, height: 14 }} /> ADD TEST
        </button>
      </div>

      {/* Stats */}
      <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <BarChart3 style={{ width: 16, height: 16, color: sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white' }}>PROGRESS</span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.green, marginLeft: 'auto' }}>
            {data.stats.total > 0 ? Math.round(((data.stats.pass + data.stats.skipped) / data.stats.total) * 100) : 0}% COMPLETE
          </span>
        </div>
        <ProgressBar stats={data.stats} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter style={{ width: 14, height: 14, color: sColor.textMuted }} />
        <span style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textMuted }}>STATUS:</span>
        <button
          onClick={() => setStatusFilter('all')}
          style={{
            padding: '3px 8px', fontFamily: sFont.mono, fontSize: '0.68rem',
            background: statusFilter === 'all' ? `${sColor.red}25` : 'transparent',
            border: `1px solid ${statusFilter === 'all' ? sColor.red : sColor.border}`, borderRadius: '2px',
            cursor: 'pointer', color: statusFilter === 'all' ? sColor.red : sColor.textDim,
          }}
        >ALL ({data.stats.total})</button>
        {(Object.keys(statusConfig) as Status[]).map(s => {
          const count = data.stats[s as keyof typeof data.stats];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '3px 8px', fontFamily: sFont.mono, fontSize: '0.68rem',
                background: statusFilter === s ? `${statusConfig[s].color}25` : 'transparent',
                border: `1px solid ${statusFilter === s ? statusConfig[s].color : sColor.border}`, borderRadius: '2px',
                cursor: 'pointer', color: statusConfig[s].color,
              }}
            >{statusConfig[s].label} ({count})</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Users style={{ width: 14, height: 14, color: sColor.textMuted }} />
        <span style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textMuted }}>CATEGORY:</span>
        <button
          onClick={() => setCategoryFilter('all')}
          style={{
            padding: '3px 8px', fontFamily: sFont.mono, fontSize: '0.68rem',
            background: categoryFilter === 'all' ? `${sColor.blue}25` : 'transparent',
            border: `1px solid ${categoryFilter === 'all' ? sColor.blue : sColor.border}`, borderRadius: '2px',
            cursor: 'pointer', color: categoryFilter === 'all' ? sColor.blue : sColor.textDim,
          }}
        >ALL</button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            style={{
              padding: '3px 8px', fontFamily: sFont.mono, fontSize: '0.68rem',
              background: categoryFilter === cat ? `${sColor.blue}25` : 'transparent',
              border: `1px solid ${categoryFilter === cat ? sColor.blue : sColor.border}`, borderRadius: '2px',
              cursor: 'pointer', color: categoryFilter === cat ? sColor.blue : sColor.textDim,
            }}
          >{cat.toUpperCase()}</button>
        ))}
      </div>

      {/* Items */}
      <div>
        {filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px' }}>
            <ClipboardList style={{ width: 32, height: 32, color: 'oklch(0.45 0.008 260)', margin: '0 auto 8px' }} />
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted }}>No test items match the current filter</p>
          </div>
        )}
        {filteredItems.map(item => (
          <TestItemRow
            key={item.id}
            item={item as TestItemProps['item']}
            checklistId={checklistId}
          />
        ))}
      </div>

      {showAddItem && <AddItemDialog checklistId={checklistId} onClose={() => setShowAddItem(false)} />}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

export default function QAChecklistPanel() {
  const [selectedChecklist, setSelectedChecklist] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: checklists, isLoading } = trpc.qa.listChecklists.useQuery({});

  if (selectedChecklist) {
    return <ChecklistDetail checklistId={selectedChecklist} onBack={() => setSelectedChecklist(null)} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ClipboardList style={{ width: 20, height: 20, color: sColor.red }} />
          <h2 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>QA TEST CHECKLISTS</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
            background: sColor.red, border: 'none', borderRadius: '3px', cursor: 'pointer',
            fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 600, color: 'white',
          }}
        >
          <Plus style={{ width: 14, height: 14 }} /> NEW CHECKLIST
        </button>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: sFont.mono, color: sColor.textDim }}>Loading checklists...</div>
        </div>
      )}

      {!isLoading && (!checklists || checklists.length === 0) && (
        <div style={{ textAlign: 'center', padding: '3rem', background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '3px' }}>
          <ClipboardList style={{ width: 48, height: 48, color: 'oklch(0.45 0.008 260)', margin: '0 auto 16px' }} />
          <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'oklch(0.63 0.010 260)', marginBottom: '8px' }}>NO CHECKLISTS YET</p>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted, marginBottom: '16px' }}>
            Create a QA checklist to start tracking test results for the PPEI team.
          </p>
          <Button onClick={() => setShowCreate(true)} style={{ fontFamily: sFont.body, background: sColor.red }}>
            Create First Checklist
          </Button>
        </div>
      )}

      {checklists && checklists.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {checklists.map(cl => (
            <button
              key={cl.id}
              onClick={() => setSelectedChecklist(cl.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
                borderLeft: `3px solid ${cl.status === 'completed' ? sColor.green : cl.status === 'archived' ? sColor.textMuted : sColor.red}`,
                borderRadius: '3px', cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = sColor.bgHover; }}
              onMouseLeave={e => { (e.currentTarget).style.background = sColor.bgCard; }}
            >
              <div>
                <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.04em', color: 'white' }}>
                  {cl.name}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                  {cl.version && <span style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.blue }}>v{cl.version}</span>}
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted }}>
                    Created {new Date(cl.createdAt).toLocaleDateString()}
                  </span>
                  <span style={{
                    fontFamily: sFont.mono, fontSize: '0.65rem', padding: '1px 6px',
                    background: cl.status === 'active' ? `${sColor.green}20` : cl.status === 'completed' ? `${sColor.blue}20` : `${sColor.textMuted}20`,
                    border: `1px solid ${cl.status === 'active' ? sColor.green : cl.status === 'completed' ? sColor.blue : sColor.textMuted}40`,
                    borderRadius: '2px', color: cl.status === 'active' ? sColor.green : cl.status === 'completed' ? sColor.blue : sColor.textMuted,
                  }}>
                    {cl.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <ChevronDown style={{ width: 16, height: 16, color: sColor.textDim, transform: 'rotate(-90deg)' }} />
            </button>
          ))}
        </div>
      )}

      {showCreate && <CreateChecklistDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
