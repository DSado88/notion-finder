'use client';

import { useRef, useEffect } from 'react';
import type { FinderItem } from '@/types/finder';

interface ContextMenuProps {
  x: number;
  y: number;
  item: FinderItem;
  onClose: () => void;
  onRename: (item: FinderItem) => void;
  onCreate: (parentId: string) => void;
  onDelete: (item: FinderItem) => void;
}

const btnClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10';
const dividerClass = 'my-0.5 border-t border-gray-200 dark:border-white/10';

export function ContextMenu({ x, y, item, onClose, onRename, onCreate, onDelete }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 100,
  };

  const isPage = item.type === 'page';

  return (
    <div
      ref={ref}
      className="min-w-[160px] rounded-md border border-gray-200 bg-white py-0.5 shadow-lg dark:border-white/15 dark:bg-zinc-800"
      style={style}
    >
      <button
        type="button"
        onClick={() => { window.open(item.url, '_blank'); onClose(); }}
        className={btnClass}
      >
        Open in Notion
      </button>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(item.id); onClose(); }}
        className={btnClass}
      >
        Copy ID
      </button>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(item.url); onClose(); }}
        className={btnClass}
      >
        Copy Link
      </button>

      {isPage && (
        <>
          <div className={dividerClass} />
          <button
            type="button"
            onClick={() => { onRename(item); onClose(); }}
            className={btnClass}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => { onCreate(item.id); onClose(); }}
            className={btnClass}
          >
            New Page
          </button>
          <div className={dividerClass} />
          <button
            type="button"
            onClick={() => { onDelete(item); onClose(); }}
            className={`${btnClass} !text-red-500 dark:!text-red-400`}
          >
            Archive
          </button>
        </>
      )}
    </div>
  );
}
