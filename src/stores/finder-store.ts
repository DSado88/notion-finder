'use client';

import { create } from 'zustand';
import type { FinderItem } from '@/types/finder';

interface FinderStore {
  // ---- Navigation State ----
  viewMode: 'miller' | 'list';
  /** Parent IDs for each visible column. 'workspace' = root. */
  columnPath: string[];
  /** columnIndex → selected item ID */
  selections: Record<number, string>;
  previewTargetId: string | null;

  // ---- Normalized Caches ----
  childrenByParentId: Record<string, FinderItem[]>;
  itemById: Record<string, FinderItem>;

  // ---- Actions ----
  selectItem: (columnIndex: number, itemId: string) => void;
  setChildren: (parentId: string, items: FinderItem[]) => void;
  invalidateCache: (parentIds: string[]) => void;
  setViewMode: (mode: 'miller' | 'list') => void;
  breadcrumbClick: (segmentIndex: number) => void;
}

export const useFinderStore = create<FinderStore>((set) => ({
  viewMode: 'miller',
  columnPath: ['workspace'],
  selections: {},
  previewTargetId: null,
  childrenByParentId: {},
  itemById: {},

  selectItem: (columnIndex, itemId) =>
    set((state) => {
      const item = state.itemById[itemId];

      // Truncate columns beyond current + 1
      const newColumnPath = state.columnPath.slice(0, columnIndex + 1);

      // If item has children, open its column
      if (item?.hasChildren) {
        newColumnPath.push(itemId);
      }

      // Build new selections: keep up to columnIndex, clear deeper
      const newSelections: Record<number, string> = {};
      for (let i = 0; i <= columnIndex; i++) {
        if (i === columnIndex) {
          newSelections[i] = itemId;
        } else if (state.selections[i]) {
          newSelections[i] = state.selections[i];
        }
      }

      return {
        columnPath: newColumnPath,
        selections: newSelections,
        previewTargetId: itemId,
      };
    }),

  setChildren: (parentId, items) =>
    set((state) => {
      const newItemById = { ...state.itemById };
      for (const item of items) {
        newItemById[item.id] = item;
      }
      return {
        childrenByParentId: {
          ...state.childrenByParentId,
          [parentId]: items,
        },
        itemById: newItemById,
      };
    }),

  invalidateCache: (parentIds) =>
    set((state) => {
      const newCache = { ...state.childrenByParentId };
      for (const id of parentIds) {
        delete newCache[id];
      }
      return { childrenByParentId: newCache };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  breadcrumbClick: (segmentIndex) =>
    set((state) => {
      const newColumnPath = state.columnPath.slice(0, segmentIndex + 1);
      const newSelections: Record<number, string> = {};
      for (let i = 0; i < segmentIndex; i++) {
        if (state.selections[i]) {
          newSelections[i] = state.selections[i];
        }
      }
      return {
        columnPath: newColumnPath,
        selections: newSelections,
        previewTargetId: newColumnPath.length > 1
          ? newColumnPath[newColumnPath.length - 1]
          : null,
      };
    }),
}));
