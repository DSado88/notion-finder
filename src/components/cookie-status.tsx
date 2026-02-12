'use client';

import { useState, useEffect, useCallback } from 'react';

type Status = 'valid' | 'expired' | 'missing' | 'checking' | 'refreshing';

export function CookieStatus() {
  const [status, setStatus] = useState<Status>('checking');

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/notion/cookie-status');
      const data = await res.json();
      setStatus(data.status as Status);
    } catch {
      setStatus('expired');
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Re-check every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleRefresh = async () => {
    setStatus('refreshing');
    try {
      await fetch('/api/notion/refresh-token', { method: 'POST' });
      // Poll until the Playwright script finishes and the token is valid again
      const poll = setInterval(async () => {
        const res = await fetch('/api/notion/cookie-status');
        const data = await res.json();
        if (data.status === 'valid') {
          clearInterval(poll);
          setStatus('valid');
        }
      }, 3000);
      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
    } catch {
      setStatus('expired');
    }
  };

  const dot = {
    valid: 'bg-emerald-400',
    expired: 'bg-amber-400',
    missing: 'bg-zinc-400',
    checking: 'bg-zinc-300 animate-pulse',
    refreshing: 'bg-amber-400 animate-pulse',
  }[status];

  const label = {
    valid: 'Session active',
    expired: 'Session expired',
    missing: 'No session token',
    checking: 'Checking...',
    refreshing: 'Waiting for login...',
  }[status];

  const showRefresh = status === 'expired' || status === 'missing';

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} title={label} />
      {showRefresh && (
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded px-1 py-0.5 opacity-50 hover:bg-black/[0.04] hover:opacity-80 dark:hover:bg-white/[0.04]"
        >
          Refresh
        </button>
      )}
    </div>
  );
}
