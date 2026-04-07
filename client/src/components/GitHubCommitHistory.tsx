/**
 * GitHubCommitHistory — Displays recent commits from the VOP GitHub repository.
 * Matches the motorsport-dark design language used throughout V-OP.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { GitCommit, ExternalLink, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

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
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = trpc.github.getRecentCommits.useQuery(
    { count: 15 },
    { refetchInterval: 5 * 60 * 1000 } // refetch every 5 min
  );

  const commits = data?.commits ?? [];
  const visibleCommits = expanded ? commits : commits.slice(0, 5);

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)',
      border: '1px solid oklch(0.20 0.008 260)',
      borderLeft: '4px solid oklch(0.52 0.22 25)',
      borderRadius: '3px',
      padding: '1.25rem',
      marginTop: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GitCommit style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
          <h3 style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1.15rem',
            letterSpacing: '0.08em',
            color: 'white',
            margin: 0,
          }}>
            RECENT COMMITS
          </h3>
          {data?.repo && (
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.75rem',
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
        </div>
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
            {commits.length} COMMITS
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
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

      {/* Commit list */}
      {!isLoading && !error && commits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {visibleCommits.map((commit, idx) => (
            <a
              key={commit.sha}
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 10px',
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

          {/* Show more / less toggle */}
          {commits.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '6px',
                padding: '6px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '0.8rem',
                letterSpacing: '0.08em',
                color: 'oklch(0.52 0.22 25)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'oklch(0.65 0.20 25)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'oklch(0.52 0.22 25)')}
            >
              {expanded ? (
                <>
                  <ChevronUp style={{ width: '14px', height: '14px' }} />
                  SHOW LESS
                </>
              ) : (
                <>
                  <ChevronDown style={{ width: '14px', height: '14px' }} />
                  SHOW ALL {commits.length} COMMITS
                </>
              )}
            </button>
          )}
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
  );
}
