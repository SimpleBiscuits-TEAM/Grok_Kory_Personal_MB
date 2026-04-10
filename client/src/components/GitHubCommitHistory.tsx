/**
 * GitHubCommitHistory — Displays recent commits from the VOP GitHub repository.
 * Collapsible/expandable folder-style section with user-selectable commit count.
 * Matches the motorsport-dark design language used throughout V-OP.
 */
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  GitCommit,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Loader2,
  FolderOpen,
  FolderClosed,
} from 'lucide-react';

const COUNT_OPTIONS = [15, 50, 100, 200] as const;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

/** Extract first line of a commit message */
function firstLine(msg: string): string {
  const line = msg.split('\n')[0];
  return line.length > 120 ? line.substring(0, 117) + '...' : line;
}

export default function GitHubCommitHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState<number>(15);

  // Only fetch when the section is open
  const { data, isLoading, error } = trpc.github.getRecentCommits.useQuery(
    { count: selectedCount },
    {
      refetchInterval: 5 * 60 * 1000,
      enabled: isOpen,
    }
  );

  const commits = data?.commits ?? [];

  // Group commits by date for visual organization
  const groupedCommits = useMemo(() => {
    const groups: { label: string; commits: typeof commits }[] = [];
    let currentLabel = '';
    let currentGroup: typeof commits = [];

    for (const commit of commits) {
      const d = new Date(commit.date);
      const label = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, commits: currentGroup });
        }
        currentLabel = label;
        currentGroup = [commit];
      } else {
        currentGroup.push(commit);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, commits: currentGroup });
    }
    return groups;
  }, [commits]);

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)',
      border: '1px solid oklch(0.20 0.008 260)',
      borderLeft: '4px solid oklch(0.52 0.22 25)',
      borderRadius: '3px',
      marginTop: '1.5rem',
      overflow: 'hidden',
    }}>
      {/* Folder header — always visible, click to toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '1rem 1.25rem',
          background: isOpen ? 'oklch(0.14 0.008 260)' : 'transparent',
          border: 'none',
          borderBottom: isOpen ? '1px solid oklch(0.20 0.008 260)' : 'none',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.background = 'oklch(0.14 0.006 260)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isOpen ? (
            <FolderOpen style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
          ) : (
            <FolderClosed style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
          )}
          <GitCommit style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)' }} />
          <span style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1.15rem',
            letterSpacing: '0.08em',
            color: 'white',
          }}>
            COMMIT HISTORY
          </span>
          {commits.length > 0 && (
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.7rem',
              color: 'oklch(0.50 0.008 260)',
              background: 'oklch(0.16 0.006 260)',
              padding: '2px 8px',
              borderRadius: '2px',
              border: '1px solid oklch(0.22 0.008 260)',
            }}>
              {commits.length} LOADED
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {data?.repo && (
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.72rem',
                color: 'oklch(0.55 0.008 260)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'oklch(0.52 0.22 25)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'oklch(0.55 0.008 260)')}
            >
              {data.repo}
              <ExternalLink style={{ width: '11px', height: '11px' }} />
            </a>
          )}
          {isOpen ? (
            <ChevronDown style={{ width: '16px', height: '16px', color: 'oklch(0.55 0.008 260)' }} />
          ) : (
            <ChevronRight style={{ width: '16px', height: '16px', color: 'oklch(0.55 0.008 260)' }} />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div style={{ padding: '1rem 1.25rem' }}>
          {/* Count selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '1rem',
          }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.72rem',
              color: 'oklch(0.50 0.008 260)',
              letterSpacing: '0.05em',
            }}>
              SHOW:
            </span>
            {COUNT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setSelectedCount(opt)}
                style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.72rem',
                  letterSpacing: '0.03em',
                  padding: '3px 10px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  border: selectedCount === opt
                    ? '1px solid oklch(0.52 0.22 25)'
                    : '1px solid oklch(0.22 0.008 260)',
                  background: selectedCount === opt
                    ? 'oklch(0.52 0.22 25 / 0.15)'
                    : 'oklch(0.16 0.006 260)',
                  color: selectedCount === opt
                    ? 'oklch(0.52 0.22 25)'
                    : 'oklch(0.55 0.008 260)',
                }}
              >
                {opt}
              </button>
            ))}
            {isLoading && (
              <Loader2 style={{
                width: '14px',
                height: '14px',
                color: 'oklch(0.52 0.22 25)',
                animation: 'spin 1s linear infinite',
                marginLeft: '4px',
              }} />
            )}
          </div>

          {/* Loading state */}
          {isLoading && commits.length === 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '2rem 0',
              color: 'oklch(0.55 0.008 260)',
            }}>
              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem' }}>
                Loading commit history...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              color: 'oklch(0.65 0.15 25)',
              padding: '1rem 0',
              textAlign: 'center',
            }}>
              Unable to load commit history
            </div>
          )}

          {/* Commit list grouped by date */}
          {!error && commits.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              maxHeight: '600px',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'oklch(0.25 0.008 260) transparent',
            }}>
              {groupedCommits.map((group) => (
                <div key={group.label}>
                  {/* Date separator */}
                  <div style={{
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.68rem',
                    color: 'oklch(0.45 0.008 260)',
                    letterSpacing: '0.06em',
                    padding: '8px 10px 4px',
                    borderBottom: '1px solid oklch(0.18 0.006 260)',
                    marginBottom: '2px',
                  }}>
                    {group.label.toUpperCase()}
                  </div>
                  {group.commits.map((commit, idx) => (
                    <a
                      key={commit.sha}
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '7px 10px',
                        borderRadius: '2px',
                        background: idx % 2 === 0 ? 'oklch(0.14 0.005 260)' : 'transparent',
                        textDecoration: 'none',
                        transition: 'background 0.15s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.18 0.008 260)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'oklch(0.14 0.005 260)' : 'transparent')}
                    >
                      {/* SHA badge */}
                      <span style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.72rem',
                        color: 'oklch(0.52 0.22 25)',
                        background: 'oklch(0.52 0.22 25 / 0.12)',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        border: '1px solid oklch(0.52 0.22 25 / 0.25)',
                        flexShrink: 0,
                        letterSpacing: '0.02em',
                      }}>
                        {commit.shortSha}
                      </span>

                      {/* Message */}
                      <span style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        fontSize: '0.85rem',
                        color: 'oklch(0.88 0.005 260)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {firstLine(commit.message)}
                      </span>

                      {/* Author */}
                      <span style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.7rem',
                        color: 'oklch(0.55 0.008 260)',
                        flexShrink: 0,
                        maxWidth: '100px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {commit.author}
                      </span>

                      {/* Time ago */}
                      <span style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.68rem',
                        color: 'oklch(0.45 0.008 260)',
                        flexShrink: 0,
                        minWidth: '50px',
                        textAlign: 'right',
                      }}>
                        {timeAgo(commit.date)}
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && commits.length === 0 && (
            <div style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              color: 'oklch(0.55 0.008 260)',
              padding: '1rem 0',
              textAlign: 'center',
            }}>
              No commits found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
