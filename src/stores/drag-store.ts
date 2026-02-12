'use client';

import { create } from 'zustand';
import type { FinderItem } from '@/types/finder';

interface DragStore {
  draggedItem: FinderItem | null;
  dropTargetId: string | null;
  dropTargetType: 'column' | 'item' | null;
  isMoving: boolean;
  moveError: string | null;

  startDrag: (item: FinderItem) => void;
  setDropTarget: (id: string | null, type: 'column' | 'item' | null) => void;
  endDrag: () => void;
  setMoving: (isMoving: boolean) => void;
  setMoveError: (error: string | null) => void;
  clearError: () => void;
}

export const useDragStore = create<DragStore>((set) => ({
  draggedItem: null,
  dropTargetId: null,
  dropTargetType: null,
  isMoving: false,
  moveError: null,

  startDrag: (item) => set({ draggedItem: item, moveError: null }),
  setDropTarget: (id, type) => set({ dropTargetId: id, dropTargetType: type }),
  endDrag: () => set({ draggedItem: null, dropTargetId: null, dropTargetType: null }),
  setMoving: (isMoving) => set({ isMoving }),
  setMoveError: (moveError) => set({ moveError }),
  clearError: () => set({ moveError: null }),
}));
