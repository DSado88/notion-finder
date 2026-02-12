'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';

export function useMove() {
  const invalidateCache = useFinderStore((s) => s.invalidateCache);

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

      // Invalidate caches for both old and new parent so useChildren re-fetches
      // Root-level items have parentId: null, but the cache key is 'workspace'
      const idsToInvalidate = [newParentId];
      idsToInvalidate.push(oldParentId ?? 'workspace');
      invalidateCache(idsToInvalidate);
    },
    [invalidateCache],
  );

  return { movePage };
}
