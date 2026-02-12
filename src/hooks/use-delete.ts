'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';
import { invalidatePreview } from '@/hooks/use-preview';

/**
 * Optimistically batch-delete items from the store AND clear their
 * preview cache entries.  Extracted so batchArchive (a React hook
 * callback) and tests can share the same logic.
 */
export function batchDeleteWithPreviewCleanup(pageIds: string[], parentId: string) {
  useFinderStore.getState().optimisticBatchDelete(pageIds, parentId);
  for (const id of pageIds) {
    invalidatePreview(id);
  }
}

export function useDelete() {
  const optimisticDelete = useFinderStore((s) => s.optimisticDelete);
  const invalidateCache = useFinderStore((s) => s.invalidateCache);
  const setPendingDelete = useFinderStore((s) => s.setPendingDelete);

  const archivePage = useCallback(
    async (pageId: string, parentId: string) => {
      const removed = optimisticDelete(pageId, parentId);
      invalidatePreview(pageId);

      try {
        const res = await fetch(`/api/notion/archive/${pageId}`, {
          method: 'POST',
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Archive failed: HTTP ${res.status}`);
        }
      } catch (err) {
        // Rollback on network error
        invalidateCache([parentId]);
        throw err;
      }

      return removed;
    },
    [optimisticDelete, invalidateCache],
  );

  const batchArchive = useCallback(
    async (pageIds: string[], parentId: string) => {
      batchDeleteWithPreviewCleanup(pageIds, parentId);

      try {
        const res = await fetch('/api/notion/batch-archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page_ids: pageIds }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Batch archive failed: HTTP ${res.status}`);
        }

        const result = await res.json();
        // If some failed, invalidate cache to get accurate state
        if (result.failed?.length > 0) {
          invalidateCache([parentId]);
        }
        return result as { succeeded: string[]; failed: { id: string; error: string }[] };
      } catch (err) {
        invalidateCache([parentId]);
        throw err;
      }
    },
    [invalidateCache],
  );

  return { archivePage, batchArchive, setPendingDelete };
}
