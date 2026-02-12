'use client';

import { useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFinderStore } from '@/stores/finder-store';
import { useDragStore } from '@/stores/drag-store';
import { MillerColumn } from './miller-column';

export function MillerContainer() {
  const columnPath = useFinderStore(useShallow((s) => s.columnPath));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to rightmost column when a new column is added
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    });
  }, [columnPath.length]);

  // Safety cleanup: clear drag state if drop happens outside any valid target
  useEffect(() => {
    const handleDragEnd = () => {
      useDragStore.getState().endDrag();
    };
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex min-w-0 shrink overflow-x-auto overflow-y-hidden"
    >
      {columnPath.map((parentId, index) => (
        <MillerColumn
          key={`${parentId}-${index}`}
          columnIndex={index}
          parentId={parentId}
        />
      ))}
    </div>
  );
}
