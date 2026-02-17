'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BranchStatus } from '@/lib/adapters/types';

// Module-level refresh function so other components (e.g. after save) can
// trigger an immediate status update without waiting for the 30s poll.
let _refreshFn: (() => Promise<void>) | null = null;
export function refreshBranchStatus() {
  _refreshFn?.();
}

export function useBranch(enabled: boolean) {
  const [status, setStatus] = useState<BranchStatus | null>(null);
  const [isCreatingPr, setIsCreatingPr] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/workspace/branch');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // ignore
    }
  }, [enabled]);

  // Expose refresh globally
  useEffect(() => {
    if (enabled) _refreshFn = refresh;
    return () => { if (_refreshFn === refresh) _refreshFn = null; };
  }, [enabled, refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const createPr = useCallback(async (title?: string) => {
    setIsCreatingPr(true);
    try {
      const res = await fetch('/api/workspace/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-pr', title }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create PR');
      }
      const result = await res.json();
      await refresh();
      return result as { url: string; number: number };
    } finally {
      setIsCreatingPr(false);
    }
  }, [refresh]);

  const discard = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard' }),
      });
      if (!res.ok) throw new Error('Discard failed');
      await refresh();
    } catch {
      // handle silently
    }
  }, [refresh]);

  return { status, isCreatingPr, createPr, discard, refresh };
}
