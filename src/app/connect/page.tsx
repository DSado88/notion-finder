'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ConnectionInfo, OAuthBackend } from '@/lib/session';

interface ConnectionsResponse {
  mode: 'env' | 'oauth';
  oauthAvailable: Record<OAuthBackend, boolean>;
  connections: ConnectionInfo[];
}

interface GitHubRepo {
  full_name: string;
  description: string | null;
  private: boolean;
  pushed_at: string;
}

const BACKENDS = [
  {
    id: 'notion' as const,
    name: 'Notion',
    description: 'Browse pages, databases, and documents.',
    color: '#000000',
    tokenLabel: 'Integration token',
    tokenPlaceholder: 'ntn_...',
    tokenHelpUrl: 'https://www.notion.so/my-integrations',
    tokenHelpLabel: 'Create an integration',
  },
  {
    id: 'linear' as const,
    name: 'Linear',
    description: 'Browse teams, projects, issues, and documents.',
    color: '#5E6AD2',
    tokenLabel: 'API key',
    tokenPlaceholder: 'lin_api_...',
    tokenHelpUrl: 'https://linear.app/settings/api',
    tokenHelpLabel: 'Create an API key',
  },
  {
    id: 'git-github' as const,
    name: 'GitHub',
    description: 'Browse and edit markdown files in a repo.',
    color: '#24292f',
    tokenLabel: 'Personal access token',
    tokenPlaceholder: 'ghp_...',
    tokenHelpUrl: 'https://github.com/settings/tokens',
    tokenHelpLabel: 'Create a token',
  },
];

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectPageInner />
    </Suspense>
  );
}

function ConnectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const setup = searchParams.get('setup');
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Per-backend token form state
  const [tokenForms, setTokenForms] = useState<Record<string, boolean>>({});
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [repoValue, setRepoValue] = useState('');
  const [tokenSaving, setTokenSaving] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<Record<string, string>>({});

  // GitHub repo picker state (for OAuth flow)
  const [showRepoPicker, setShowRepoPicker] = useState(setup === 'git-github');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [reposLoading, setReposLoading] = useState(false);
  const [settingUpRepo, setSettingUpRepo] = useState(false);

  const refreshConnections = useCallback(async () => {
    const res = await fetch('/api/auth/connections');
    const d: ConnectionsResponse = await res.json();
    setData(d);
    return d;
  }, []);

  useEffect(() => {
    refreshConnections()
      .then(() => setIsLoading(false))
      .catch(() => setIsLoading(false));
  }, [refreshConnections]);

  // Fetch repos when picker opens or search changes
  const fetchRepos = useCallback(async (query: string) => {
    setReposLoading(true);
    try {
      const url = query
        ? `/api/auth/git-github/repos?q=${encodeURIComponent(query)}`
        : '/api/auth/git-github/repos';
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setRepos(d.repos);
      }
    } catch { /* ignore */ }
    setReposLoading(false);
  }, []);

  useEffect(() => {
    if (!showRepoPicker) return;
    const timer = setTimeout(() => fetchRepos(repoSearch), repoSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [showRepoPicker, repoSearch, fetchRepos]);

  const handleOAuthConnect = (backend: string) => {
    window.location.href = `/api/auth/${backend}`;
  };

  const handleTokenSave = async (backendId: OAuthBackend) => {
    const token = tokenValues[backendId]?.trim();
    if (!token) return;

    setTokenSaving(backendId);
    setTokenError((prev) => ({ ...prev, [backendId]: '' }));

    try {
      const body: Record<string, string> = { backend: backendId, token };
      if (backendId === 'git-github') {
        if (!repoValue.trim() || !repoValue.includes('/')) {
          setTokenError((prev) => ({ ...prev, [backendId]: 'Enter a repo as owner/repo' }));
          setTokenSaving(null);
          return;
        }
        body.repo = repoValue.trim();
      }

      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setTokenError((prev) => ({ ...prev, [backendId]: err.error || 'Failed to connect' }));
      } else {
        // Success — clear form and refresh
        setTokenForms((prev) => ({ ...prev, [backendId]: false }));
        setTokenValues((prev) => ({ ...prev, [backendId]: '' }));
        setRepoValue('');
        await refreshConnections();
      }
    } catch {
      setTokenError((prev) => ({ ...prev, [backendId]: 'Network error' }));
    }
    setTokenSaving(null);
  };

  const handleDisconnect = async (backend: string) => {
    await fetch('/api/auth/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend }),
    });
    if (backend === 'git-github') setShowRepoPicker(false);
    await refreshConnections();
  };

  const handleSelectRepo = async (fullName: string) => {
    setSettingUpRepo(true);
    try {
      const res = await fetch('/api/auth/git-github/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: fullName }),
      });
      if (res.ok) {
        setShowRepoPicker(false);
        await refreshConnections();
      }
    } catch { /* ignore */ }
    setSettingUpRepo(false);
  };

  const handleContinue = () => {
    router.push('/');
  };

  // GitHub is "fully connected" only if it has a repo selected
  const isGitHubReady = (conn: ConnectionInfo) =>
    conn.backend !== 'git-github' || !!conn.githubRepo;

  const hasActiveConnection = data?.connections.some(
    (c) => c.isActive && isGitHubReady(c),
  );

  const isEnvMode = data?.mode === 'env';

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            Connect a workspace
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Choose a service to browse with Potion
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-md px-4 py-3 text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
          >
            Connection failed: {error.replace(/_/g, ' ')}
          </div>
        )}

        {isEnvMode && (
          <div
            className="mb-4 rounded-md px-4 py-3 text-sm"
            style={{ background: 'var(--accent)', color: 'var(--muted)' }}
          >
            Running with local API tokens. Use the toolbar switcher to change backends.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {BACKENDS.map((backend) => {
            const connection = data?.connections.find((c) => c.backend === backend.id);
            const isConnected = !!connection;
            const hasOAuth = data?.oauthAvailable?.[backend.id] ?? false;
            const needsRepoSetup = backend.id === 'git-github' && isConnected && !connection.githubRepo;
            const showTokenForm = tokenForms[backend.id];

            return (
              <div
                key={backend.id}
                className="rounded-lg p-4"
                style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold"
                      style={{ background: backend.color }}
                    >
                      {backend.name[0]}
                    </div>
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--foreground)' }}>
                        {backend.name}
                      </h3>
                      {isConnected && !needsRepoSetup ? (
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {connection.workspaceName}
                        </p>
                      ) : isConnected && needsRepoSetup ? (
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          Authenticated — select a repository
                        </p>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {backend.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConnected && !isEnvMode && (
                      <button
                        type="button"
                        onClick={() => handleDisconnect(backend.id)}
                        className="rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-red-50 dark:hover:bg-red-950"
                        style={{ color: 'var(--muted)' }}
                      >
                        Disconnect
                      </button>
                    )}
                    {isConnected && !needsRepoSetup ? (
                      <span
                        className="rounded-md px-3 py-1.5 text-xs font-medium"
                        style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
                      >
                        Connected
                      </span>
                    ) : isConnected && needsRepoSetup ? (
                      <button
                        type="button"
                        onClick={() => setShowRepoPicker(true)}
                        className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors"
                        style={{ background: backend.color }}
                      >
                        Pick repo
                      </button>
                    ) : !isEnvMode ? (
                      /* Not connected — show connect options */
                      hasOAuth ? (
                        <button
                          type="button"
                          onClick={() => handleOAuthConnect(backend.id)}
                          disabled={isLoading}
                          className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-30"
                          style={{ background: backend.color }}
                        >
                          Connect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTokenForms((prev) => ({ ...prev, [backend.id]: !prev[backend.id] }))}
                          disabled={isLoading}
                          className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-30"
                          style={{ background: backend.color }}
                        >
                          Add token
                        </button>
                      )
                    ) : null}
                  </div>
                </div>

                {/* Token paste link — shown below OAuth button when OAuth is available */}
                {!isConnected && !isEnvMode && hasOAuth && !showTokenForm && (
                  <div className="mt-2 ml-[52px]">
                    <button
                      type="button"
                      onClick={() => setTokenForms((prev) => ({ ...prev, [backend.id]: true }))}
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      Or paste an API token
                    </button>
                  </div>
                )}

                {/* Token paste form */}
                {!isConnected && !isEnvMode && showTokenForm && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                          {backend.tokenLabel}
                        </label>
                        <a
                          href={backend.tokenHelpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] underline-offset-2 hover:underline"
                          style={{ color: 'var(--muted)' }}
                        >
                          {backend.tokenHelpLabel} &rarr;
                        </a>
                      </div>
                      <input
                        type="password"
                        placeholder={backend.tokenPlaceholder}
                        value={tokenValues[backend.id] || ''}
                        onChange={(e) => setTokenValues((prev) => ({ ...prev, [backend.id]: e.target.value }))}
                        className="w-full rounded-md px-3 py-1.5 text-sm outline-none"
                        style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                        autoFocus
                      />

                      {/* GitHub needs repo input */}
                      {backend.id === 'git-github' && (
                        <input
                          type="text"
                          placeholder="owner/repo"
                          value={repoValue}
                          onChange={(e) => setRepoValue(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm outline-none"
                          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                        />
                      )}

                      {tokenError[backend.id] && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>
                          {tokenError[backend.id]}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTokenSave(backend.id)}
                          disabled={tokenSaving === backend.id || !tokenValues[backend.id]?.trim()}
                          className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-40"
                          style={{ background: backend.color }}
                        >
                          {tokenSaving === backend.id ? 'Connecting...' : 'Connect'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTokenForms((prev) => ({ ...prev, [backend.id]: false }));
                            setTokenError((prev) => ({ ...prev, [backend.id]: '' }));
                          }}
                          className="rounded-md px-3 py-1.5 text-xs transition-colors"
                          style={{ color: 'var(--muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* GitHub repo picker — inline under the GitHub card (OAuth flow) */}
                {backend.id === 'git-github' && showRepoPicker && isConnected && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      className="mb-2 w-full rounded-md px-3 py-1.5 text-sm outline-none"
                      style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                      autoFocus
                    />
                    <div
                      className="max-h-[240px] overflow-y-auto rounded-md"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      {reposLoading && repos.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--muted)' }}>
                          Loading repositories...
                        </div>
                      )}
                      {!reposLoading && repos.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--muted)' }}>
                          No repositories found
                        </div>
                      )}
                      {repos.map((repo) => (
                        <button
                          key={repo.full_name}
                          type="button"
                          onClick={() => handleSelectRepo(repo.full_name)}
                          disabled={settingUpRepo}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] disabled:opacity-40 dark:hover:bg-white/[0.04]"
                          style={{ color: 'var(--foreground)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{repo.full_name}</span>
                              {repo.private && (
                                <span
                                  className="flex-none rounded px-1 text-[10px]"
                                  style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
                                >
                                  private
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                                {repo.description}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasActiveConnection && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-md px-6 py-2 text-sm font-medium text-white transition-colors"
              style={{ background: 'var(--selection-bg)' }}
            >
              Continue to workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
