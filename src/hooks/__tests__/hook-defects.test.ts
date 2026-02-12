/**
 * TDD tests for hook-level defects found in deep review.
 *
 * These tests exercise the hook logic pattern (store + module-level cache)
 * without rendering React components.  They simulate the exact sequence
 * of calls the hooks make.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinderStore } from '@/stores/finder-store';
import { invalidatePreview, _testGetCache } from '@/hooks/use-preview';
import { batchDeleteWithPreviewCleanup } from '@/hooks/use-delete';
import type { FinderItem } from '@/types/finder';
import type { PreviewData } from '@/hooks/use-preview';

// ─── Helper ───

function makeItem(overrides: Partial<FinderItem> & { id: string }): FinderItem {
  return {
    title: 'Test',
    type: 'page',
    icon: null,
    hasChildren: false,
    createdTime: '2025-01-01T00:00:00.000Z',
    lastEditedTime: '2025-01-01T00:00:00.000Z',
    parentType: 'workspace',
    parentId: null,
    url: `https://notion.so/${overrides.id}`,
    ...overrides,
  };
}

function makePreview(title: string): PreviewData {
  return {
    type: 'page',
    title,
    icon: null,
    markdown: `# ${title}`,
    properties: [],
    url: `https://notion.so/test`,
    lastEditedTime: '2025-01-01T00:00:00.000Z',
  };
}

function seedStore(items: FinderItem[], childrenMap: Record<string, FinderItem[]>) {
  const itemById: Record<string, FinderItem> = {};
  for (const item of items) itemById[item.id] = item;
  useFinderStore.setState({
    itemById,
    childrenByParentId: childrenMap,
  });
}

beforeEach(() => {
  useFinderStore.setState({
    viewMode: 'miller',
    columnPath: ['workspace'],
    selections: {},
    previewTargetId: null,
    multiSelections: {},
    selectionAnchor: {},
    editingItemId: null,
    pendingDelete: null,
    columnSort: {},
    columnWidths: {},
    childrenByParentId: {},
    itemById: {},
  });
  _testGetCache().clear();
});

// ═══════════════════════════════════════════════════════════════════
// Defect CR-8: batchArchive does not invalidate preview cache
//
// BEFORE FIX: use-delete.ts archivePage() correctly calls
// invalidatePreview(pageId) to remove stale preview entries.
// But batchArchive() omits this call entirely.  After a batch
// delete that partially fails and rolls back (invalidateCache),
// reappearing items still have stale preview entries in the
// module-level Map, so the preview panel shows stale data.
//
// FIX: Extract the optimistic batch-delete + preview cleanup into
// a standalone function `batchDeleteWithPreviewCleanup` exported
// from use-delete.ts. This function is called by batchArchive and
// can also be tested directly without React.
// ═══════════════════════════════════════════════════════════════════

describe('Defect CR-8: batchArchive must invalidate preview cache for all deleted items', () => {
  it('batchDeleteWithPreviewCleanup clears preview cache for all deleted items', () => {
    // Setup: multiple pages in the store, all with cached previews
    const items = [
      makeItem({ id: 'page-a', title: 'Page A' }),
      makeItem({ id: 'page-b', title: 'Page B' }),
      makeItem({ id: 'page-c', title: 'Page C' }),
    ];
    seedStore(items, { workspace: items });

    const cache = _testGetCache();
    cache.set('page-a', makePreview('Page A'));
    cache.set('page-b', makePreview('Page B'));
    cache.set('page-c', makePreview('Page C'));

    // Exercise the exported helper that batchArchive uses
    batchDeleteWithPreviewCleanup(['page-a', 'page-b'], 'workspace');

    // Deleted items must have their preview cache cleared
    expect(cache.has('page-a')).toBe(false);
    expect(cache.has('page-b')).toBe(false);
    // Non-deleted item keeps its cache
    expect(cache.has('page-c')).toBe(true);
  });

  it('batchDeleteWithPreviewCleanup clears cache even for items without cached previews', () => {
    const items = [
      makeItem({ id: 'x', title: 'X' }),
      makeItem({ id: 'y', title: 'Y' }),
    ];
    seedStore(items, { workspace: items });

    const cache = _testGetCache();
    // Only 'x' has a cached preview; 'y' does not
    cache.set('x', makePreview('X'));

    // Should not throw for items without cached previews
    batchDeleteWithPreviewCleanup(['x', 'y'], 'workspace');

    expect(cache.has('x')).toBe(false);
    expect(cache.has('y')).toBe(false);
  });

  it('store state is correctly updated by batchDeleteWithPreviewCleanup', () => {
    const parent = makeItem({ id: 'p', title: 'Parent', hasChildren: true });
    const c1 = makeItem({ id: 'c1', title: 'C1', parentId: 'p', parentType: 'page_id' });
    const c2 = makeItem({ id: 'c2', title: 'C2', parentId: 'p', parentType: 'page_id' });
    seedStore([parent, c1, c2], { workspace: [parent], p: [c1, c2] });

    batchDeleteWithPreviewCleanup(['c1', 'c2'], 'p');

    const state = useFinderStore.getState();
    // Items removed from store
    expect(state.itemById['c1']).toBeUndefined();
    expect(state.itemById['c2']).toBeUndefined();
    // Parent children list updated
    expect(state.childrenByParentId['p']).toEqual([]);
    // Parent hasChildren cleared
    expect(state.itemById['p'].hasChildren).toBe(false);
  });
});
