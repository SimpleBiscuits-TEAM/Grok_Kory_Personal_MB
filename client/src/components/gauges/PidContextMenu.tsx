/**
 * PidContextMenu — Right-click context menu for gauge PID selection
 * 
 * Shows a searchable list of available PIDs grouped by category.
 * Allows assigning a PID to a gauge slot or removing the current one.
 */

import { useState, useEffect, useRef } from 'react';
import { Search, X, Trash2 } from 'lucide-react';
import type { PIDDefinition } from '@/lib/obdConnection';

export interface PidContextMenuProps {
  x: number;
  y: number;
  availablePids: PIDDefinition[];
  currentPid: PIDDefinition | null;
  onSelect: (pid: PIDDefinition) => void;
  onRemove: () => void;
  onClose: () => void;
}

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

export default function PidContextMenu({
  x, y, availablePids, currentPid, onSelect, onRemove, onClose,
}: PidContextMenuProps) {
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-focus search
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const filtered = availablePids.filter(p => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
           p.shortName.toLowerCase().includes(q) ||
           p.category.toLowerCase().includes(q) ||
           p.unit.toLowerCase().includes(q);
  });

  // Group by category
  const grouped = new Map<string, PIDDefinition[]>();
  for (const p of filtered) {
    const list = grouped.get(p.category) || [];
    list.push(p);
    grouped.set(p.category, list);
  }

  // Position adjustment to keep menu on screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 280),
    top: Math.min(y, window.innerHeight - 400),
    zIndex: 10000,
    width: '260px',
    maxHeight: '380px',
    background: 'oklch(0.10 0.006 260)',
    border: '1px solid oklch(0.28 0.010 260)',
    borderRadius: '6px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid oklch(0.22 0.008 260)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: 'oklch(0.90 0.005 260)', letterSpacing: '0.1em' }}>
          SELECT PID
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'oklch(0.50 0.008 260)', cursor: 'pointer', padding: '2px' }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid oklch(0.18 0.006 260)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'oklch(0.07 0.004 260)', border: '1px solid oklch(0.22 0.008 260)',
          borderRadius: '3px', padding: '4px 8px',
        }}>
          <Search style={{ width: 12, height: 12, color: 'oklch(0.58 0.008 260)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search PIDs..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: sFont.body, fontSize: '0.78rem', color: 'oklch(0.90 0.005 260)',
            }}
          />
        </div>
      </div>

      {/* Remove current PID option */}
      {currentPid && (
        <button
          onClick={onRemove}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 10px', background: 'none', border: 'none',
            borderBottom: '1px solid oklch(0.18 0.006 260)',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'oklch(0.15 0.03 25 / 0.3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Trash2 style={{ width: 12, height: 12, color: 'oklch(0.58 0.20 25)' }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: 'oklch(0.58 0.20 25)' }}>
            Remove "{currentPid.shortName}"
          </span>
        </button>
      )}

      {/* PID list */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {Array.from(grouped.entries()).map(([category, pids]) => (
          <div key={category}>
            <div style={{
              padding: '4px 10px', background: 'oklch(0.08 0.004 260)',
              fontFamily: sFont.mono, fontSize: '0.6rem', color: 'oklch(0.60 0.010 260)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              position: 'sticky', top: 0, zIndex: 1,
            }}>
              {category}
            </div>
            {pids.map(p => {
              const isActive = currentPid?.pid === p.pid && currentPid?.service === p.service;
              return (
                <button
                  key={`${p.service}-${p.pid}`}
                  onClick={() => onSelect(p)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '5px 10px', background: isActive ? 'oklch(0.15 0.02 220 / 0.3)' : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'oklch(0.14 0.005 260)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                >
                  <div>
                    <div style={{
                      fontFamily: sFont.body, fontSize: '0.75rem',
                      color: isActive ? 'oklch(0.70 0.18 220)' : 'oklch(0.85 0.005 260)',
                    }}>
                      {p.shortName}
                    </div>
                    <div style={{
                      fontFamily: sFont.mono, fontSize: '0.55rem',
                      color: 'oklch(0.58 0.008 260)',
                    }}>
                      {p.name}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: sFont.mono, fontSize: '0.55rem',
                    color: 'oklch(0.58 0.008 260)',
                  }}>
                    {p.unit}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontFamily: sFont.body, fontSize: '0.75rem', color: 'oklch(0.58 0.008 260)' }}>
            No PIDs match "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}
