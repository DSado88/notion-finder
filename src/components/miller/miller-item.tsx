'use client';

import { memo, useCallback } from 'react';
import { useDragStore } from '@/stores/drag-store';
import { InlineEdit } from '@/components/inline-edit';
import { ItemIcon } from '@/components/item-icon';
import type { FinderItem } from '@/types/finder';

interface MillerItemProps {
  item: FinderItem;
  isSelected: boolean;
  isMultiSelected: boolean;
  isEditing: boolean;
  rowIndex?: number;
  onClick: (item: FinderItem, e: React.MouseEvent) => void;
  onDoubleClick: (item: FinderItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FinderItem) => void;
  onRenameConfirm: (itemId: string, newTitle: string) => void;
  onRenameCancel: () => void;
  onMouseEnter?: (item: FinderItem) => void;
}

export const MillerItem = memo(
  function MillerItem({
    item,
    isSelected,
    isMultiSelected,
    isEditing,
    rowIndex = 0,
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

    let className = 'flex w-full items-center rounded-md px-2 py-[3px] text-left text-[13px] leading-[1.45] outline-none transition-colors';

    if (isDragging) {
      className += ' opacity-40';
    } else if (isDropTarget) {
      className += ' bg-blue-100 ring-1 ring-inset ring-blue-400 dark:bg-blue-900/30 dark:ring-blue-500';
    } else if (highlighted) {
      className += ' text-white';
    } else if (rowIndex % 2 === 1) {
      className += ' hover:bg-black/[0.06] dark:hover:bg-white/[0.06]';
    } else {
      className += ' hover:bg-black/[0.06] dark:hover:bg-white/[0.06]';
    }

    const style: React.CSSProperties = {};
    if (highlighted && !isDragging && !isDropTarget) {
      style.background = 'var(--selection-bg)';
    } else if (!isDragging && !isDropTarget && !highlighted && rowIndex % 2 === 1) {
      style.background = 'var(--row-alt)';
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
        style={style}
      >
        <ItemIcon icon={item.icon} type={item.type} className="mr-1.5 w-5 flex-none text-center" />
        {isEditing ? (
          <InlineEdit
            value={item.title || 'Untitled'}
            onConfirm={(title) => onRenameConfirm(item.id, title)}
            onCancel={onRenameCancel}
            className="min-w-0 flex-1 rounded-sm bg-white px-0.5 text-[13px] leading-[1.45] text-gray-900 outline-none ring-1 ring-blue-400 dark:bg-zinc-800 dark:text-gray-100"
            stopPropagation
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{item.title || 'Untitled'}</span>
        )}
        {item.hasChildren && (
          <span className={`ml-1 flex-none text-[11px] ${highlighted ? 'opacity-70' : 'opacity-40'}`}>
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
    prev.rowIndex === next.rowIndex &&
    prev.item.hasChildren === next.item.hasChildren &&
    prev.item.title === next.item.title,
);
