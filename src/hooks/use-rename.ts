'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';

export function useRename() {
  const optimisticRename = useFinderStore((s) => s.optimisticRename);
  const stopEditing = useFinderStore((s) => s.stopEditing);

  const renamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      const oldTitle = useFinderStore.getState().itemById[pageId]?.title ?? '';
      const title = newTitle.trim() || 'Untitled';

      // Optimistic: update immediately
      optimisticRename(pageId, title);
      stopEditing();

      try {
        const res = await fetch(`/api/notion/rename/${pageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Rename failed: HTTP ${res.status}`);
        }
      } catch (err) {
        // Rollback on any failure (HTTP error or network error)
        optimisticRename(pageId, oldTitle);
        throw err;
      }
    },
    [optimisticRename, stopEditing],
  );

  return { renamePage };
}
