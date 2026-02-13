'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';

export function useMove() {
  const optimisticMove = useFinderStore((s) => s.optimisticMove);

  const movePage = useCallback(
    async (pageId: string, newParentId: string, oldParentId: string | null) => {
      const resolvedOldParent = oldParentId ?? 'workspace';

      // Optimistic-first: update the UI immediately so the item moves instantly.
      // Rollback on API failure.
      optimisticMove(pageId, resolvedOldParent, newParentId);

      try {
        const res = await fetch(`/api/notion/move/${pageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_parent_id: newParentId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Move failed: HTTP ${res.status}`);
        }
      } catch (err) {
        // Rollback: move the item back to its original parent
        optimisticMove(pageId, newParentId, resolvedOldParent);
        throw err;
      }
    },
    [optimisticMove],
  );

  return { movePage };
}
