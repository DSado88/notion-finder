'use client';

import { memo, useCallback } from 'react';
import { useDragStore } from '@/stores/drag-store';
import { InlineEdit } from '@/components/inline-edit';
import type { FinderItem, NotionIcon } from '@/types/finder';

interface MillerItemProps {
  item: FinderItem;
  isSelected: boolean;
  isMultiSelected: boolean;
  isEditing: boolean;
  onClick: (item: FinderItem, e: React.MouseEvent) => void;
  onDoubleClick: (item: FinderItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FinderItem) => void;
  onRenameConfirm: (itemId: string, newTitle: string) => void;
  onRenameCancel: () => void;
  onMouseEnter?: (item: FinderItem) => void;
}

function renderIcon(icon: NotionIcon | null, type: FinderItem['type']) {
  if (icon?.type === 'emoji' && icon.emoji) {
    return <span className="mr-1.5 text-sm leading-none">{icon.emoji}</span>;
  }
  if (type === 'database') {
    return <span className="mr-1.5 text-xs leading-none opacity-50">&#x1F5C3;</span>;
  }
  return <span className="mr-1.5 text-xs leading-none opacity-50">&#x1F4C4;</span>;
}

export const MillerItem = memo(
  function MillerItem({
    item,
    isSelected,
    isMultiSelected,
    isEditing,
    onClick,
    onDoubleClick,
    onContextMenu,
    onRenameConfirm,
    onRenameCancel,
    onMouseEnter,
  }: MillerItemProps) {
    const isDragging = useDragStore((s) => s.draggedItem?.id === item.id);
    const isDropTarget = useDragStore((s) => s.dropTargetId === item.id);
    const startDrag = useDragStore((s) => s.startDrag);
    const endDrag = useDragStore((s) => s.endDrag);
    const setDropTarget = useDragStore((s) => s.setDropTarget);

    const canDrag = item.type === 'page' && !isEditing;

    const handleDragStart = useCallback((e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
      startDrag(item);
    }, [item, startDrag]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      const dragged = useDragStore.getState().draggedItem;
      if (!dragged || dragged.id === item.id || item.type !== 'page') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(item.id, 'item');
    }, [item.id, item.type, setDropTarget]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      const store = useDragStore.getState();
      if (store.dropTargetId === item.id) setDropTarget(null, null);
    }, [item.id, setDropTarget]);

    const highlighted = isSelected || isMultiSelected;

    let className = `flex w-full items-center rounded-[3px] px-2 py-[3px] text-left text-[14px] leading-[1.4] outline-none transition-colors`;

    if (isDragging) {
      className += ' opacity-40';
    } else if (isDropTarget) {
      className += ' bg-blue-100 ring-1 ring-inset ring-blue-400 dark:bg-blue-900/30 dark:ring-blue-500';
    } else if (highlighted) {
      className += ' bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    } else {
      className += ' hover:bg-black/[0.04] dark:hover:bg-white/[0.04]';
    }

    return (
      <button
        type="button"
        draggable={canDrag}
        onClick={(e) => onClick(item, e)}
        onDoubleClick={() => onDoubleClick(item)}
        onContextMenu={(e) => onContextMenu(e, item)}
        onMouseEnter={onMouseEnter ? () => onMouseEnter(item) : undefined}
        onDragStart={canDrag ? handleDragStart : undefined}
        onDragEnd={endDrag}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={className}
      >
        {renderIcon(item.icon, item.type)}
        {isEditing ? (
          <InlineEdit
            value={item.title || 'Untitled'}
            onConfirm={(title) => onRenameConfirm(item.id, title)}
            onCancel={onRenameCancel}
            className="min-w-0 flex-1 rounded-sm bg-white px-0.5 text-[14px] leading-[1.4] text-gray-900 outline-none ring-1 ring-blue-400 dark:bg-zinc-800 dark:text-gray-100"
            stopPropagation
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{item.title || 'Untitled'}</span>
        )}
        {item.hasChildren && (
          <span className="ml-1 text-xs opacity-40">
            &#x203A;
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.isSelected === next.isSelected &&
    prev.isMultiSelected === next.isMultiSelected &&
    prev.isEditing === next.isEditing &&
    prev.item.hasChildren === next.item.hasChildren &&
    prev.item.title === next.item.title,
);
