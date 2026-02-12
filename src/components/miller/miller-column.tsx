'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFinderStore } from '@/stores/finder-store';
import { useChildren } from '@/hooks/use-children';
import { MillerItem } from './miller-item';
import type { FinderItem } from '@/types/finder';

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

export function MillerColumn({ columnIndex, parentId }: MillerColumnProps) {
  const selectedId = useFinderStore((s) => s.selections[columnIndex]);
  const selectItem = useFinderStore((s) => s.selectItem);
  const parentTitle = useFinderStore((s) =>
    parentId === 'workspace' ? 'Workspace' : (s.itemById[parentId]?.title || parentId.slice(0, 8)),
  );
  const { children, isLoading, error } = useChildren(parentId);

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

  return (
    <div
      ref={columnRef}
      tabIndex={0}
      className="flex h-full w-56 flex-none flex-col border-r border-gray-200 outline-none focus-within:bg-white dark:border-white/10 dark:focus-within:bg-white/[0.01]"
    >
      {/* Column header */}
      <div className="flex h-7 flex-none items-center border-b border-gray-200 bg-gray-50/80 px-2.5 dark:border-white/10 dark:bg-white/[0.02]">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {parentTitle}
        </span>
        {children.length > 0 && (
          <span className="ml-auto text-[10px] tabular-nums text-gray-400">
            {children.length}
          </span>
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
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
