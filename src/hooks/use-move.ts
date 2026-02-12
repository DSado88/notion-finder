'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';

export function useMove() {
  const optimisticMove = useFinderStore((s) => s.optimisticMove);

  const movePage = useCallback(
    async (pageId: string, newParentId: string, oldParentId: string | null) => {
      const res = await fetch(`/api/notion/move/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_parent_id: newParentId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Move failed: HTTP ${res.status}`);
      }

      // Optimistically update the client-side cache instead of re-fetching
      // (server re-fetch returns stale data because Notion's search index is eventually consistent)
      optimisticMove(pageId, oldParentId ?? 'workspace', newParentId);
    },
    [optimisticMove],
  );

  return { movePage };
}
