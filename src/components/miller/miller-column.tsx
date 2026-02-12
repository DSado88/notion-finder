'use client';

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFinderStore } from '@/stores/finder-store';
import { useChildren } from '@/hooks/use-children';
import { MillerItem } from './miller-item';
import type { FinderItem } from '@/types/finder';

interface MillerColumnProps {
  columnIndex: number;
  parentId: string;
}

export function MillerColumn({ columnIndex, parentId }: MillerColumnProps) {
  const selectedId = useFinderStore((s) => s.selections[columnIndex]);
  const selectItem = useFinderStore((s) => s.selectItem);
  const parentTitle = useFinderStore((s) =>
    parentId === 'workspace' ? 'Workspace' : (s.itemById[parentId]?.title || parentId.slice(0, 8)),
  );
  const { children, isLoading, error } = useChildren(parentId);

  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex h-full w-56 flex-none flex-col border-r border-gray-200 dark:border-white/10">
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
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center p-3">
          <span className="text-xs text-red-500">{error}</span>
        </div>
      )}

      {!isLoading && !error && (
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
