'use client';

import { useRef, useEffect } from 'react';
import type { FinderItem } from '@/types/finder';

interface ContextMenuProps {
  x: number;
  y: number;
  item: FinderItem;
  onClose: () => void;
}

export function ContextMenu({ x, y, item, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Keep menu within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 100,
  };

  return (
    <div
      ref={ref}
      className="min-w-[160px] rounded-md border border-gray-200 bg-white py-0.5 shadow-lg dark:border-white/15 dark:bg-zinc-800"
      style={style}
    >
      <button
        type="button"
        onClick={() => {
          window.open(item.url, '_blank');
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
      >
        Open in Notion
      </button>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(item.id);
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
      >
        Copy ID
      </button>
      <div className="my-0.5 border-t border-gray-200 dark:border-white/10" />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(item.url);
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
      >
        Copy Link
      </button>
    </div>
  );
}
