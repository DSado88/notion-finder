'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SyncStatus } from '@/lib/adapters/types';

export function useSync(enabled: boolean) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/workspace/sync');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // ignore
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    // Poll every 30s
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const pull = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/workspace/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull' }),
      });
      if (!res.ok) throw new Error('Pull failed');
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  const push = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Commit any uncommitted changes first, then push
      await fetch('/api/workspace/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', message: 'Save changes' }),
      });
      const res = await fetch('/api/workspace/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push' }),
      });
      if (!res.ok) throw new Error('Push failed');
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  return { status, isSyncing, pull, push, refresh };
}
