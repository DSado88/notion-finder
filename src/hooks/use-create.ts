'use client';

import { useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';
import type { FinderItem } from '@/types/finder';

export function useCreate() {
  const optimisticCreate = useFinderStore((s) => s.optimisticCreate);
  const selectItem = useFinderStore((s) => s.selectItem);
  const startEditing = useFinderStore((s) => s.startEditing);

  const createPage = useCallback(
    async (parentId: string, columnIndex: number) => {
      const res = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId, title: 'Untitled' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Create failed: HTTP ${res.status}`);
      }

      const { item } = (await res.json()) as { item: FinderItem };
      optimisticCreate(parentId, item);
      selectItem(columnIndex, item.id);
      // Enter rename mode so user can type the name immediately
      startEditing(item.id);
      return item;
    },
    [optimisticCreate, selectItem, startEditing],
  );

  return { createPage };
}
