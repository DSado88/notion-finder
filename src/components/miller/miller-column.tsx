'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFinderStore } from '@/stores/finder-store';
import { useDragStore } from '@/stores/drag-store';
import { useChildren } from '@/hooks/use-children';
import { useMove } from '@/hooks/use-move';
import { useCreate } from '@/hooks/use-create';
import { useRename } from '@/hooks/use-rename';
import { useDelete } from '@/hooks/use-delete';
import { prefetchPreview } from '@/hooks/use-preview';
import { MillerItem } from './miller-item';
import { ContextMenu } from './context-menu';
import type { FinderItem, SortField, SortDirection } from '@/types/finder';

const DEFAULT_WIDTH = 240;
const EMPTY_IDS: string[] = [];
const SORT_CHOICES: { field: SortField; direction: SortDirection; label: string }[] = [
  { field: 'title', direction: 'asc', label: 'Name (A to Z)' },
  { field: 'title', direction: 'desc', label: 'Name (Z to A)' },
  { field: 'lastEdited', direction: 'desc', label: 'Modified (Newest First)' },
  { field: 'lastEdited', direction: 'asc', label: 'Modified (Oldest First)' },
  { field: 'created', direction: 'desc', label: 'Created (Newest First)' },
  { field: 'created', direction: 'asc', label: 'Created (Oldest First)' },
];
const SORT_SHORT_LABELS: Record<string, string> = {
  'title-asc': 'A\u2013Z',
  'title-desc': 'Z\u2013A',
  'lastEdited-desc': 'Newest',
  'lastEdited-asc': 'Oldest',
  'created-desc': 'Newest',
  'created-asc': 'Oldest',
};

function sortItems(items: FinderItem[], field: SortField, direction: SortDirection): FinderItem[] {
  const sorted = [...items].sort((a, b) => {
    switch (field) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'lastEdited':
        return (a.lastEditedTime || '').localeCompare(b.lastEditedTime || '');
      case 'created':
        return (a.createdTime || '').localeCompare(b.createdTime || '');
    }
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}

interface MillerColumnProps {
  columnIndex: number;
  parentId: string;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="h-6 animate-pulse rounded bg-gray-100 dark:bg-white/5"
          style={{ width: `${60 + Math.random() * 35}%` }}
        />
      ))}
    </div>
  );
}

function SortDropdown({
  sortField,
  sortDirection,
  onSelect,
  onClose,
}: {
  sortField: SortField;
  sortDirection: SortDirection;
  onSelect: (field: SortField, direction: SortDirection) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-0.5 min-w-[180px] rounded-md border border-gray-200 bg-white py-0.5 shadow-lg dark:border-white/15 dark:bg-zinc-800"
    >
      {SORT_CHOICES.map(({ field, direction, label }) => {
        const isActive = sortField === field && sortDirection === direction;
        return (
          <button
            key={`${field}-${direction}`}
            type="button"
            onClick={() => {
              onSelect(field, direction);
              onClose();
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-gray-100 dark:hover:bg-white/10 ${
              isActive ? 'bg-gray-50 dark:bg-white/5' : ''
            }`}
          >
            <span className="w-3.5 text-[10px] text-blue-500">
              {isActive ? '\u2713' : ''}
            </span>
            <span className={isActive ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ResizeHandle({
  columnIndex,
  currentWidth,
}: {
  columnIndex: number;
  currentWidth: number;
}) {
  const setColumnWidth = useFinderStore((s) => s.setColumnWidth);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;

      const onMouseMove = (ev: MouseEvent) => {
        setColumnWidth(columnIndex, startWidth + (ev.clientX - startX));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [columnIndex, currentWidth, setColumnWidth],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50"
    />
  );
}

export function MillerColumn({ columnIndex, parentId }: MillerColumnProps) {
  const selectedId = useFinderStore((s) => s.selections[columnIndex]);
  const selectItem = useFinderStore((s) => s.selectItem);
  const parentTitle = useFinderStore((s) =>
    parentId === 'workspace' ? 'Workspace' : (s.itemById[parentId]?.title || parentId.slice(0, 8)),
  );
  const parentType = useFinderStore((s) =>
    parentId === 'workspace' ? 'page' : (s.itemById[parentId]?.type ?? 'page'),
  );
  const columnSortState = useFinderStore((s) => s.columnSort[columnIndex]);
  const setColumnSort = useFinderStore((s) => s.setColumnSort);
  const columnWidth = useFinderStore((s) => s.columnWidths[columnIndex] ?? DEFAULT_WIDTH);

  // Multi-select
  const multiSelections = useFinderStore((s) => s.multiSelections[columnIndex] ?? EMPTY_IDS);
  const toggleMultiSelect = useFinderStore((s) => s.toggleMultiSelect);
  const setMultiSelection = useFinderStore((s) => s.setMultiSelection);

  // Editing
  const editingItemId = useFinderStore((s) => s.editingItemId);
  const startEditing = useFinderStore((s) => s.startEditing);
  const stopEditing = useFinderStore((s) => s.stopEditing);

  // Delete
  const setPendingDelete = useFinderStore((s) => s.setPendingDelete);

  const sortField: SortField = columnSortState?.field ?? 'title';
  const sortDirection: SortDirection = columnSortState?.direction ?? 'asc';
  const { children: rawChildren, isLoading, error } = useChildren(parentId);

  // Hooks
  const { createPage } = useCreate();
  const { renamePage } = useRename();
  const { movePage } = useMove();

  // Drag state
  const isColumnDropTarget = useDragStore(
    (s) => s.dropTargetId === parentId && s.dropTargetType === 'column',
  );
  const setDropTarget = useDragStore((s) => s.setDropTarget);
  const endDrag = useDragStore((s) => s.endDrag);
  const setMoveError = useDragStore((s) => s.setMoveError);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: FinderItem } | null>(null);
  const skipNextClickRef = useRef(false);

  const children = useMemo(
    () => sortItems(rawChildren, sortField, sortDirection),
    [rawChildren, sortField, sortDirection],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 10,
  });

  // Auto-scroll to selected item (e.g. after create)
  useEffect(() => {
    if (!selectedId) return;
    const idx = children.findIndex((c) => c.id === selectedId);
    if (idx !== -1) virtualizer.scrollToIndex(idx, { align: 'auto' });
  }, [selectedId, children, virtualizer]);

  // Click handler with modifier key support
  const handleClick = useCallback(
    (item: FinderItem, e: React.MouseEvent) => {
      // Skip synthetic click from Enter keyup after triggering rename
      if (skipNextClickRef.current) {
        skipNextClickRef.current = false;
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+Click: toggle multi-select without navigating
        toggleMultiSelect(columnIndex, item.id);
      } else if (e.shiftKey) {
        // Shift+Click: range-select using sorted children
        const store = useFinderStore.getState();
        const anchor = store.selectionAnchor[columnIndex];
        if (!anchor) {
          // No anchor — treat as plain click
          selectItem(columnIndex, item.id);
          return;
        }
        const anchorIdx = children.findIndex((c) => c.id === anchor);
        const targetIdx = children.findIndex((c) => c.id === item.id);
        if (anchorIdx === -1 || targetIdx === -1) {
          selectItem(columnIndex, item.id);
          return;
        }
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const rangeIds = children.slice(start, end + 1).map((c) => c.id);
        setMultiSelection(columnIndex, rangeIds);
      } else {
        // Plain click: navigate (clears multi-select via selectItem)
        selectItem(columnIndex, item.id);
      }
    },
    [columnIndex, children, selectItem, toggleMultiSelect, setMultiSelection],
  );

  const handleDoubleClick = useCallback(
    (item: FinderItem) => {
      if (item.type === 'page') startEditing(item.id);
    },
    [startEditing],
  );

  // Prefetch preview on hover (debounced to avoid spamming)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const handleMouseEnter = useCallback((item: FinderItem) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => prefetchPreview(item), 150);
  }, []);

  const handleRenameConfirm = useCallback(
    async (itemId: string, newTitle: string) => {
      try {
        await renamePage(itemId, newTitle);
      } catch {
        // Rollback handled by hook; title silently reverts
      }
    },
    [renamePage],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, item: FinderItem) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const handleContextRename = useCallback(
    (item: FinderItem) => {
      startEditing(item.id);
    },
    [startEditing],
  );

  const handleContextCreate = useCallback(
    async (ctxParentId: string) => {
      // Select the parent first so its column opens (or will open via optimisticCreate)
      selectItem(columnIndex, ctxParentId);
      // createPage calls optimisticCreate which extends columnPath for leaf parents,
      // then calls selectItem on the new child in the next column
      try {
        await createPage(ctxParentId, columnIndex + 1);
      } catch {
        // Create failed — optimisticCreate wasn't called, no cleanup needed
      }
    },
    [columnIndex, selectItem, createPage],
  );

  const handleContextDelete = useCallback(
    (item: FinderItem) => {
      setPendingDelete({ items: [item], parentId });
    },
    [parentId, setPendingDelete],
  );

  // Create page in current column
  const handleCreateInColumn = useCallback(async () => {
    try {
      await createPage(parentId, columnIndex);
    } catch {
      // Create failed — no optimistic state to clean up (create is server-first)
    }
  }, [parentId, columnIndex, createPage]);

  // Execute a move drop
  const executeDrop = useCallback(
    async (targetId: string) => {
      const store = useDragStore.getState();
      const item = store.draggedItem;
      store.endDrag();
      if (!item) return;

      try {
        await movePage(item.id, targetId, item.parentId);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : 'Move failed');
      }
    },
    [setMoveError, movePage],
  );

  // Column-level drag handlers
  const handleColumnDragOver = useCallback(
    (e: React.DragEvent) => {
      const store = useDragStore.getState();
      if (!store.draggedItem || parentType === 'database') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (store.draggedItem.parentId !== parentId) {
        setDropTarget(parentId, 'column');
      }
    },
    [parentId, parentType, setDropTarget],
  );

  const handleColumnDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      const store = useDragStore.getState();
      if (store.dropTargetId === parentId) setDropTarget(null, null);
    },
    [parentId, setDropTarget],
  );

  const handleColumnDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const store = useDragStore.getState();
      if (store.dropTargetType === 'item' && store.dropTargetId) {
        executeDrop(store.dropTargetId);
      } else if (store.draggedItem?.parentId !== parentId) {
        executeDrop(parentId);
      } else {
        endDrag();
      }
    },
    [parentId, executeDrop, endDrag],
  );

  // Keyboard navigation
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keys while editing
      if (editingItemId) return;

      if (children.length === 0) return;

      const currentIndex = selectedId
        ? children.findIndex((c) => c.id === selectedId)
        : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, children.length - 1);
        selectItem(columnIndex, children[nextIndex].id);
        virtualizer.scrollToIndex(nextIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        selectItem(columnIndex, children[prevIndex].id);
        virtualizer.scrollToIndex(prevIndex);
      } else if ((e.key === 'Enter' || e.key === 'F2') && selectedId) {
        // Enter/F2: start rename on selected page (if no multi-select active)
        const store = useFinderStore.getState();
        const multi = store.multiSelections[columnIndex] ?? [];
        if (multi.length === 0) {
          const item = store.itemById[selectedId];
          if (item?.type === 'page') {
            e.preventDefault();
            skipNextClickRef.current = true;
            startEditing(selectedId);
          }
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey) {
        // Delete/Backspace: archive selected items
        const store = useFinderStore.getState();
        const multi = store.multiSelections[columnIndex] ?? [];
        if (multi.length > 0) {
          // Bulk delete from multi-selection
          const items = multi
            .map((id) => store.itemById[id])
            .filter((item): item is FinderItem => item != null && item.type === 'page');
          if (items.length > 0) {
            e.preventDefault();
            setPendingDelete({ items, parentId });
          }
        } else if (selectedId) {
          const item = store.itemById[selectedId];
          if (item?.type === 'page') {
            e.preventDefault();
            setPendingDelete({ items: [item], parentId });
          }
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [children, selectedId, columnIndex, selectItem, virtualizer, editingItemId, startEditing, setPendingDelete, parentId]);

  const sortKey = `${sortField}-${sortDirection}`;
  const shortLabel = SORT_SHORT_LABELS[sortKey] ?? 'A\u2013Z';

  return (
    <div
      ref={columnRef}
      tabIndex={0}
      className="relative flex h-full flex-none flex-col outline-none"
      style={{ width: columnWidth, borderRight: '1px solid var(--border)' }}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
    >
      {/* Column header */}
      <div
        className={`relative flex h-7 flex-none items-center px-2.5 transition-colors ${
          isColumnDropTarget
            ? 'bg-blue-50 dark:bg-blue-900/20'
            : ''
        }`}
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="truncate text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {parentTitle}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/* Create page button */}
          {parentType !== 'database' && (
            <button
              type="button"
              onClick={handleCreateInColumn}
              className="rounded px-1 py-0.5 text-[11px] opacity-40 transition-opacity hover:opacity-70"
              title="New page"
            >
              +
            </button>
          )}
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] opacity-40 transition-opacity hover:opacity-70"
              title="Change sort order"
            >
              <span>{shortLabel}</span>
              <span className="text-[7px]">{'\u25BC'}</span>
            </button>
          )}
          {children.length > 0 && (
            <span className="text-[10px] tabular-nums opacity-40">
              {children.length}
            </span>
          )}
        </div>
        {showSortMenu && (
          <SortDropdown
            sortField={sortField}
            sortDirection={sortDirection}
            onSelect={(field, dir) => setColumnSort(columnIndex, field, dir)}
            onClose={() => setShowSortMenu(false)}
          />
        )}
      </div>

      {/* Content */}
      {isLoading && <LoadingSkeleton />}

      {error && (
        <div className="flex flex-1 items-center justify-center p-3">
          <span className="text-xs text-red-500">{error}</span>
        </div>
      )}

      {!isLoading && !error && children.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">No items</span>
        </div>
      )}

      {!isLoading && !error && children.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = children[virtualRow.index];
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <MillerItem
                    item={item}
                    isSelected={selectedId === item.id}
                    isMultiSelected={multiSelections.includes(item.id)}
                    isEditing={editingItemId === item.id}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}
                    onRenameConfirm={handleRenameConfirm}
                    onRenameCancel={stopEditing}
                    onMouseEnter={handleMouseEnter}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resize handle */}
      <ResizeHandle columnIndex={columnIndex} currentWidth={columnWidth} />

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          item={ctxMenu.item}
          onClose={() => setCtxMenu(null)}
          onRename={handleContextRename}
          onCreate={handleContextCreate}
          onDelete={handleContextDelete}
        />
      )}
    </div>
  );
}
