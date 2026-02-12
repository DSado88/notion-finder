'use client';

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useDragStore } from '@/stores/drag-store';
import { useFinderStore } from '@/stores/finder-store';
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

    const [draftTitle, setDraftTitle] = useState(item.title || 'Untitled');
    const inputRef = useRef<HTMLInputElement>(null);
    const confirmedRef = useRef(false);
    const readyRef = useRef(false);

    // Focus input when entering edit mode (rAF to avoid immediate blur from triggering click/Enter)
    useEffect(() => {
      if (isEditing && inputRef.current) {
        confirmedRef.current = false;
        readyRef.current = false;
        setDraftTitle(item.title || 'Untitled');
        const rafId = requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
            readyRef.current = true;
          }
        });
        return () => cancelAnimationFrame(rafId);
      }
    }, [isEditing, item.title]);

    // Cancel edit on unmount (virtualization safety)
    const stopEditing = useFinderStore((s) => s.stopEditing);
    useEffect(() => {
      if (!isEditing) return;
      return () => {
        // Only cancel on real unmounts (readyRef guards against React strict mode double-mount)
        if (!confirmedRef.current && readyRef.current) stopEditing();
      };
    }, [isEditing, stopEditing]);

    const handleConfirm = useCallback(() => {
      if (!readyRef.current) return;
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      onRenameConfirm(item.id, draftTitle);
    }, [item.id, draftTitle, onRenameConfirm]);

    const handleCancel = useCallback(() => {
      confirmedRef.current = true;
      onRenameCancel();
    }, [onRenameCancel]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      },
      [handleConfirm, handleCancel],
    );

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
          <input
            ref={inputRef}
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleConfirm}
            className="min-w-0 flex-1 rounded-sm bg-white px-0.5 text-[14px] leading-[1.4] text-gray-900 outline-none ring-1 ring-blue-400 dark:bg-zinc-800 dark:text-gray-100"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
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
