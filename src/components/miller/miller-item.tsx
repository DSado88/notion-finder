'use client';

import { memo } from 'react';
import type { FinderItem, NotionIcon } from '@/types/finder';

interface MillerItemProps {
  item: FinderItem;
  isSelected: boolean;
  onClick: (item: FinderItem) => void;
}

function renderIcon(icon: NotionIcon | null, type: FinderItem['type']) {
  if (icon?.type === 'emoji' && icon.emoji) {
    return <span className="mr-1.5 text-sm leading-none">{icon.emoji}</span>;
  }
  // Default icons
  if (type === 'database') {
    return <span className="mr-1.5 text-xs leading-none opacity-50">&#x1F5C3;</span>;
  }
  return <span className="mr-1.5 text-xs leading-none opacity-50">&#x1F4C4;</span>;
}

export const MillerItem = memo(
  function MillerItem({ item, isSelected, onClick }: MillerItemProps) {
    return (
      <button
        type="button"
        onClick={() => onClick(item)}
        className={`
          flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-5
          outline-none transition-colors
          ${isSelected
            ? 'bg-blue-500 text-white'
            : 'text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-white/5'
          }
        `}
      >
        {renderIcon(item.icon, item.type)}
        <span className="min-w-0 flex-1 truncate">{item.title || 'Untitled'}</span>
        {item.hasChildren && (
          <span className={`ml-1 text-xs ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
            &#x203A;
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.isSelected === next.isSelected &&
    prev.item.hasChildren === next.item.hasChildren,
);
