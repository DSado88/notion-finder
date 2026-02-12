'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFinderStore } from '@/stores/finder-store';
import { useDragStore } from '@/stores/drag-store';
import { useChildren } from '@/hooks/use-children';
import { useMove } from '@/hooks/use-move';
import { MillerItem } from './miller-item';
import { ContextMenu } from './context-menu';
import type { FinderItem, SortField, SortDirection } from '@/types/finder';

const DEFAULT_WIDTH = 240;
const SORT_CHOICES: { field: SortField; direction: SortDirection; label: string }[] = [
  { field: 'title', direction: 'asc', label: 'Name (A to Z)' },
  { field: 'title', direction: 'desc', label: 'Name (Z to A)' },
  { field: 'lastEdited', direction: 'desc', label: 'Modified (Newest First)' },
  { field: 'lastEdited', direction: 'asc', label: 'Modified (Oldest First)' },
  { field: 'created', direction: 'desc', label: 'Created (Newest First)' },
  { field: 'created', direction: 'asc', label: 'Created (Oldest First)' },
];
const SORT_SHORT_LABELS: Record<string, string> = {
  'title-asc': 'A–Z',
  'title-desc': 'Z–A',
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
  const sortField: SortField = columnSortState?.field ?? 'title';
  const sortDirection: SortDirection = columnSortState?.direction ?? 'asc';
  const { children: rawChildren, isLoading, error } = useChildren(parentId);

  // Drag state — render-cycle values for visual highlighting only
  const isColumnDropTarget = useDragStore(
    (s) => s.dropTargetId === parentId && s.dropTargetType === 'column',
  );
  // Actions + imperative store access used in event handlers
  const setDropTarget = useDragStore((s) => s.setDropTarget);
  const endDrag = useDragStore((s) => s.endDrag);
  const setMoving = useDragStore((s) => s.setMoving);
  const setMoveError = useDragStore((s) => s.setMoveError);
  const { movePage } = useMove();

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: FinderItem } | null>(null);

  const children = useMemo(
    () => sortItems(rawChildren, sortField, sortDirection),
    [rawChildren, sortField, sortDirection],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  const handleClick = useCallback(
    (item: FinderItem) => {
      selectItem(columnIndex, item.id);
    },
    [columnIndex, selectItem],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, item: FinderItem) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // Execute a move drop — reads store imperatively to avoid stale closure
  const executeDrop = useCallback(
    async (targetId: string) => {
      const store = useDragStore.getState();
      const item = store.draggedItem;
      store.endDrag();
      if (!item || store.isMoving) return;

      setMoving(true);
      try {
        await movePage(item.id, targetId, item.parentId);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : 'Move failed');
      } finally {
        setMoving(false);
      }
    },
    [setMoving, setMoveError, movePage],
  );

  // Column-level drag handlers — read store directly (not render-cycle state)
  // to avoid stale draggedItem after async React re-render
  const handleColumnDragOver = useCallback(
    (e: React.DragEvent) => {
      const store = useDragStore.getState();
      if (!store.draggedItem || parentType === 'database') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Only highlight column header as target for cross-parent moves
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
        // Item-level drop: move into that specific item
        executeDrop(store.dropTargetId);
      } else if (store.draggedItem?.parentId !== parentId) {
        // Column-level drop: move into this column's parent (cross-parent only)
        executeDrop(parentId);
      } else {
        // Same parent, no item target — no-op
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
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [children, selectedId, columnIndex, selectItem, virtualizer]);

  const sortKey = `${sortField}-${sortDirection}`;
  const shortLabel = SORT_SHORT_LABELS[sortKey] ?? 'A–Z';

  return (
    <div
      ref={columnRef}
      tabIndex={0}
      className="relative flex h-full flex-none flex-col border-r border-gray-200 outline-none focus-within:bg-white dark:border-white/10 dark:focus-within:bg-white/[0.01]"
      style={{ width: columnWidth }}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
    >
      {/* Column header */}
      <div
        className={`relative flex h-7 flex-none items-center border-b px-2.5 transition-colors ${
          isColumnDropTarget
            ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
            : 'border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.02]'
        }`}
      >
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {parentTitle}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-300"
              title="Change sort order"
            >
              <span>{shortLabel}</span>
              <span className="text-[7px]">{'\u25BC'}</span>
            </button>
          )}
          {children.length > 0 && (
            <span className="text-[10px] tabular-nums text-gray-400">
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
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
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
        />
      )}
    </div>
  );
}
